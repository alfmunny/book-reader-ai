"""Shared chapter-list resolver used by BOTH the reader endpoint and the
translation queue worker.

Priority (all DB-only, no external fetches at chapter-load time):
  1. user_book_chapters — uploaded books store their chapters in a dedicated
                          table (issue #357); draft rows are filtered out.
  2. Stored EPUB        — preferred for Gutenberg books: explicit spine/TOC
                          gives clean paragraph boundaries and reliable titles.
  3. Plain-text regex fallback — for Gutenberg books with no EPUB available.

New Gutenberg books have their EPUB fetched and stored at add-time.
Existing books (pre-EPUB feature) get their EPUB fetched in a background
task on first chapter access, becoming available on the next cold start.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

from services.splitter import Chapter, build_chapters, build_chapters_from_epub

logger = logging.getLogger(__name__)

_chapter_cache: dict[int, list[Chapter]] = {}
_split_locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)

# Track books for which a background EPUB fetch has already been fired this
# process lifetime so we don't hammer Gutenberg on every chapter request.
_epub_fetch_attempted: set[int] = set()


async def split_with_html_preference(book_id: int, text: str) -> list[Chapter]:
    """Return the canonical chapter list for a book (DB-only, no external calls).

    The `text` argument is used only for the plain-text regex fallback (Gutenberg).
    Uploaded books are resolved from the user_book_chapters table.
    """
    cached = _chapter_cache.get(book_id)
    if cached is not None:
        return cached

    async with _split_locks[book_id]:
        cached = _chapter_cache.get(book_id)
        if cached is not None:
            return cached

        # ── 1. Uploaded books: dedicated chapters table (issue #357) ──────────
        from services.db import get_book_source, get_user_book_chapters
        source = await get_book_source(book_id)
        if source == "upload":
            rows = await get_user_book_chapters(book_id, include_drafts=False)
            chapters: list[Chapter] = [
                Chapter(title=r["title"], text=r["text"]) for r in rows
            ]
            _chapter_cache[book_id] = chapters
            return chapters

        # ── 2. Stored EPUB (Gutenberg books) ──────────────────────────────────
        try:
            from services.db import get_book_epub_bytes
            epub_bytes = await get_book_epub_bytes(book_id)
            if epub_bytes:
                chapters = await asyncio.to_thread(build_chapters_from_epub, epub_bytes)
                if len(chapters) >= 2:
                    _chapter_cache[book_id] = chapters
                    return chapters
            elif book_id not in _epub_fetch_attempted:
                # Existing book with no EPUB yet — fetch silently in background.
                # Current request falls through to plain-text; EPUB available next restart.
                _epub_fetch_attempted.add(book_id)
                asyncio.create_task(_background_fetch_epub(book_id))
        except Exception:
            logger.exception("EPUB split failed for book %s, falling back to text", book_id)

        # ── 3. Plain-text regex fallback ──────────────────────────────────────
        chapters = await asyncio.to_thread(build_chapters, text)
        _chapter_cache[book_id] = chapters
        return chapters


async def _background_fetch_epub(book_id: int) -> None:
    """Fetch and store EPUB for a pre-existing Gutenberg book (fire-and-forget).

    Does not update the in-memory chapter cache — stored EPUB becomes
    available on the next cold start.
    """
    try:
        from services.gutenberg import get_book_epub
        from services.db import save_book_epub
        result = await get_book_epub(book_id)
        if result:
            epub_bytes, epub_url = result
            await save_book_epub(book_id, epub_bytes, epub_url)
            logger.info(
                "Background EPUB cached for book %d (%d KB)", book_id, len(epub_bytes) // 1024
            )
    except Exception:
        logger.debug("Background EPUB fetch failed for book %d", book_id, exc_info=True)


def clear_cache(book_id: int | None = None) -> None:
    """Invalidate cached chapter list."""
    if book_id is None:
        _chapter_cache.clear()
    else:
        _chapter_cache.pop(book_id, None)


async def get_chapter_source(book_id: int) -> str:
    """Return which source the reader is actually using to render chapters.

    One of:
        "upload" — uploaded book, chapters live in user_book_chapters
        "epub"   — Gutenberg book with a stored EPUB; spine/TOC used
        "text"   — Gutenberg book falling back to plain-text regex split

    Mirrors the priority in split_with_html_preference so the badge shown
    to the user matches exactly what produced the chapters they're reading.
    """
    from services.db import get_book_source, has_book_epub
    source = await get_book_source(book_id)
    if source == "upload":
        return "upload"
    if await has_book_epub(book_id):
        return "epub"
    return "text"
