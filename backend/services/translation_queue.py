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
from typing import Optional

import aiosqlite

from services import db as db_module
from services.auth import decrypt_api_key
from services.bulk_translate import (
    ChapterWork,
    DEFAULT_MAX_OUTPUT_TOKENS,
    group_chapters_for_batch,
)
from services.db import (
    get_cached_book,
    get_cached_translation,
    get_setting,
    save_translation,
)
from services.gemini import translate_chapters_batch, TRANSLATOR_MODEL
from services.rate_limiter import AsyncRateLimiter
from services.splitter import build_chapters

logger = logging.getLogger(__name__)


SETTING_API_KEY = "queue_api_key"            # encrypted Gemini key
SETTING_AUTO_LANGS = "auto_translate_languages"  # JSON array of lang codes
SETTING_ENABLED = "queue_enabled"            # "1" or "0"
SETTING_RPM = "queue_rpm"
SETTING_RPD = "queue_rpd"
SETTING_MODEL = "queue_model"

DEFAULT_RPM = 12
DEFAULT_RPD = 1400
IDLE_POLL_SECONDS = 10.0
MAX_ATTEMPTS = 5
RETRY_BACKOFF = (1.0, 5.0, 20.0, 60.0, 300.0)


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
) -> None:
    """Insert (or no-op) a single queue item.

    If `reset_failed=True`, an existing row whose status is 'failed' or 'done'
    will be revived to 'pending' (used when the admin clicks "Retranslate").
    """
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        if reset_failed:
            await db.execute(
                """INSERT INTO translation_queue
                       (book_id, chapter_index, target_language, priority, status)
                   VALUES (?, ?, ?, ?, 'pending')
                   ON CONFLICT(book_id, chapter_index, target_language) DO UPDATE
                     SET status='pending',
                         attempts=0,
                         last_error=NULL,
                         priority=MIN(priority, excluded.priority),
                         updated_at=CURRENT_TIMESTAMP""",
                (book_id, chapter_index, target_language, priority),
            )
        else:
            await db.execute(
                """INSERT OR IGNORE INTO translation_queue
                       (book_id, chapter_index, target_language, priority)
                   VALUES (?, ?, ?, ?)""",
                (book_id, chapter_index, target_language, priority),
            )
        await db.commit()


