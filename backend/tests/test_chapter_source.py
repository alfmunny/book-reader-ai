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


# ── Faust / Kafka title-page + duplicate-title regressions ─────────────────

def test_strip_title_from_body_prefix_drops_matching_line():
    """If a chapter's body text opens with the chapter title itself,
    _strip_title_from_body_prefix drops that line so the reader doesn't
    render the header twice (Faust Nacht, book 2229)."""
    from services.splitter import _strip_title_from_body_prefix
    body = "FAUST: Der Tragödie erster Teil\n\nNacht\n\nIn einem hochgewölbten..."
    out = _strip_title_from_body_prefix(body, "FAUST: Der Tragödie erster Teil")
    assert out.startswith("Nacht")


def test_strip_title_leaves_unrelated_body_alone():
    from services.splitter import _strip_title_from_body_prefix
    body = "Once upon a time\n\nmore prose"
    out = _strip_title_from_body_prefix(body, "Chapter 1")
    assert out == body


def test_epub_frontmatter_blocks_detects_gutenberg_classes():
    """Kafka's pg-header wraps each frontmatter piece in
    <div class="div1 titlepage"> / cover / frenchtitle / copyright. The
    helper finds them all by class so build_chapters_from_epub can strip
    them before the word-count filter runs."""
    from lxml import html as lxml_html
    from services.splitter import _epub_frontmatter_blocks
    html = """
    <body>
      <div class="body">
        <div class="div1 cover"><p>cover text</p></div>
        <div class="div1 titlepage"><h1>Title</h1></div>
        <div class="div1 frenchtitle"><p>AUTHOR</p></div>
        <div class="div1 copyright"><p>(c) 1925</p></div>
        <div class="chapter"><p>real prose</p></div>
      </div>
    </body>
    """
    body = lxml_html.fromstring(html)
    fm = _epub_frontmatter_blocks(body)
    assert len(fm) == 4


def test_epub_toc_containers_detects_pginternal_table():
    """Gutenberg title-page spine items often hold a <table> whose every
    row is a single <a class="pginternal"> link to another spine item
    (book 2229 Faust). Dropping the table lets the 30-word cutoff filter
    the whole spine item out so it doesn't become a rogue chapter 0."""
    from lxml import html as lxml_html
    from services.splitter import _epub_toc_containers
    html = """
    <body>
      <table>
        <tr><td><a class="pginternal" href="ch1.xhtml#c1">Zueignung</a></td></tr>
        <tr><td><a class="pginternal" href="ch2.xhtml#c2">Vorspiel</a></td></tr>
        <tr><td><a class="pginternal" href="ch3.xhtml#c3">Prolog im Himmel</a></td></tr>
        <tr><td><a class="pginternal" href="ch4.xhtml#c4">Nacht</a></td></tr>
      </table>
      <p>This is not a TOC.</p>
      <table>
        <tr><td>Random</td><td>table cell</td></tr>
      </table>
    </body>
    """
    body = lxml_html.fromstring(html)
    toc = _epub_toc_containers(body)
    assert len(toc) == 1  # only the pginternal-dominated table qualifies
