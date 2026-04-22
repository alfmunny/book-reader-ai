"""
Bulk translation job manager — admin-initiated background translation of every
cached book into a target language using the admin's Gemini free-tier key.

Key design points:

- **Singleton**: at most one job runs per backend process. Starting a new job
  while one is running returns the existing job's state.
- **Resumable**: state is persisted to `bulk_translation_jobs`. On startup the
  backend checks for a row with status="running" and resumes where it left off.
  Per-chapter progress is implicit — the `translations` table is the ground
  truth, so we just re-scan and skip already-translated chapters.
- **Batched translation**: we pack multiple chapters into a single Gemini
  request using `translate_chapters_batch`, and include the previously-
  translated chapter as context for cross-batch consistency.
- **Rate limited**: wraps each API call with `AsyncRateLimiter` (RPM + RPD).
  When the daily cap is hit, the job sleeps until UTC midnight.
- **Retry with backoff**: per-batch retry loop. After max retries, the batch
  is marked failed and we move on — the next job run re-attempts failures.
- **Dry-run mode**: compute the work plan and translate the FIRST batch as a
  preview, writing nothing to the DB. The admin uses this to check quality
  before committing to a long real run.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from services import db as db_module
from services.db import (
    list_cached_books,
    get_cached_book,
    get_cached_translation,
    save_translation,
)
from services.gemini import translate_chapters_batch, TRANSLATOR_MODEL
from services.rate_limiter import AsyncRateLimiter
from services.splitter import build_chapters

logger = logging.getLogger(__name__)


# ── Tunables ────────────────────────────────────────────────────────────────

# Target output tokens per batched request. Leaves a buffer below Gemini Flash's
# 8192 limit to avoid truncation.
DEFAULT_MAX_OUTPUT_TOKENS = 7500

# Output-token estimator: for English → Chinese, ~1.3 output tokens per input
# word. Good-enough heuristic — we'll over-estimate slightly to stay safe.
WORDS_TO_OUTPUT_TOKENS = 1.4

# Retry strategy — exponential-ish backoff for transient failures (429/503/…).
RETRY_DELAYS = (1.0, 4.0, 15.0, 60.0, 300.0)


# ── Work planning ───────────────────────────────────────────────────────────

@dataclass
class ChapterWork:
    book_id: int
    book_title: str
    source_language: str
    chapter_index: int
    chapter_text: str


@dataclass
class BookPlan:
    book_id: int
    book_title: str
    source_language: str
    chapters: list[ChapterWork] = field(default_factory=list)


async def plan_work(
    target_language: str,
    *,
    book_ids: list[int] | None = None,
) -> list[BookPlan]:
    """Build the list of books and chapters that still need translation.

    Skips: books already in target_language, chapters without cached text,
    empty chapters, and any chapter already present in the translations table.
    """
    target_language = target_language.lower().split("-")[0]
    all_books = await list_cached_books()
    plans: list[BookPlan] = []

    for meta in all_books:
        if book_ids is not None and meta["id"] not in book_ids:
            continue
        source = (meta.get("languages") or [None])[0]
        if not source or source == target_language:
            continue

        book = await get_cached_book(meta["id"])
        if not book or not book.get("text"):
            continue

        plan = BookPlan(
            book_id=meta["id"],
            book_title=book.get("title") or str(meta["id"]),
            source_language=source,
        )
        chapters = build_chapters(book["text"])
        for idx, ch in enumerate(chapters):
            if not ch.text.strip():
                continue
            existing = await get_cached_translation(meta["id"], idx, target_language)
            if existing:
                continue
            plan.chapters.append(ChapterWork(
                book_id=meta["id"],
                book_title=plan.book_title,
                source_language=source,
                chapter_index=idx,
                chapter_text=ch.text,
            ))
        if plan.chapters:
            plans.append(plan)

    return plans


def group_chapters_for_batch(
    chapters: list[ChapterWork],
    *,
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
) -> list[list[ChapterWork]]:
    """Greedily group consecutive chapters so each batch's estimated output
    stays under `max_output_tokens`."""
    batches: list[list[ChapterWork]] = []
    current: list[ChapterWork] = []
    current_tokens = 0.0

    for ch in chapters:
        words = len(ch.chapter_text.split())
        est = words * WORDS_TO_OUTPUT_TOKENS
        # If a single chapter exceeds the budget on its own, still put it in
        # its own batch — the API call may need to truncate but we can't split
        # without losing paragraph alignment.
        if current and current_tokens + est > max_output_tokens:
            batches.append(current)
            current = []
            current_tokens = 0.0
        current.append(ch)
        current_tokens += est
    if current:
        batches.append(current)
    return batches


# ── Persistent job state ────────────────────────────────────────────────────

@dataclass
class JobState:
    id: int
    status: str = "pending"
    target_language: str = ""
    provider: str = "gemini"
    model: str = ""
    total_chapters: int = 0
    completed_chapters: int = 0
    failed_chapters: int = 0
    skipped_chapters: int = 0
    requests_made: int = 0
    current_book_id: int | None = None
    current_book_title: str = ""
    current_chapter_index: int | None = None
    last_error: str = ""
    dry_run: bool = False
    started_at: Optional[str] = None
    ended_at: Optional[str] = None


async def create_job(
    target_language: str,
    provider: str = "gemini",
    model: str = TRANSLATOR_MODEL,
    dry_run: bool = False,
) -> JobState:
    import aiosqlite
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO bulk_translation_jobs
               (status, target_language, provider, model, dry_run, started_at)
               VALUES ('running', ?, ?, ?, ?, ?)""",
            (target_language, provider, model, 1 if dry_run else 0,
             datetime.now(timezone.utc).isoformat()),
        )
        await db.commit()
        job_id = cursor.lastrowid
    return JobState(
        id=int(job_id),
        status="running",
        target_language=target_language,
        provider=provider,
        model=model,
        dry_run=dry_run,
        started_at=datetime.now(timezone.utc).isoformat(),
    )


