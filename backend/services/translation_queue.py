"""
Always-on translation queue.

Unlike the one-shot bulk job, this service runs forever in the backend
process. It pulls pending items from the `translation_queue` table, packs
them into batches by (book_id, target_language), translates them through
Gemini, and writes the result to the `translations` table.

Key behaviours
--------------
- **Singleton worker**, launched once from the FastAPI lifespan.
- Stops cleanly on shutdown via an asyncio.Event.
- When the queue is empty, the worker idles for IDLE_POLL_SECONDS and re-checks.
- Hitting the rate limiter just makes the worker wait — that's the limiter's
  job. If a single batch fails, attempts are bumped and the row goes back to
  pending; after MAX_ATTEMPTS it's marked failed (still re-tryable from the
  admin UI by resetting status).
- API key is read from `app_settings.queue_api_key` (encrypted). If no key is
  configured, the worker logs once and idles — admins can set a key without
  restarting the backend.
- Auto-enqueue: `enqueue_for_book` is called from `save_book` to seed the
  queue whenever a new book lands. The set of target languages comes from
  `app_settings.auto_translate_languages` (JSON array of language codes).
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Optional

import aiosqlite

from services import db as db_module
from services.auth import decrypt_api_key
from services.db import (
    get_cached_book,
    get_cached_translation,
    get_setting,
    save_translation,
)
from services.gemini import translate_chapters_batch, TRANSLATOR_MODEL
from services.model_limits import (
    DEFAULT_CHAIN as _DEFAULT_CHAIN,
    estimate_cost_usd,
    estimate_tokens_from_chars,
    limits_for,
)
from services.rate_limiter import AsyncRateLimiter
from services.splitter import build_chapters

logger = logging.getLogger(__name__)


SETTING_API_KEY = "queue_api_key"            # encrypted Gemini key
SETTING_AUTO_LANGS = "auto_translate_languages"  # JSON array of lang codes
SETTING_ENABLED = "queue_enabled"            # "1" or "0"
SETTING_RPM = "queue_rpm"
SETTING_RPD = "queue_rpd"
SETTING_MODEL = "queue_model"                # legacy single-model, kept for compat
SETTING_MODEL_CHAIN = "queue_model_chain"    # JSON list; tried in order on quota
SETTING_MAX_OUTPUT_TOKENS = "queue_max_output_tokens"  # per-request budget

DEFAULT_RPM = 12
DEFAULT_RPD = 1400
IDLE_POLL_SECONDS = 10.0
MAX_ATTEMPTS = 5
# Short outer-retry backoff. Rationale: the chain already tries every model
# in order before the outer retry fires, so if we're here ALL models in the
# chain just failed. Waiting 300s rarely helps — usually a transient burst
# on Google's side recovers within 10-20s. Admins explicitly asked to
# "fail faster" so they can see forward progress.
RETRY_BACKOFF = (1.0, 5.0, 15.0)

# Every time a batch fails, the rows' priority is bumped by this much so the
# worker moves on to other (book, language) groups instead of spinning on
# the same bad one. Rows stay pending and will be retried later when the
# rest of the queue is exhausted, but they no longer block other books.
FAIL_PRIORITY_BUMP = 1000
DEFAULT_PRIORITY = 100

# ── Chapter batching ─────────────────────────────────────────────────────────

DEFAULT_MAX_OUTPUT_TOKENS = 7500
_WORDS_TO_OUTPUT_TOKENS = 1.4


@dataclass
class ChapterWork:
    book_id: int
    book_title: str
    source_language: str
    chapter_index: int
    chapter_text: str


def group_chapters_for_batch(
    chapters: list[ChapterWork],
    *,
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
) -> list[list[ChapterWork]]:
    """Greedily group consecutive chapters so each batch's estimated output
    stays under max_output_tokens."""
    batches: list[list[ChapterWork]] = []
    current: list[ChapterWork] = []
    current_tokens = 0.0
    for ch in chapters:
        words = len(ch.chapter_text.split())
        est = words * _WORDS_TO_OUTPUT_TOKENS
        if current and current_tokens + est > max_output_tokens:
            batches.append(current)
            current = []
            current_tokens = 0.0
        current.append(ch)
        current_tokens += est
    if current:
        batches.append(current)
    return batches


# ── Fallback chain helpers ───────────────────────────────────────────────────

async def get_model_chain() -> list[str]:
    """Return the ordered list of models to try on quota exhaustion.

    Falls back to the legacy single-model setting, then to the curated
    DEFAULT_CHAIN (so first-time admins get a sensible chain without
    having to configure anything).
    """
    raw = await get_setting(SETTING_MODEL_CHAIN)
    if raw:
        try:
            val = json.loads(raw)
            if isinstance(val, list) and val:
                return [str(m) for m in val]
        except json.JSONDecodeError:
            pass
    legacy = await get_setting(SETTING_MODEL)
    if legacy:
        return [legacy]
    return list(_DEFAULT_CHAIN)


def is_quota_error(exc: BaseException) -> bool:
    """Heuristic: did Gemini refuse this call because the key is over quota?

    True → chain advances to next model.
    False (e.g. 503 overloaded, malformed response) → stays on current
    model and lets the outer retry loop back off.
    """
    msg = str(exc).lower()
    return (
        "429" in msg
        or "resource_exhausted" in msg
        or "resource exhausted" in msg
        or "quota" in msg
        or "rate limit" in msg
        or "ratelimit" in msg
    )


# ── Queue row helpers ────────────────────────────────────────────────────────

@dataclass
class QueueRow:
    id: int
    book_id: int
    chapter_index: int
    target_language: str
    status: str
    priority: int
    attempts: int
    last_error: str = ""


async def enqueue(
    book_id: int,
    chapter_index: int,
    target_language: str,
    *,
    priority: int = 100,
    reset_failed: bool = False,
    queued_by: str | None = None,
) -> int:
    """Insert (or no-op) a single queue item.

    If `reset_failed=True`, an existing row whose status is 'failed' or 'done'
    will be revived to 'pending' (used when the admin clicks "Retranslate").

    `queued_by` is a free-form label — usually the admin's email. NULL
    means the row was auto-enqueued by save_book and no admin is attributable.

    Returns rowcount from the underlying write (1 if a new row was
    inserted or an existing row was revived; 0 if the INSERT OR IGNORE
    path no-op'd because a non-stale row already exists).
    """
    target_language = target_language.lower().split("-")[0]
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        if reset_failed:
            cursor = await db.execute(
                """INSERT INTO translation_queue
                       (book_id, chapter_index, target_language, priority, status, queued_by)
                   VALUES (?, ?, ?, ?, 'pending', ?)
                   ON CONFLICT(book_id, chapter_index, target_language) DO UPDATE
                     SET status='pending',
                         attempts=0,
                         last_error=NULL,
                         priority=MIN(priority, excluded.priority),
                         queued_by=COALESCE(excluded.queued_by, queued_by),
                         updated_at=CURRENT_TIMESTAMP""",
                (book_id, chapter_index, target_language, priority, queued_by),
            )
        else:
            cursor = await db.execute(
                """INSERT OR IGNORE INTO translation_queue
                       (book_id, chapter_index, target_language, priority, queued_by)
                   VALUES (?, ?, ?, ?, ?)""",
                (book_id, chapter_index, target_language, priority, queued_by),
            )
        await db.commit()
        return cursor.rowcount


async def enqueue_for_book(
    book_id: int,
    *,
    target_languages: list[str] | None = None,
    priority: int = 100,
    reset_failed: bool = False,
    queued_by: str | None = None,
) -> int:
    """Enqueue every chapter of `book_id` for each target language.

    Skips chapters that already have a cached translation (no point re-doing
    work). Returns the number of newly-enqueued items.

    `target_languages=None` → use the configured auto-translate languages.
    """
    if target_languages is None:
        target_languages = await get_auto_languages()
    if not target_languages:
        return 0

    book = await get_cached_book(book_id)
    if not book or not book.get("text"):
        return 0
    source = (book.get("languages") or [None])[0]
    # Use the SAME splitter resolver the reader uses (HTML-preferring with
    # text fallback). Without this, the reader showed Faust chapter 7
    # with chapter 8's translation — different splitters produced
    # different chapter indexing.
    from services.book_chapters import split_with_html_preference
    chapters = await split_with_html_preference(book_id, book["text"])

    inserted = 0
    for lang in target_languages:
        lang = lang.lower().split("-")[0]
        if not lang or lang == source:
            continue
        for idx, ch in enumerate(chapters):
            if not ch.text.strip():
                continue
            if not reset_failed and await get_cached_translation(book_id, idx, lang):
                continue
            inserted += await enqueue(
                book_id, idx, lang,
                priority=priority,
                reset_failed=reset_failed,
                queued_by=queued_by,
            )
    return inserted


async def get_auto_languages() -> list[str]:
    raw = await get_setting(SETTING_AUTO_LANGS)
    if not raw:
        return []
    try:
        value = json.loads(raw)
        return [str(x) for x in value if x]
    except json.JSONDecodeError:
        return []


async def list_queue(
    *,
    status: str | None = None,
    book_id: int | None = None,
    limit: int = 200,
) -> list[dict]:
    """Return queue rows joined with the book title.

    The book_title field lets the admin UI show "Moby Dick · ch 14 → zh"
    instead of raw IDs. LEFT JOIN so orphan rows (book deleted but queue
    entry remains) still come back with book_title=None.
    """
    where = []
    params: list = []
    if status:
        where.append("q.status = ?")
        params.append(status)
    if book_id is not None:
        where.append("q.book_id = ?")
        params.append(book_id)
    sql = (
        "SELECT q.*, b.title AS book_title FROM translation_queue q "
        "LEFT JOIN books b ON b.id = q.book_id"
    )
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY (q.status='running') DESC, q.priority ASC, q.id ASC LIMIT ?"
    params.append(limit)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(sql, params) as cursor:
            return [dict(row) async for row in cursor]


async def estimate_queue_cost(models: list[str] | None = None) -> dict:
    """Estimate what it will cost to drain every pending queue item on each model.

    Methodology (deliberately rough — pricing and tokenization vary):
    - Sum chapter-text chars across all pending queue rows.
    - Translate that to tokens at CHARS_PER_TOKEN ≈ 3.
    - Output tokens assumed ~= input tokens (literary translation is
      roughly 1:1 in char count; CJK targets cancel out against Latin source).
    - Per-model USD = input_tokens × input_price + output_tokens × output_price.

    Return one row per model plus overall totals so the admin UI can show
    a quick comparison table.
    """
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        # Two-step to avoid LENGTH(b.text) running per-row on a potentially
        # 4000+ row queue: first get pending counts per book, then fetch
        # one LENGTH per distinct book (typically <200). This turns what
        # was a 5s scan into a sub-100ms lookup.
        async with db.execute(
            """SELECT book_id, COUNT(*) AS n
               FROM translation_queue
               WHERE status='pending'
               GROUP BY book_id"""
        ) as cursor:
            book_counts = await cursor.fetchall()

        by_book: dict[int, dict] = {}
        if book_counts:
            ids = [b[0] for b in book_counts]
            placeholders = ",".join("?" for _ in ids)
            async with db.execute(
                f"SELECT id, LENGTH(text) FROM books WHERE id IN ({placeholders})",
                ids,
            ) as cursor:
                text_lengths = dict(await cursor.fetchall())
            for book_id, count in book_counts:
                total_chars = text_lengths.get(book_id)
                if total_chars is None:
                    continue
                by_book[book_id] = {"total_chars": total_chars, "count": count}

    # Total chars of pending work across all books.
    total_chars = 0
    for entry in by_book.values():
        # Heuristic: assume the pending rows are spread across ~50 chapters
        # per book on average. That's a bit handwavy but matches typical novels.
        CHAPTERS_PER_BOOK_GUESS = 50
        per_chapter = max(1, entry["total_chars"] // CHAPTERS_PER_BOOK_GUESS)
        total_chars += per_chapter * entry["count"]

    input_tokens = estimate_tokens_from_chars(total_chars)
    output_tokens = input_tokens  # 1:1 heuristic for translation

    if models is None:
        models = [""] + [m for m in (await get_model_chain()) if m]

    # De-dupe while preserving order
    seen = set()
    models = [m for m in models if not (m in seen or seen.add(m))]

    per_model = []
    for m in models:
        cost = estimate_cost_usd(m, input_tokens, output_tokens)
        per_model.append({
            "model": m or "default",
            "usd": round(cost, 4),
        })
    return {
        "pending_items": sum(e["count"] for e in by_book.values()),
        "pending_books": len(by_book),
        "estimated_input_tokens": input_tokens,
        "estimated_output_tokens": output_tokens,
        "per_model": per_model,
    }


async def queue_summary() -> dict:
    """Counts by status, plus per-(book, language) breakdowns for the UI."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT status, COUNT(*) FROM translation_queue GROUP BY status"
        ) as cursor:
            counts = {row[0]: row[1] async for row in cursor}
        async with db.execute(
            """SELECT book_id, target_language, status, COUNT(*) AS n
               FROM translation_queue GROUP BY book_id, target_language, status"""
        ) as cursor:
            rows = await cursor.fetchall()
    by_book: dict[int, dict[str, dict[str, int]]] = {}
    for book_id, lang, status, n in rows:
        by_book.setdefault(book_id, {}).setdefault(lang, {})[status] = n
    return {"counts": counts, "by_book": by_book}


