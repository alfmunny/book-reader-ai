"""Shared chapter-list resolver used by BOTH the reader endpoint and the
translation queue worker.

Previously the reader used a (cached) HTML-preferring splitter, while the
queue worker called `build_chapters(text)` directly. For books where the
two splitters produced different chapter lists (plays / drama like Faust,
or any book where `<div class="chapter">` markup differs from what
heading-regex finds in plain text), the worker would translate chapter
indices that DON'T correspond to what the reader is displaying — off-by-
one visible to users from the first divergent chapter onward.

This module is the one place both call sites share to get the canonical
Chapter list for a book.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict

from services.gutenberg import get_book_html
from services.splitter import Chapter, build_chapters, build_chapters_from_html

logger = logging.getLogger(__name__)

# In-memory cache keyed by book_id. Populated on first split after each
# process restart; every subsequent call returns the cached list. The
# reader previously had its own cache in routers/books.py — merged here
# so reader + worker share the same result.
_chapter_cache: dict[int, list[Chapter]] = {}

# One lock per book_id: serializes concurrent cache-miss requests so the
# second waiter reuses the result written by the first instead of running
# a different split path and returning a divergent chapter list.
_split_locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)


async def split_with_html_preference(book_id: int, text: str) -> list[Chapter]:
    """Return the canonical chapter list for a book.

    Strategy:
      1. Try Gutenberg's HTML edition — much cleaner on books with nested
         structure (War and Peace, Faust drama, etc.).
      2. Fall back to the plain-text splitter if HTML isn't available,
         fails, or produces fewer than 2 chapters.

    CPU-heavy work runs on a thread so the event loop stays responsive.
    """
    cached = _chapter_cache.get(book_id)
    if cached is not None:
        return cached

    async with _split_locks[book_id]:
        # Double-check: a concurrent request may have populated the cache
        # while we were waiting for the lock.
        cached = _chapter_cache.get(book_id)
        if cached is not None:
            return cached

        # Uploaded books store chapters as JSON, not raw text.
        # Detect and return pre-split chapters directly to avoid feeding
        # JSON to the Gutenberg HTML / regex splitter.
        if text and text.lstrip().startswith("{"):
            try:
                data = json.loads(text)
                if not data.get("draft") and "chapters" in data:
                    chapters: list[Chapter] = [
                        Chapter(title=ch["title"], text=ch["text"])
                        for ch in data["chapters"]
                    ]
                    _chapter_cache[book_id] = chapters
                    return chapters
            except (ValueError, KeyError, TypeError):
                pass  # not a valid uploaded-book JSON — fall through to normal split

        try:
            html = await get_book_html(book_id)
            if html:
                chapters = await asyncio.to_thread(build_chapters_from_html, html)
                if len(chapters) >= 2:
                    _chapter_cache[book_id] = chapters
                    return chapters
        except Exception:
            logger.exception(
                "HTML split failed for book %s, falling back to text", book_id,
            )

        chapters = await asyncio.to_thread(build_chapters, text)
        _chapter_cache[book_id] = chapters
        return chapters


def clear_cache(book_id: int | None = None) -> None:
    """Invalidate cached chapter list. Called from admin book-delete
    and retranslate paths so stale chapter indices don't linger."""
    if book_id is None:
        _chapter_cache.clear()
    else:
        _chapter_cache.pop(book_id, None)