async def enqueue_for_book(
    book_id: int,
    *,
    target_languages: list[str] | None = None,
    priority: int = 100,
    reset_failed: bool = False,
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
    chapters = build_chapters(book["text"])

    inserted = 0
    for lang in target_languages:
        if not lang or lang == source:
            continue
        for idx, ch in enumerate(chapters):
            if not ch.text.strip():
                continue
            if not reset_failed and await get_cached_translation(book_id, idx, lang):
                continue
            await enqueue(book_id, idx, lang, priority=priority, reset_failed=reset_failed)
            inserted += 1
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
    where = []
    params: list = []
    if status:
        where.append("status = ?")
        params.append(status)
    if book_id is not None:
        where.append("book_id = ?")
        params.append(book_id)
    sql = "SELECT * FROM translation_queue"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY (status='running') DESC, priority ASC, id ASC LIMIT ?"
    params.append(limit)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(sql, params) as cursor:
            return [dict(row) async for row in cursor]


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
    last_completed_at: Optional[str] = None
    last_error: str = ""
    started_at: Optional[str] = None
    requests_made: int = 0
    chapters_done: int = 0
    chapters_failed: int = 0
    waiting_reason: str = ""
    log: list[dict] = field(default_factory=list)


class TranslationQueueWorker:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop_event: asyncio.Event | None = None
        self._wake_event: asyncio.Event = asyncio.Event()
        self._state = WorkerState()
        self._limiter: AsyncRateLimiter | None = None

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

        # Pull one batch's worth of pending items, all sharing the same
        # (book_id, target_language). Batching across books would force us to
        # rebuild prior_context per chapter, which loses the cross-batch
        # consistency benefit.
        items = await self._claim_next_batch()
        if not items:
            self._state.idle = True
            self._state.waiting_reason = "queue empty"
            self._state.current_book_id = None
            self._state.current_book_title = ""
            self._state.current_target_language = ""
            self._state.current_batch_size = 0
            await self._sleep_or_wake(IDLE_POLL_SECONDS)
            return

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
        book_id = items[0].book_id
        target_language = items[0].target_language
        book = await get_cached_book(book_id)
        if not book or not book.get("text"):
            await self._mark_skipped(items, reason="book not in cache")
            return
        source = (book.get("languages") or ["en"])[0]
        all_chapters = build_chapters(book["text"])

        works: list[ChapterWork] = []
        title = book.get("title") or str(book_id)
        for row in items:
            if row.chapter_index >= len(all_chapters):
                await self._mark_failed([row], "chapter index out of range")
                continue
            text = all_chapters[row.chapter_index].text
            if not text.strip():
                await self._mark_done([row])
                continue
            works.append(ChapterWork(
                book_id=book_id, book_title=title, source_language=source,
                chapter_index=row.chapter_index, chapter_text=text,
            ))
        if not works:
            return

        # Group into output-token-bounded batches. Usually 1 batch.
        batches = group_chapters_for_batch(works, max_output_tokens=DEFAULT_MAX_OUTPUT_TOKENS)
        rows_by_idx = {r.chapter_index: r for r in items}
        model = (await get_setting(SETTING_MODEL)) or TRANSLATOR_MODEL

        self._state.current_book_id = book_id
        self._state.current_book_title = title
        self._state.current_target_language = target_language
        self._state.current_batch_size = len(works)

        if self._limiter is None:
            rpm = int((await get_setting(SETTING_RPM)) or DEFAULT_RPM)
            rpd = int((await get_setting(SETTING_RPD)) or DEFAULT_RPD)
            self._limiter = AsyncRateLimiter(rpm=rpm, rpd=rpd, provider="gemini")

        for batch in batches:
            chapters = [(c.chapter_index, c.chapter_text) for c in batch]
            translations = await self._translate_with_retry(
                chapters=chapters,
                source_language=source,
                target_language=target_language,
                api_key=api_key,
                model=model,
            )
            for c in batch:
                row = rows_by_idx[c.chapter_index]
                paragraphs = translations.get(c.chapter_index)
                if paragraphs is None:
                    await self._bump_attempt(row, "no translation returned")
                    continue
                await save_translation(
                    book_id, c.chapter_index, target_language, paragraphs,
                    provider="gemini", model=model,
                )
                await self._mark_done([row])
                self._state.chapters_done += 1
                self._append_log({
                    "event": "translated",
                    "book_id": book_id,
                    "title": title,
                    "lang": target_language,
                    "chapter": c.chapter_index,
                })
            self._state.last_completed_at = datetime.now(timezone.utc).isoformat()

    async def _translate_with_retry(
        self,
        *,
        chapters: list[tuple[int, str]],
        source_language: str,
        target_language: str,
        api_key: str,
        model: str,
    ) -> dict[int, list[str]]:
        last_err: Exception | None = None
        for attempt, delay in enumerate([0.0, *RETRY_BACKOFF]):
            if self._stop_event and self._stop_event.is_set():
                break
            if delay:
                self._state.waiting_reason = f"retry backoff {delay:.0f}s"
                await asyncio.sleep(delay)
            try:
                assert self._limiter is not None
                self._state.waiting_reason = "rate limiter"
                await self._limiter.acquire()
                self._state.waiting_reason = "translating"
                self._state.requests_made += 1
                return await translate_chapters_batch(
                    api_key, chapters, source_language, target_language, model=model,
                )
            except Exception as e:  # noqa: BLE001
                last_err = e
                self._state.last_error = str(e)[:500]
                logger.warning(
                    "Queue batch translate failed (attempt %d): %s", attempt + 1, e,
                )
        if last_err:
            logger.error("Queue batch failed permanently: %s", last_err)
        return {}

    # ── Status mutations ────────────────────────────────────────────────

    async def _mark_done(self, rows: list[QueueRow]) -> None:
        await self._update_status(rows, "done")

    async def _mark_skipped(self, rows: list[QueueRow], *, reason: str) -> None:
        await self._update_status(rows, "skipped", error=reason)

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
        async with aiosqlite.connect(db_module.DB_PATH) as db:
            await db.execute(
                """UPDATE translation_queue
                   SET attempts=?, status=?, last_error=?,
                       updated_at=CURRENT_TIMESTAMP
                   WHERE id=?""",
                (new_attempts, new_status, error, row.id),
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

    def _append_log(self, entry: dict, max_len: int = 30) -> None:
        entry["at"] = datetime.now(timezone.utc).isoformat()
        self._state.log.append(entry)
        if len(self._state.log) > max_len:
            self._state.log = self._state.log[-max_len:]


# ── Module-level singleton ────────────────────────────────────────────────────

_worker = TranslationQueueWorker()


def worker() -> TranslationQueueWorker:
    return _worker