async def rescan_for_missing_translations(
    progress: "Callable[[int, int, str], None] | None" = None,
) -> int:
    """Walk every cached book and enqueue (book, lang) pairs that are
    configured for auto-translation but have untranslated chapters.

    Skips books that are already FULLY represented in the queue/translations
    for every configured language — avoids re-running the CPU-heavy
    splitter during routine restarts.

    `progress(i, total, title)` is called once per book scanned so the
    admin UI can show "Checking 12/122: Moby Dick" during the rescan.
    """
    langs = await get_auto_languages()
    if not langs:
        return 0
    from services.db import list_cached_books
    books = await list_cached_books()
    if not books:
        return 0

    # Pre-fetch (book_id, lang) pairs that are fully represented in
    # either the translations table or the queue — one query each
    # instead of per-chapter lookups inside enqueue_for_book.
    book_ids = [b["id"] for b in books]
    placeholders = ",".join("?" for _ in book_ids)
    already_covered: set[tuple[int, str]] = set()
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            f"""SELECT book_id, target_language FROM translations
                WHERE book_id IN ({placeholders})
                GROUP BY book_id, target_language""",
            book_ids,
        ) as cursor:
            async for row in cursor:
                already_covered.add((row[0], row[1]))
        async with db.execute(
            f"""SELECT book_id, target_language FROM translation_queue
                WHERE book_id IN ({placeholders})
                GROUP BY book_id, target_language""",
            book_ids,
        ) as cursor:
            async for row in cursor:
                already_covered.add((row[0], row[1]))

    total = 0
    for i, b in enumerate(books):
        if progress is not None:
            progress(i + 1, len(books), (b.get("title") or str(b["id"]))[:60])
        # Only enqueue langs this book hasn't been touched for. If ALL
        # configured langs are already covered, we skip entirely — no
        # splitter run. First-start on a fresh DB still processes everything.
        todo = [lang for lang in langs if (b["id"], lang) not in already_covered]
        if not todo:
            continue
        total += await enqueue_for_book(b["id"], target_languages=todo)
    return total


