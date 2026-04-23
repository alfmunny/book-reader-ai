"""Tests for the `chapter_source` field on GET /books/{id}/chapters.

Covers the three cases the reader surfaces as a source-format badge:
  - "upload" — uploaded book (user_book_chapters)
  - "epub"   — Gutenberg book with stored EPUB
  - "text"   — Gutenberg book with plain-text fallback (no stored EPUB)
"""

import aiosqlite
import pytest

import services.db as db_module
from services.db import save_book, save_book_epub
from services.book_chapters import get_chapter_source, clear_cache


_META = {
    "title": "Sample",
    "authors": ["Author"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}


async def test_chapter_source_text_when_no_epub(tmp_db):
    await save_book(4001, _META, "Plain text only. " * 200)
    assert await get_chapter_source(4001) == "text"


async def test_chapter_source_epub_when_blob_stored(tmp_db):
    await save_book(4002, _META, "Plain text. " * 10)
    await save_book_epub(4002, b"fake epub bytes", "https://example.com/4002.epub")
    assert await get_chapter_source(4002) == "epub"


async def test_chapter_source_upload_for_uploaded_book(tmp_db, test_user):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            """INSERT INTO books (id, title, authors, languages, subjects,
                                  download_count, cover, text, images, source, owner_user_id)
               VALUES (4003, 'Upload', '[]', '[]', '[]', 0, '', '', '[]', 'upload', ?)""",
            (test_user["id"],),
        )
        await db.commit()
    assert await get_chapter_source(4003) == "upload"


async def test_chapters_endpoint_returns_chapter_source(client, test_user):
    """HTTP layer exposes chapter_source so the frontend badge can read it."""
    await save_book(4010, _META, "Some prose. " * 200)
    clear_cache(4010)
    resp = await client.get("/api/books/4010/chapters")
    assert resp.status_code == 200
    body = resp.json()
    assert body["chapter_source"] == "text"


async def test_chapters_endpoint_marks_epub_when_blob_stored(client, test_user):
    await save_book(4011, _META, "Some prose. " * 200)
    # Provide an EPUB blob that the splitter will reject (too small) — the
    # source classifier reports "epub" because a blob exists, regardless of
    # whether the splitter actually uses it. That matches what the reader
    # should tell the user: "we have an EPUB on file for this book".
    await save_book_epub(4011, b"not a real epub", "")
    clear_cache(4011)
    resp = await client.get("/api/books/4011/chapters")
    assert resp.status_code == 200
    assert resp.json()["chapter_source"] == "epub"