async def load_job(job_id: int) -> JobState | None:
    import aiosqlite
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM bulk_translation_jobs WHERE id=?", (job_id,),
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        return None
    return JobState(**{
        "id": row["id"],
        "status": row["status"],
        "target_language": row["target_language"],
        "provider": row["provider"],
        "model": row["model"] or "",
        "total_chapters": row["total_chapters"],
        "completed_chapters": row["completed_chapters"],
        "failed_chapters": row["failed_chapters"],
        "skipped_chapters": row["skipped_chapters"],
        "requests_made": row["requests_made"],
        "current_book_id": row["current_book_id"],
        "current_book_title": row["current_book_title"] or "",
        "current_chapter_index": row["current_chapter_index"],
        "last_error": row["last_error"] or "",
        "dry_run": bool(row["dry_run"]),
        "started_at": row["started_at"],
        "ended_at": row["ended_at"],
    })


async def load_latest_job() -> JobState | None:
    import aiosqlite
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id FROM bulk_translation_jobs ORDER BY id DESC LIMIT 1",
        ) as cursor:
            row = await cursor.fetchone()
    return await load_job(row["id"]) if row else None


async def update_job(job_id: int, **fields: Any) -> None:
    if not fields:
        return
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    cols = ", ".join(f"{k}=?" for k in fields)
    values = list(fields.values()) + [job_id]
    import aiosqlite
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            f"UPDATE bulk_translation_jobs SET {cols} WHERE id=?",
            values,
        )
        await db.commit()


# ── Job runner ──────────────────────────────────────────────────────────────