async def reset_stale_running_rows() -> int:
    """Any row still marked 'running' when the worker starts is stale —
    the previous process crashed or was killed mid-batch. Reset them to
    'pending' so the next claim picks them up. Priority-bumps and
    attempt counts from prior failures are preserved.
    """
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        cursor = await db.execute(
            """UPDATE translation_queue
               SET status='pending', updated_at=CURRENT_TIMESTAMP
               WHERE status='running'""",
        )
        await db.commit()
        return cursor.rowcount


async def cleanup_orphan_done_rows() -> int:
    """Delete stale 'done' queue rows left behind by the previous
    behaviour (UPDATE SET status='done' on completion). If a done
    row lingers after the cache is deleted, `enqueue()`'s
    INSERT OR IGNORE treats the chapter as already queued and
    silently no-ops every future re-enqueue attempt. With the new
    delete-on-success semantics these rows are redundant regardless
    of cache state — clear them on worker startup so deployments
    with pre-existing orphans self-heal without manual intervention.
    """
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM translation_queue WHERE status='done'",
        )
        await db.commit()
        return cursor.rowcount


async def mark_queue_row_done(
    book_id: int, chapter_index: int, target_language: str,
) -> int:
    """Delete any queue row for this (book, chapter, lang) once a
    translation has been cached.

    Called from save_translation so every path that produces a
    translation — reader on-demand, bulk job, manual retranslate,
    queue worker itself — retires the queue row immediately.

    Why delete instead of UPDATE SET status='done'? Previously a
    'done' row stayed in the table after success. If the cache was
    ever deleted afterwards (admin retranslate, DB restore, bug),
    the row survived but the cache didn't — and `enqueue()`'s
    INSERT OR IGNORE silently no-op'd forever, blocking re-translation.
    The `translations` table is the source of truth for what's
    translated; a queue row only makes sense for work still to do.

    Returns the number of rows removed (usually 0 or 1).
    """
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        cursor = await db.execute(
            """DELETE FROM translation_queue
               WHERE book_id=? AND chapter_index=? AND target_language=?""",
            (book_id, chapter_index, target_language),
        )
        await db.commit()
        return cursor.rowcount


