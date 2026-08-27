"""Per-chapter `role` on frozen books (#2755).

Front matter — a printed contents page, a title page, a translator's note —
is a readable chapter that should sit outside the reading path. The reader's
Contents panel can already collapse it (#2745); this is the label it reads.

Phase 1 is plumbing only: the column, the read path and the API. No book is
labelled yet, so every chapter's role is NULL and nothing changes on screen.
"""
import aiosqlite
import pytest

import services.db as db_module
from services.db import save_book, get_frozen_chapters
from services.book_chapters import get_chapters

_META = {
    "id": 0, "title": "Moby Dick", "authors": ["Melville"], "languages": ["en"],
    "subjects": [], "download_count": 0, "cover": "",
}


async def _frozen_book(book_id: int, chapters: list[tuple[str, str, str | None]]) -> None:
    """Seed a frozen book whose chapters carry (title, text, role)."""
    await save_book(book_id, {**_META, "id": book_id}, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, frozen_at,"
            " audited_by, content_sha256, published_at)"
            " VALUES (?, 'html_preference', 'epub', '2026-08-27', 'dev', 'sha', NULL)",
            (book_id,),
        )
        await db.executemany(
            "INSERT INTO book_chapters (book_id, chapter_index, title, text, role)"
            " VALUES (?,?,?,?,?)",
            [(book_id, i, t, x, r) for i, (t, x, r) in enumerate(chapters)],
        )
        await db.commit()


@pytest.fixture(autouse=True)
def _clear_chapter_cache():
    from services import book_chapters
    book_chapters._chapter_cache.clear()
    yield
    book_chapters._chapter_cache.clear()


async def test_book_chapters_accepts_a_role(client):
    """The column exists and round-trips."""
    await _frozen_book(7401, [("Contents", "i. Loomings", "frontmatter"), ("Loomings", "Call me", None)])

    rows = await get_frozen_chapters(7401)

    assert rows[0]["role"] == "frontmatter"
    assert rows[1]["role"] is None, "body text carries no role"


async def test_role_defaults_to_null_for_existing_rows(client):
    """Every chapter frozen before this migration is body text."""
    await save_book(7402, {**_META, "id": 7402}, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, frozen_at,"
            " audited_by, content_sha256, published_at)"
            " VALUES (?, 'html_preference', 'epub', '2026-08-27', 'dev', 'sha', NULL)",
            (7402,),
        )
        # The pre-migration insert shape — no role column named.
        await db.execute(
            "INSERT INTO book_chapters (book_id, chapter_index, title, text) VALUES (?,?,?,?)",
            (7402, 0, "Loomings", "Call me Ishmael."),
        )
        await db.commit()

    assert (await get_frozen_chapters(7402))[0]["role"] is None


async def test_get_chapters_carries_the_role_through(client):
    """The resolver hides where chapters come from — the role must survive it."""
    await _frozen_book(7403, [("Contents", "i. Loomings", "frontmatter"), ("Loomings", "Call me", None)])

    chapters = await get_chapters(7403)

    assert chapters[0].role == "frontmatter"
    assert chapters[1].role is None


async def test_chapters_endpoint_reports_the_role(client):
    await _frozen_book(7404, [("Contents", "i. Loomings", "frontmatter"), ("Loomings", "Call me", None)])

    data = (await client.get("/api/books/7404/chapters")).json()

    assert data["chapters"][0]["role"] == "frontmatter"
    assert data["chapters"][1]["role"] is None


async def test_unfrozen_books_report_no_role(client):
    """A runtime-split book has no artifact to carry labels — role is absent."""
    await save_book(7405, {**_META, "id": 7405}, "Chapter I\n\nCall me Ishmael.")

    data = (await client.get("/api/books/7405/chapters")).json()

    assert data["chapters"][0]["role"] is None
