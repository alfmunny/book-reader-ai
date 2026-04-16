"""
Seed-popular-books job manager — a singleton background task that
downloads every book listed in popular_books.json into the DB.

Mirrors the BulkTranslationManager pattern so the job survives:
  - admin navigating away from the page
  - connection drops
  - transient network errors (simple retry on each book)

State lives in memory; on server restart it's lost but the work is
idempotent (books already cached are skipped), so restarting the job
picks up where it left off.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from services.db import get_cached_book, save_book
from services.gutenberg import get_book_meta, get_book_text

logger = logging.getLogger(__name__)


@dataclass
class SeedPopularState:
    status: str = "idle"   # idle | running | completed | cancelled | failed
    total: int = 0
    current: int = 0
    downloaded: int = 0
    failed: int = 0
    already_cached: int = 0
    current_book_id: int | None = None
    current_book_title: str = ""
    last_error: str = ""
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    # Last ~20 events for the UI log
    log: list[dict] = field(default_factory=list)


class SeedPopularManager:
    """Singleton manager for the seed-popular-books background job."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop_event: asyncio.Event | None = None
        self._state: SeedPopularState = SeedPopularState()
        self._lock = asyncio.Lock()

    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def state(self) -> SeedPopularState:
        return self._state

    async def start(self, manifest_path: str) -> SeedPopularState:
        async with self._lock:
            if self.is_running():
                raise RuntimeError("A seed-popular job is already running")
            self._state = SeedPopularState(
                status="running",
                started_at=datetime.now(timezone.utc).isoformat(),
            )
            self._stop_event = asyncio.Event()
            self._task = asyncio.create_task(
                self._run(manifest_path),
                name="seed-popular",
            )
            return self._state

    async def stop(self) -> None:
        if self._stop_event:
            self._stop_event.set()
        if self._task:
            try:
                await asyncio.wait_for(self._task, timeout=20)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()

    async def _run(self, manifest_path: str) -> None:
        state = self._state
        stop_event = self._stop_event
        assert stop_event is not None

        try:
            if not os.path.isfile(manifest_path):
                state.status = "failed"
                state.last_error = f"popular_books.json not found at {manifest_path}"
                state.ended_at = datetime.now(timezone.utc).isoformat()
                return

            with open(manifest_path, encoding="utf-8") as f:
                manifest = json.load(f)

            # Figure out which books need fetching
            todo: list[dict] = []
            for book in manifest:
                existing = await get_cached_book(book["id"])
                if existing and existing.get("text"):
                    state.already_cached += 1
                else:
                    todo.append(book)

            state.total = len(todo)

            for i, book in enumerate(todo, 1):
                if stop_event.is_set():
                    state.status = "cancelled"
                    break

                state.current = i
                state.current_book_id = book["id"]
                state.current_book_title = book.get("title", "")

                try:
                    meta = await get_book_meta(book["id"])
                    text = await get_book_text(book["id"])
                    await save_book(book["id"], meta, text)
                    state.downloaded += 1
                    _append_log(state, {
                        "event": "downloaded",
                        "book_id": book["id"],
                        "title": meta.get("title", book.get("title", "")),
                        "chars": len(text),
                    })
                except Exception as e:
                    state.failed += 1
                    state.last_error = f"{book.get('id')}: {e}"
                    logger.exception("Seed failed for book %s", book["id"])
                    _append_log(state, {
                        "event": "failed",
                        "book_id": book["id"],
                        "title": book.get("title", ""),
                        "error": str(e)[:200],
                    })

                # Be polite to Gutenberg
                await asyncio.sleep(0.3)

            if state.status != "cancelled":
                state.status = "completed"
            state.ended_at = datetime.now(timezone.utc).isoformat()

        except Exception as e:
            logger.exception("Seed-popular job crashed")
            state.status = "failed"
            state.last_error = str(e)[:500]
            state.ended_at = datetime.now(timezone.utc).isoformat()


def _append_log(state: SeedPopularState, entry: dict, max_len: int = 20) -> None:
    state.log.append(entry)
    if len(state.log) > max_len:
        state.log = state.log[-max_len:]


_manager = SeedPopularManager()


def manager() -> SeedPopularManager:
    return _manager
