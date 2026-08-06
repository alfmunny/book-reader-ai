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


async def get_chapters(book_id: int) -> list[Chapter]:
    """Return the canonical chapter list for a book, hiding whether it comes
    from a fossilized artifact or the runtime splitter (issue #2624).

    Priority:
      1. Frozen (book_freeze row exists) — pure DB read of book_chapters.
         Never touches the EPUB path, so the background EPUB fetch (and its
         delete_translations_for_book side-effect, #1556) cannot fire for a
         fossilized book.
      2. Everything else — the pre-existing runtime resolution
         (upload table → stored EPUB → plain-text regex), loading books.text
         internally.
    """
    cached = _chapter_cache.get(book_id)
    if cached is not None:
        return cached

    async with _split_locks[book_id]:
        cached = _chapter_cache.get(book_id)
        if cached is not None:
            return cached

        from services.db import get_book_freeze, get_frozen_chapters
        if await get_book_freeze(book_id) is not None:
            rows = await get_frozen_chapters(book_id)
            chapters = [Chapter(title=r["title"], text=r["text"]) for r in rows]
            _chapter_cache[book_id] = chapters
            return chapters

    # Not frozen — legacy runtime path (re-acquires the per-book lock itself;
    # asyncio.Lock is not re-entrant, so this call must sit outside the block
    # above).
    from services.db import get_cached_book
    book = await get_cached_book(book_id)
    text = (book or {}).get("text") or ""
    return await split_with_html_preference(book_id, text)


async def split_with_html_preference(book_id: int, text: str) -> list[Chapter]:
    """Return the canonical chapter list for a book (DB-only, no external calls).

    The `text` argument is used only for the plain-text regex fallback (Gutenberg).
    Uploaded books are resolved from the user_book_chapters table.

    Runtime callers should migrate to get_chapters(book_id) (issue #2624);
    this function remains the build-time splitting path and the fallback for
    books that are not yet fossilized.
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
                if len(chapters) >= 1:
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

    After storing the EPUB, clears the in-memory chapter cache and purges all
    cached translations for the book. Translations generated under the old
    plain-text split are misaligned with the new EPUB-based chapter indices
    (issue #1556).
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
            # Invalidate the in-memory cache so the next request uses the EPUB-based split.
            clear_cache(book_id)
            # Purge translations generated with the old plain-text chapter indices.
            try:
                from services.db import delete_translations_for_book
                await delete_translations_for_book(book_id)
                logger.info("Cleared stale translations for book %d after EPUB update", book_id)
            except Exception:
                logger.warning(
                    "Failed to clear stale translations for book %d", book_id, exc_info=True
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
    Fossilized books (#2624) return the chapter_source recorded at freeze
    time, so the badge keeps describing what actually produced the frozen
    split.
    """
    from services.db import get_book_freeze, get_book_source, has_book_epub
    freeze = await get_book_freeze(book_id)
    if freeze is not None:
        return freeze["chapter_source"]
    source = await get_book_source(book_id)
    if source == "upload":
        return "upload"
    if await has_book_epub(book_id):
        return "epub"
    return "text"
