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


def test_html_body_text_preserves_div_chapter_wrapper_in_epub():
    """Regression for book 69327 (Kafka, Der Prozess): modern Gutenberg
    prose EPUBs wrap each chapter body in <div class="div1 chapter">. The
    EPUB splitter must not skip that wrapper as a "nested chapter div" —
    that's the top-level body, not a sub-chapter. The HTML path (which
    iterates every chapter div via XPath) still needs the skip, so the
    behaviour is controlled by an opt-in flag."""
    from lxml import html as lxml_html
    from services.splitter import _html_body_text

    html = """
    <body>
      <div class="body">
        <div class="div1 chapter" id="ch1">
          <h2>ERSTES KAPITEL</h2>
          <div class="divBody">
            <p class="first">Jemand mußte Josef K. verleumdet haben, denn ohne daß er etwas Böses getan hätte, wurde er eines Morgens verhaftet.</p>
            <p>Die Köchin der Frau Grubach kam diesmal nicht.</p>
          </div>
        </div>
      </div>
    </body>
    """
    body = lxml_html.fromstring(html)

    # EPUB path (default): chapter-body wrapper is NOT skipped, prose survives.
    text = _html_body_text(body, skip_first_heading=True)
    assert "Jemand mußte Josef K. verleumdet haben" in text, text
    assert "Die Köchin der Frau Grubach" in text, text

    # HTML path: nested chapter divs ARE skipped (the XPath caller already
    # iterates them separately).
    text_html_path = _html_body_text(
        body, skip_first_heading=True, skip_nested_chapter_divs=True,
    )
    assert "Jemand mußte Josef K." not in text_html_path, text_html_path
