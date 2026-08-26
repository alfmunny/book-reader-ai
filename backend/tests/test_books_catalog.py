"""The published catalog lists audited books only (#2711).

Books are added by an admin/architect session that audits the chapter split and
writes a `book_freeze` row. Until that happens the book is not published, so the
home page must not list it.
"""
import aiosqlite

import services.db as db_module
from services.db import save_book, list_audited_books

_META = {
    "title": "Faust",
    "authors": ["Goethe"],
    "languages": ["de"],
    "subjects": ["Drama"],
    "download_count": 10,
    "cover": "",
}


async def _freeze(book_id: int, audited_by: str = "alfmunny") -> None:
    """Freeze *and* publish — these tests are about what the catalog lists.

    Freezing alone no longer publishes (migration 046); the gate itself is
    covered in test_publish_gate.py.
    """
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, frozen_at,"
            " audited_by, content_sha256, published_at) VALUES (?, 'html_preference',"
            " 'epub', '2026-08-26', ?, 'abc', '2026-08-26')",
            (book_id, audited_by),
        )
        await db.commit()


async def test_catalog_lists_an_audited_book(client, test_user):
    await save_book(7101, _META, "text")
    await _freeze(7101)
    titles = [b["title"] for b in await list_audited_books()]
    assert titles == ["Faust"]


async def test_catalog_omits_a_book_that_was_never_audited(client, test_user):
    await save_book(7102, {**_META, "title": "Unaudited"}, "text")
    assert await list_audited_books() == []


async def test_catalog_omits_uploaded_books(client, test_user):
    """Uploaded titles are private to their owner even once frozen."""
    await save_book(7103, {**_META, "title": "Private Upload"}, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE books SET source = 'upload' WHERE id = 7103")
        await db.commit()
    await _freeze(7103)
    assert await list_audited_books() == []


async def test_catalog_decodes_json_columns(client, test_user):
    await save_book(7104, _META, "text")
    await _freeze(7104)
    book = (await list_audited_books())[0]
    assert book["authors"] == ["Goethe"]
    assert book["languages"] == ["de"]
    assert book["subjects"] == ["Drama"]


async def test_catalog_survives_a_malformed_json_column(client, test_user):
    await save_book(7105, _META, "text")
    await _freeze(7105)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE books SET authors = 'not json' WHERE id = 7105")
        await db.commit()
    assert (await list_audited_books())[0]["authors"] == []


async def test_catalog_is_sorted_by_title(client, test_user):
    for bid, title in ((7106, "Zueignung"), (7107, "Alice"), (7108, "middlemarch")):
        await save_book(bid, {**_META, "title": title}, "text")
        await _freeze(bid)
    titles = [b["title"] for b in await list_audited_books()]
    assert titles == ["Alice", "middlemarch", "Zueignung"]


async def test_catalog_endpoint_returns_audited_books(client, test_user):
    await save_book(7109, _META, "text")
    await _freeze(7109)
    await save_book(7110, {**_META, "title": "Unaudited"}, "text")

    resp = await client.get("/api/books/catalog")
    assert resp.status_code == 200
    assert [b["title"] for b in resp.json()] == ["Faust"]


async def test_cached_endpoint_still_lists_everything(client, test_user):
    """/cached is the admin-facing view and must not start hiding books."""
    await save_book(7111, {**_META, "title": "Unaudited"}, "text")
    resp = await client.get("/api/books/cached")
    assert "Unaudited" in [b["title"] for b in resp.json()]