async def queue_status_for_chapter(
    book_id: int, chapter_index: int, target_language: str,
) -> dict:
    """User-facing view of one chapter's queue state.

    Used by the reader page to decide whether to fire an on-demand
    translate (not queued) or wait for the background worker (queued).
    """
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT id, status, priority, attempts FROM translation_queue
               WHERE book_id=? AND chapter_index=? AND target_language=?""",
            (book_id, chapter_index, target_language),
        ) as cursor:
            row = await cursor.fetchone()
        if not row:
            return {
                "queued": False, "status": None,
                "position": None, "attempts": 0,
            }
        # Rough position: how many pending rows are ahead of this one in the
        # (priority, id) ordering the worker uses.
        async with db.execute(
            """SELECT COUNT(*) FROM translation_queue
               WHERE status='pending' AND (
                  priority < ? OR (priority = ? AND id < ?)
               )""",
            (row["priority"], row["priority"], row["id"]),
        ) as cursor:
            (ahead,) = await cursor.fetchone()
    # worker_running lets the reader UI tell the user whether the queue
    # will actually process their chapter (admin may have stopped the
    # worker). Without this, "queued · position N" looks identical to
    # "stuck forever".
    worker_running = _worker.is_running() if _worker else False
    return {
        "worker_running": worker_running,
        "queued": row["status"] in ("pending", "running"),
        "status": row["status"],
        "position": (ahead + 1) if row["status"] == "pending" else 0,
        "attempts": row["attempts"],
    }


async def clear_queue(status: str | None = None) -> int:
    """Delete queue rows, optionally filtered by status.

    Running items are always excluded: the worker will still complete their
    translation and call mark_queue_row_done. Deleting a running row would give
    a false sense of cancellation and, worse, mark_queue_row_done would then
    silently delete any re-enqueued pending row for the same (book, chapter, lang).

    Handy for the admin "Clear queue" / "Clear failed" buttons.
    """
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        if status:
            cursor = await db.execute(
                "DELETE FROM translation_queue WHERE status=?", (status,),
            )
        else:
            cursor = await db.execute(
                "DELETE FROM translation_queue WHERE status != 'running'",
            )
        await db.commit()
        return cursor.rowcount


async def delete_queue_item(item_id: int) -> int:
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM translation_queue WHERE id=?", (item_id,),
        )
        await db.commit()
        return cursor.rowcount


async def delete_queue_for_book(
    book_id: int, *, target_language: str | None = None,
) -> int:
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        if target_language:
            cursor = await db.execute(
                "DELETE FROM translation_queue WHERE book_id=? AND target_language=?",
                (book_id, target_language),
            )
        else:
            cursor = await db.execute(
                "DELETE FROM translation_queue WHERE book_id=?", (book_id,),
            )
        await db.commit()
        return cursor.rowcount


# ── Worker ───────────────────────────────────────────────────────────────────

@dataclass
class WorkerState:
    running: bool = False
    enabled: bool = False
    idle: bool = True
    current_book_id: int | None = None
    current_book_title: str = ""
    current_target_language: str = ""
    current_batch_size: int = 0
    current_model: str = ""          # which model is actually being used right now
    # Startup housekeeping visibility: the admin sees which phase the
    # worker is in while it boots (reset_stale → rescan → ready). Once
    # 'ready' the worker is processing batches normally.
    startup_phase: str = ""          # "reset_stale" | "rescan" | "ready"
    startup_progress: str = ""       # human-readable detail ("Checking 12/122: Moby Dick")
    last_completed_at: Optional[str] = None
    last_error: str = ""
    started_at: Optional[str] = None
    requests_made: int = 0
    chapters_done: int = 0
    chapters_failed: int = 0
    waiting_reason: str = ""
    # Live retry state — distinguishes "transiently backing off" from
    # "permanently failed" in the UI. Cleared on a successful call.
    retry_attempt: int = 0          # 1-based; 0 means "not currently retrying"
    retry_max: int = 0              # total attempts allowed (retries + 1)
    retry_delay_seconds: float = 0.0
    retry_next_at: Optional[str] = None  # ISO-8601 UTC timestamp
    retry_reason: str = ""          # short transient error, e.g. "503 UNAVAILABLE"
    total_chapters: int = 0
    skipped_chapters: int = 0
    ended_at: Optional[str] = None
    log: list[dict] = field(default_factory=list)


class TranslationQueueWorker:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop_event: asyncio.Event | None = None
        self._wake_event: asyncio.Event = asyncio.Event()
        self._state = WorkerState()
        # One limiter per model in the chain — each model has its own
        # rolling-window RPM and persisted RPD counter.
        self._limiters: dict[str, AsyncRateLimiter] = {}

    # ── Lifecycle ───────────────────────────────────────────────────────

    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self.is_running():
            return
        self._stop_event = asyncio.Event()
        self._wake_event = asyncio.Event()
        self._state = WorkerState(
            running=True,
            started_at=datetime.now(timezone.utc).isoformat(),
        )
        self._task = asyncio.create_task(self._run(), name="translation-queue-worker")

    async def stop(self) -> None:
        if self._stop_event:
            self._stop_event.set()
        if self._task:
            self._wake_event.set()
            try:
                await asyncio.wait_for(self._task, timeout=20)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()
        self._state.running = False

    def wake(self) -> None:
        """Nudge the worker to re-check the queue immediately (used after
        new items are enqueued)."""
        self._wake_event.set()

    def state(self) -> WorkerState:
        return self._state

    # ── Main loop ────────────────────────────────────────────────────────

    async def _run(self) -> None:
        assert self._stop_event is not None
        stop_event = self._stop_event

        # Startup housekeeping: only reset rows left 'running' from a
        # prior crash. The worker is now PASSIVE — it does NOT scan the
        # library to enqueue missing translations. Translation work is
        # only added to the queue when:
        #   - a user imports a book with target_language (save_book
        #     auto-enqueue for configured auto-translate languages)
        #   - a reader clicks Translate on a chapter (POST /translation)
        #   - the admin manually enqueues via the queue panel
        # Admins who want a blanket rescan can still use the "Queue every
        # book" button in the admin panel.
        try:
            self._state.startup_phase = "reset_stale"
            self._state.startup_progress = "Resetting stale running rows…"
            stale = await reset_stale_running_rows()
            if stale:
                self._append_log({"event": "startup_reset_stale", "count": stale})
            orphans = await cleanup_orphan_done_rows()
            if orphans:
                self._append_log(
                    {"event": "startup_cleanup_done_rows", "count": orphans},
                )
        except Exception:
            logger.exception("Startup housekeeping failed (non-fatal)")
        finally:
            self._state.startup_phase = "ready"
            self._state.startup_progress = ""

        while not stop_event.is_set():
            try:
                await self._tick()
            except Exception as e:  # noqa: BLE001
                logger.exception("Translation queue worker tick failed")
                self._state.last_error = str(e)[:500]
                self._append_log({"event": "tick_error", "error": str(e)[:200]})
                await self._sleep_or_wake(IDLE_POLL_SECONDS)
        self._state.running = False

    async def _tick(self) -> None:
        # Check enabled flag every tick — admins can flip the kill switch
        # without restarting the backend.
        enabled_raw = await get_setting(SETTING_ENABLED)
        self._state.enabled = enabled_raw != "0"
        if not self._state.enabled:
            self._state.idle = True
            self._state.waiting_reason = "service disabled"
            await self._sleep_or_wake(IDLE_POLL_SECONDS)
            return

        api_key = await self._load_api_key()
        if not api_key:
            self._state.idle = True
            self._state.waiting_reason = "no Gemini key configured"
            await self._sleep_or_wake(IDLE_POLL_SECONDS)
            return

        was_idle = self._state.idle

        # Pull one batch's worth of pending items, all sharing the same
        # (book_id, target_language). Batching across books would force us to
        # rebuild prior_context per chapter, which loses the cross-batch
        # consistency benefit.
        items = await self._claim_next_batch()

        if not items:
            if not was_idle and (self._state.chapters_done + self._state.chapters_failed) > 0:
                self._state.ended_at = datetime.now(timezone.utc).isoformat()
            self._state.idle = True
            self._state.waiting_reason = "queue empty"
            self._state.current_book_id = None
            self._state.current_book_title = ""
            self._state.current_target_language = ""
            self._state.current_batch_size = 0
            await self._sleep_or_wake(IDLE_POLL_SECONDS)
            return

        self._state.total_chapters = await self._count_pending()
        self._state.idle = False
        self._state.waiting_reason = ""
        await self._process_batch(items, api_key)

    async def _claim_next_batch(self) -> list[QueueRow]:
        """Atomically grab the next contiguous group of pending items for
        the same (book, language) and mark them running."""
        async with aiosqlite.connect(db_module.DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            await db.execute("BEGIN IMMEDIATE")
            try:
                async with db.execute(
                    """SELECT * FROM translation_queue
                       WHERE status='pending'
                       ORDER BY priority ASC, id ASC LIMIT 1"""
                ) as cursor:
                    head = await cursor.fetchone()
                if head is None:
                    await db.execute("COMMIT")
                    return []
                book_id = head["book_id"]
                lang = head["target_language"]
                async with db.execute(
                    """SELECT * FROM translation_queue
                       WHERE status='pending' AND book_id=? AND target_language=?
                       ORDER BY chapter_index ASC LIMIT 50""",
                    (book_id, lang),
                ) as cursor:
                    rows = await cursor.fetchall()
                ids = [r["id"] for r in rows]
                placeholders = ",".join("?" for _ in ids)
                await db.execute(
                    f"UPDATE translation_queue "
                    f"SET status='running', updated_at=CURRENT_TIMESTAMP "
                    f"WHERE id IN ({placeholders})",
                    ids,
                )
                await db.execute("COMMIT")
            except Exception:
                await db.execute("ROLLBACK")
                raise
        return [
            QueueRow(
                id=r["id"], book_id=r["book_id"], chapter_index=r["chapter_index"],
                target_language=r["target_language"], status="running",
                priority=r["priority"], attempts=r["attempts"],
                last_error=r["last_error"] or "",
            )
            for r in rows
        ]

    async def _process_batch(self, items: list[QueueRow], api_key: str) -> None:
        # Safety net: any row still marked 'running' at the end of this
        # batch — whether via unhandled exception or logic bug — must be
        # bumped back to pending/failed. Otherwise rows leak in 'running'
        # status until the next worker restart. Tracks ids we've already
        # transitioned so we don't double-bump.
        handled_ids: set[int] = set()

        def mark_handled(rows: list[QueueRow]) -> None:
            for r in rows:
                handled_ids.add(r.id)

        try:
            await self._process_batch_inner(items, api_key, mark_handled)
        except Exception as e:  # noqa: BLE001
            logger.exception("process_batch crashed")
            self._state.last_error = str(e)[:500]
            self._append_log({"event": "batch_error", "error": str(e)[:200]})
            # Rescue any still-running rows so they don't leak.
            unhandled = [r for r in items if r.id not in handled_ids]
            for row in unhandled:
                await self._bump_attempt(row, f"batch crashed: {str(e)[:200]}")

    async def _process_batch_inner(
        self,
        items: list[QueueRow],
        api_key: str,
        mark_handled,
    ) -> None:
        book_id = items[0].book_id
        target_language = items[0].target_language
        book = await get_cached_book(book_id)
        if not book or not book.get("text"):
            await self._mark_skipped(items, reason="book not in cache")
            mark_handled(items)
            return
        source = (book.get("languages") or ["en"])[0]
        if source.lower().split("-")[0] == target_language.lower().split("-")[0]:
            await self._mark_skipped(items, reason="source and target language are the same")
            mark_handled(items)
            return
        # Match the reader's splitter exactly so chapter_index alignment
        # stays consistent between the UI and the worker.
        from services.book_chapters import split_with_html_preference
        all_chapters = await split_with_html_preference(book_id, book["text"])

        works: list[ChapterWork] = []
        title = book.get("title") or str(book_id)
        for row in items:
            if row.chapter_index >= len(all_chapters):
                await self._mark_failed([row], "chapter index out of range")
                mark_handled([row])
                continue
            text = all_chapters[row.chapter_index].text
            if not text.strip():
                await self._mark_done([row])
                mark_handled([row])
                self._state.skipped_chapters += 1
                continue
            existing = await get_cached_translation(
                book_id, row.chapter_index, target_language,
            )
            if existing:
                await self._mark_done([row])
                mark_handled([row])
                self._state.skipped_chapters += 1
                self._append_log({
                    "event": "skipped_cached",
                    "book_id": book_id,
                    "title": title,
                    "lang": target_language,
                    "chapter": row.chapter_index,
                })
                continue
            works.append(ChapterWork(
                book_id=book_id, book_title=title, source_language=source,
                chapter_index=row.chapter_index, chapter_text=text,
            ))
        if not works:
            return

        # Per-batch output budget — use the LARGEST budget any model in
        # the chain supports so we don't under-pack when a big model like
        # 2.5-pro is primary. If the fallback model has a tighter budget,
        # the Gemini call on that model will truncate; we accept that
        # tradeoff (the call still returns the chapters it managed).
        chain = await get_model_chain()
        max_output_tokens = max(
            (limits_for(m)["max_output_tokens"] for m in chain),
            default=DEFAULT_MAX_OUTPUT_TOKENS,
        )

        batches = group_chapters_for_batch(works, max_output_tokens=max_output_tokens)
        rows_by_idx = {r.chapter_index: r for r in items}

        self._state.current_book_id = book_id
        self._state.current_book_title = title
        self._state.current_target_language = target_language
        self._state.current_batch_size = len(works)

        for batch in batches:
            chapters = [(c.chapter_index, c.chapter_text) for c in batch]
            translations = await self._translate_with_retry(
                chapters=chapters,
                source_language=source,
                target_language=target_language,
                api_key=api_key,
                chain=chain,
                max_output_tokens=max_output_tokens,
            )
            for c in batch:
                row = rows_by_idx[c.chapter_index]
                paragraphs = translations.get(c.chapter_index)
                if paragraphs is None:
                    await self._bump_attempt(row, "no translation returned")
                    mark_handled([row])
                    continue
                # Record the model that actually translated this chapter —
                # may differ from the primary if the chain advanced.
                await save_translation(
                    book_id, c.chapter_index, target_language, paragraphs,
                    provider="gemini",
                    model=self._state.current_model or None,
                )
                await self._mark_done([row])
                mark_handled([row])
                self._state.chapters_done += 1
                self._append_log({
                    "event": "translated",
                    "book_id": book_id,
                    "title": title,
                    "lang": target_language,
                    "chapter": c.chapter_index,
                })
            self._state.last_completed_at = datetime.now(timezone.utc).isoformat()

    async def _ensure_limiter(self, model: str) -> AsyncRateLimiter:
        """Get (or lazily create) the limiter for this model, applying
        the latest per-model RPM/RPD each time so config changes are live."""
        lim = limits_for(model)
        if model not in self._limiters:
            self._limiters[model] = AsyncRateLimiter(
                rpm=lim["rpm"], rpd=lim["rpd"], provider="gemini", model=model,
            )
        else:
            self._limiters[model].rpm = lim["rpm"]
            self._limiters[model].rpd = lim["rpd"]
        return self._limiters[model]

    async def _call_api_with_chain(
        self,
        *,
        chain: list[str],
        chapters: list[tuple[int, str]],
        api_key: str,
        source_language: str,
        target_language: str,
        max_output_tokens: int,
    ) -> dict[int, list[str]]:
        """Walk the chain: first model that answers successfully wins.

        Any error from the API advances to the next model — 429, 503,
        malformed response, network glitch, anything. Rationale: the
        whole point of a fallback chain is to route around model-level
        problems without sitting on long backoffs. If ALL models in the
        chain fail, the exception bubbles up to the outer retry loop,
        which waits briefly before re-trying the whole chain.
        """
        last_err: Exception | None = None
        for model in chain:
            limiter = await self._ensure_limiter(model)
            remaining = await limiter.daily_remaining()
            if remaining <= 0:
                self._append_log({
                    "event": "chain_skip_exhausted",
                    "model": model or "default",
                })
                continue
            try:
                self._state.waiting_reason = f"rate limiter ({model or 'default'})"
                await limiter.acquire()
                self._state.waiting_reason = f"translating via {model or 'default'}"
                self._state.current_model = model or TRANSLATOR_MODEL
                self._state.requests_made += 1
                return await translate_chapters_batch(
                    api_key, chapters, source_language, target_language,
                    model=model or TRANSLATOR_MODEL,
                    max_output_tokens=max_output_tokens,
                )
            except Exception as e:  # noqa: BLE001
                last_err = e
                reason = "quota" if is_quota_error(e) else "error"
                self._append_log({
                    "event": "chain_advance",
                    "from": model or "default",
                    "reason": reason,
                    "error": str(e)[:160],
                })
                continue
        if last_err:
            raise last_err
        raise RuntimeError("all models in chain are at their daily cap")

    async def _translate_with_retry(
        self,
        *,
        chapters: list[tuple[int, str]],
        source_language: str,
        target_language: str,
        api_key: str,
        chain: list[str],
        max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
    ) -> dict[int, list[str]]:
        last_err: Exception | None = None
        delays = [0.0, *RETRY_BACKOFF]
        total_attempts = len(delays)
        self._state.retry_max = total_attempts
        for attempt, delay in enumerate(delays):
            if self._stop_event and self._stop_event.is_set():
                break
            if delay:
                self._state.waiting_reason = f"retry backoff {delay:.0f}s"
                self._state.retry_delay_seconds = delay
                from datetime import datetime as _dt, timezone as _tz, timedelta as _td
                self._state.retry_next_at = (
                    _dt.now(_tz.utc) + _td(seconds=delay)
                ).isoformat()
                await asyncio.sleep(delay)
            try:
                self._state.retry_attempt = attempt + 1
                result = await self._call_api_with_chain(
                    chain=chain,
                    chapters=chapters,
                    api_key=api_key,
                    source_language=source_language,
                    target_language=target_language,
                    max_output_tokens=max_output_tokens,
                )
                # Success — clear retry state.
                self._state.retry_attempt = 0
                self._state.retry_delay_seconds = 0.0
                self._state.retry_next_at = None
                self._state.retry_reason = ""
                return result
            except Exception as e:  # noqa: BLE001
                last_err = e
                summary = str(e)[:200]
                self._state.retry_attempt = attempt + 1
                self._state.retry_reason = summary
                self._append_log({
                    "event": "retry",
                    "attempt": attempt + 1,
                    "max": total_attempts,
                    "error": summary,
                })
                logger.warning(
                    "Queue batch translate failed (attempt %d/%d): %s",
                    attempt + 1, total_attempts, e,
                )
        if last_err:
            self._state.last_error = str(last_err)[:500]
            self._state.retry_attempt = 0
            self._state.retry_delay_seconds = 0.0
            self._state.retry_next_at = None
            logger.error("Queue batch failed permanently: %s", last_err)
        return {}

    # ── Status mutations ────────────────────────────────────────────────

    async def _mark_done(self, rows: list[QueueRow]) -> None:
        # Delete on success so no 'done' row lingers to block a future
        # re-enqueue via INSERT OR IGNORE. The translations table is
        # the source of truth for completed work.
        if not rows:
            return
        ids = [r.id for r in rows]
        placeholders = ",".join("?" for _ in ids)
        async with aiosqlite.connect(db_module.DB_PATH) as db:
            await db.execute(
                f"DELETE FROM translation_queue WHERE id IN ({placeholders})",
                ids,
            )
            await db.commit()

    async def _mark_skipped(self, rows: list[QueueRow], *, reason: str) -> None:
        await self._update_status(rows, "skipped", error=reason)
        self._state.skipped_chapters += len(rows)

    async def _mark_failed(self, rows: list[QueueRow], reason: str) -> None:
        await self._update_status(rows, "failed", error=reason)
        self._state.chapters_failed += len(rows)

    async def _update_status(
        self, rows: list[QueueRow], status: str, *, error: str | None = None,
    ) -> None:
        if not rows:
            return
        ids = [r.id for r in rows]
        placeholders = ",".join("?" for _ in ids)
        async with aiosqlite.connect(db_module.DB_PATH) as db:
            await db.execute(
                f"""UPDATE translation_queue
                    SET status=?, last_error=?, updated_at=CURRENT_TIMESTAMP
                    WHERE id IN ({placeholders})""",
                [status, error, *ids],
            )
            await db.commit()

    async def _bump_attempt(self, row: QueueRow, error: str) -> None:
        new_attempts = row.attempts + 1
        new_status = "failed" if new_attempts >= MAX_ATTEMPTS else "pending"
        # Push the row to the back of the queue so the worker moves on to
        # other books instead of spinning on this one. If the admin retries
        # via the UI, priority is reset — see queue_retry_item.
        new_priority = row.priority + FAIL_PRIORITY_BUMP
        async with aiosqlite.connect(db_module.DB_PATH) as db:
            await db.execute(
                """UPDATE translation_queue
                   SET attempts=?, status=?, last_error=?, priority=?,
                       updated_at=CURRENT_TIMESTAMP
                   WHERE id=?""",
                (new_attempts, new_status, error, new_priority, row.id),
            )
            await db.commit()
        if new_status == "failed":
            self._state.chapters_failed += 1

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _load_api_key(self) -> str | None:
        encrypted = await get_setting(SETTING_API_KEY)
        if not encrypted:
            return None
        try:
            return decrypt_api_key(encrypted)
        except Exception:
            logger.exception("Failed to decrypt queue_api_key — clearing")
            return None

    async def _count_pending(self) -> int:
        async with aiosqlite.connect(db_module.DB_PATH) as db:
            async with db.execute(
                "SELECT COUNT(*) FROM translation_queue WHERE status IN ('pending', 'running')"
            ) as cursor:
                (n,) = await cursor.fetchone()
        return n

    async def _sleep_or_wake(self, seconds: float) -> None:
        """Sleep until either `seconds` elapses, the wake event fires, or
        the stop event fires."""
        if self._stop_event is None:
            await asyncio.sleep(seconds)
            return
        try:
            self._wake_event.clear()
            await asyncio.wait_for(self._wake_event.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            pass

    def _append_log(self, entry: dict, max_len: int = 100) -> None:
        entry["at"] = datetime.now(timezone.utc).isoformat()
        self._state.log.append(entry)
        if len(self._state.log) > max_len:
            self._state.log = self._state.log[-max_len:]


# ── Work planning (mirrors bulk translate, but uses the queue's splitter) ────

async def plan_work_for_queue(
    target_language: str,
    *,
    book_ids: list[int] | None = None,
) -> list[dict]:
    """Return a per-book list of chapters that still need translation.

    Uses split_with_html_preference — same splitter as the worker — so
    chapter counts here match what actually ends up in the queue.
    """
    from services.db import list_cached_books
    from services.book_chapters import split_with_html_preference

    target_language = target_language.lower().split("-")[0]
    all_books = await list_cached_books()
    plans = []

    for meta in all_books:
        if book_ids is not None and meta["id"] not in book_ids:
            continue
        source = (meta.get("languages") or [None])[0]
        if not source or source.lower().split("-")[0] == target_language:
            continue
        book = await get_cached_book(meta["id"])
        if not book or not book.get("text"):
            continue
        chapters = await split_with_html_preference(meta["id"], book["text"])
        to_translate = []
        for idx, ch in enumerate(chapters):
            if not ch.text.strip():
                continue
            if await get_cached_translation(meta["id"], idx, target_language):
                continue
            to_translate.append(ChapterWork(
                book_id=meta["id"],
                book_title=book.get("title") or str(meta["id"]),
                source_language=source,
                chapter_index=idx,
                chapter_text=ch.text,
            ))
        if to_translate:
            plans.append({
                "book_id": meta["id"],
                "book_title": book.get("title") or str(meta["id"]),
                "source_language": source,
                "chapters": to_translate,
            })

    return plans


# ── Module-level singleton ────────────────────────────────────────────────────

_worker = TranslationQueueWorker()


def worker() -> TranslationQueueWorker:
    return _worker