class BulkTranslationManager:
    """Singleton manager for a single in-process bulk translation job."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop_event: asyncio.Event | None = None
        self._state: JobState | None = None
        self._preview: dict[int, list[str]] | None = None
        self._lock = asyncio.Lock()

    # ── Public API ──────────────────────────────────────────────────────

    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(
        self,
        *,
        target_language: str,
        api_key: str,
        provider: str = "gemini",
        model: str = TRANSLATOR_MODEL,
        rpm: int = 12,
        rpd: int = 1400,
        dry_run: bool = False,
        book_ids: list[int] | None = None,
    ) -> JobState:
        """Start a new bulk translation job. Raises RuntimeError if one is running."""
        target_language = target_language.lower().split("-")[0]
        async with self._lock:
            if self.is_running():
                raise RuntimeError("A bulk translation job is already running")
            state = await create_job(
                target_language=target_language,
                provider=provider,
                model=model,
                dry_run=dry_run,
            )
            self._state = state
            self._stop_event = asyncio.Event()
            self._preview = None
            self._task = asyncio.create_task(
                self._run(api_key=api_key, rpm=rpm, rpd=rpd, book_ids=book_ids),
                name=f"bulk-translation-job-{state.id}",
            )
            return state

    async def stop(self) -> None:
        if self._stop_event:
            self._stop_event.set()
        if self._task:
            try:
                await asyncio.wait_for(self._task, timeout=30)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()

    async def status(self) -> JobState | None:
        """Return the latest state from the DB (not the in-memory one) so a
        restart-and-reload gives fresh numbers."""
        if self._state is None:
            return await load_latest_job()
        fresh = await load_job(self._state.id)
        return fresh or self._state

    def preview(self) -> dict[int, list[str]] | None:
        """Return the dry-run preview translation (first batch), if available."""
        return self._preview

    # ── Internal ────────────────────────────────────────────────────────

    async def _run(
        self,
        *,
        api_key: str,
        rpm: int,
        rpd: int,
        book_ids: list[int] | None,
    ) -> None:
        assert self._state is not None
        state = self._state
        stop_event = self._stop_event
        assert stop_event is not None

        limiter = AsyncRateLimiter(rpm=rpm, rpd=rpd, provider="gemini")

        try:
            plans = await plan_work(state.target_language, book_ids=book_ids)
            total = sum(len(p.chapters) for p in plans)
            await update_job(state.id, total_chapters=total)
            state.total_chapters = total

            if total == 0:
                await update_job(state.id, status="completed",
                                 ended_at=datetime.now(timezone.utc).isoformat())
                return

            first_batch_run = False
            for plan in plans:
                if stop_event.is_set():
                    break

                batches = group_chapters_for_batch(plan.chapters)
                prior_context = ""

                for batch in batches:
                    if stop_event.is_set():
                        break

                    # Announce current progress
                    first = batch[0]
                    await update_job(
                        state.id,
                        current_book_id=first.book_id,
                        current_book_title=first.book_title,
                        current_chapter_index=first.chapter_index,
                    )

                    translations = await self._translate_with_retry(
                        batch=batch,
                        target_language=state.target_language,
                        api_key=api_key,
                        limiter=limiter,
                        model=state.model or TRANSLATOR_MODEL,
                        prior_context=prior_context,
                        job_state=state,
                    )

                    # Dry-run: capture the first batch preview and STOP.
                    if state.dry_run and not first_batch_run:
                        self._preview = translations
                        first_batch_run = True
                        await update_job(
                            state.id, status="completed",
                            ended_at=datetime.now(timezone.utc).isoformat(),
                        )
                        return

                    # Persist each chapter's translation
                    for ch in batch:
                        paragraphs = translations.get(ch.chapter_index)
                        if paragraphs is None:
                            state.failed_chapters += 1
                            continue
                        await save_translation(
                            ch.book_id, ch.chapter_index,
                            state.target_language, paragraphs,
                            provider=state.provider, model=state.model or None,
                        )
                        state.completed_chapters += 1

                    await update_job(
                        state.id,
                        completed_chapters=state.completed_chapters,
                        failed_chapters=state.failed_chapters,
                    )

                    # Build prior_context for the next batch: include the last
                    # chapter's original + translation (bounded in size).
                    last_ch = batch[-1]
                    last_t = translations.get(last_ch.chapter_index)
                    if last_t:
                        original = last_ch.chapter_text[:3000]
                        translated = "\n\n".join(last_t)[:3000]
                        prior_context = (
                            f"Previously translated chapter {last_ch.chapter_index} of "
                            f'"{last_ch.book_title}":\n\n'
                            f"Original:\n{original}\n\nTranslation:\n{translated}"
                        )

            # Mark completed if we exited the loop normally
            final_status = "cancelled" if stop_event.is_set() else "completed"
            await update_job(
                state.id, status=final_status,
                ended_at=datetime.now(timezone.utc).isoformat(),
            )

        except Exception as e:
            logger.exception("Bulk translation job crashed")
            await update_job(
                state.id, status="failed",
                last_error=str(e)[:500],
                ended_at=datetime.now(timezone.utc).isoformat(),
            )

    async def _translate_with_retry(
        self,
        *,
        batch: list[ChapterWork],
        target_language: str,
        api_key: str,
        limiter: AsyncRateLimiter,
        model: str,
        prior_context: str,
        job_state: JobState,
    ) -> dict[int, list[str]]:
        """Run one batch through Gemini with retries. Returns {} on total failure."""
        chapters = [(c.chapter_index, c.chapter_text) for c in batch]
        last_err: Exception | None = None
        for attempt, delay in enumerate([0.0, *RETRY_DELAYS]):
            if delay:
                await asyncio.sleep(delay)
            try:
                await limiter.acquire()
                job_state.requests_made += 1
                await update_job(job_state.id, requests_made=job_state.requests_made)
                return await translate_chapters_batch(
                    api_key, chapters,
                    batch[0].source_language, target_language,
                    prior_context=prior_context,
                    model=model,
                )
            except Exception as e:  # noqa: BLE001 — deliberately broad
                last_err = e
                logger.warning(
                    "Batch translation failed (attempt %d/%d): %s",
                    attempt + 1, len(RETRY_DELAYS) + 1, e,
                )
                await update_job(job_state.id, last_error=str(e)[:500])
                continue

        # All attempts failed
        logger.error("Batch failed permanently after %d attempts: %s",
                     len(RETRY_DELAYS) + 1, last_err)
        return {}


# ── Module-level singleton ──────────────────────────────────────────────────

_manager = BulkTranslationManager()


def manager() -> BulkTranslationManager:
    return _manager
