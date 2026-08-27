"""A reader can reopen the audit on their own book.

Confirming an upload freezes it, and the draft endpoints then refuse — so a
mistake spotted on page three used to be permanent. Meanwhile an admin could edit
any frozen book, which had the asymmetry backwards: a reader's own private book
with nothing anchored to it is the safest possible case to re-split.
"""
import aiosqlite

import services.db as db_module
from services.db import save_book, get_book_freeze, get_frozen_chapters

_META = {"title": "Notes on a Field Season", "authors": ["H. Weiss"],
         "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""}


async def _confirmed_upload(user_id: int, chapters, book_id: int = 7601):
    """An upload past confirm: frozen, chapters stored, drafts gone."""
    await save_book(book_id, _META, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "UPDATE books SET source='upload', owner_user_id=? WHERE id=?", (user_id, book_id)
        )
        await db.executemany(
            "INSERT INTO user_book_chapters (book_id, chapter_index, title, text, is_draft)"
            " VALUES (?, ?, ?, ?, 0)",
            [(book_id, i, t, x) for i, (t, x) in enumerate(chapters)],
        )
        await db.executemany(
            "INSERT INTO book_chapters (book_id, chapter_index, title, text) VALUES (?,?,?,?)",
            [(book_id, i, t, x) for i, (t, x) in enumerate(chapters)],
        )
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, frozen_at,"
            " audited_by, content_sha256, published_at)"
            " VALUES (?, 'user_audit', 'upload', '2026-08-27', ?, 'old', NULL)",
            (book_id, str(user_id)),
        )
        await db.commit()


# ── reading it back ──────────────────────────────────────────────────────────

async def test_owner_reopens_their_confirmed_split(client, test_user):
    await _confirmed_upload(test_user["id"], [("One", "alpha"), ("Two", "beta")])
    resp = await client.get("/api/books/7601/chapters/frozen")
    assert resp.status_code == 200
    body = resp.json()
    assert [c["title"] for c in body["chapters"]] == ["One", "Two"]
    assert body["editable"] is True


async def test_a_fresh_upload_has_nothing_anchored_to_it(client, test_user):
    """Which is the whole reason re-splitting is safe here."""
    await _confirmed_upload(test_user["id"], [("One", "alpha")], book_id=7602)
    assert (await client.get("/api/books/7602/chapters/frozen")).json()["blocked_by"] == {}


async def test_reopening_an_unfrozen_book_404s(client, test_user):
    await save_book(7603, _META, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE books SET source='upload', owner_user_id=? WHERE id=7603",
                         (test_user["id"],))
        await db.commit()
    assert (await client.get("/api/books/7603/chapters/frozen")).status_code == 404


# ── rewriting ────────────────────────────────────────────────────────────────

async def test_owner_rewrites_their_split(client, test_user):
    await _confirmed_upload(test_user["id"], [("Whole", "first\n\nsecond")], book_id=7604)
    resp = await client.put("/api/books/7604/chapters/frozen", json={
        "chapters": [{"title": "First", "text": "first"}, {"title": "Second", "text": "second"}],
    })
    assert resp.status_code == 200
    rows = await get_frozen_chapters(7604)
    assert [(r["chapter_index"], r["title"]) for r in rows] == [(0, "First"), (1, "Second")]


async def test_rewriting_restamps_the_hash_and_the_auditor(client, test_user):
    await _confirmed_upload(test_user["id"], [("One", "alpha")], book_id=7605)
    await client.put("/api/books/7605/chapters/frozen", json={
        "chapters": [{"title": "One", "text": "changed"}],
    })
    freeze = await get_book_freeze(7605)
    assert freeze["content_sha256"] != "old"
    assert freeze["audited_by"] == str(test_user["id"])


async def test_rewriting_keeps_the_upload_private(client, test_user):
    """Re-splitting must never be a route into the catalog."""
    await _confirmed_upload(test_user["id"], [("One", "alpha")], book_id=7606)
    await client.put("/api/books/7606/chapters/frozen", json={
        "chapters": [{"title": "One", "text": "changed"}],
    })
    assert (await get_book_freeze(7606))["published_at"] is None
    from services.db import list_audited_books
    assert await list_audited_books() == []


async def test_the_reader_sees_the_new_split(client, test_user):
    await _confirmed_upload(test_user["id"], [("Whole", "first\n\nsecond")], book_id=7607)
    await client.put("/api/books/7607/chapters/frozen", json={
        "chapters": [{"title": "First", "text": "first"}, {"title": "Second", "text": "second"}],
    })
    from services.book_chapters import get_chapters, clear_cache
    clear_cache(7607)
    assert [c.title for c in await get_chapters(7607)] == ["First", "Second"]


async def test_rewriting_rejects_an_empty_split(client, test_user):
    await _confirmed_upload(test_user["id"], [("One", "alpha")], book_id=7608)
    resp = await client.put("/api/books/7608/chapters/frozen", json={"chapters": []})
    assert resp.status_code == 400
    assert len(await get_frozen_chapters(7608)) == 1


# ── the same guard, and ownership ────────────────────────────────────────────

async def test_rewriting_is_refused_once_notes_anchor_to_it(client, test_user):
    await _confirmed_upload(test_user["id"], [("One", "alpha"), ("Two", "beta")], book_id=7609)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text, note_text, color)"
            " VALUES (?, 7609, 1, 's', '', 'yellow')",
            (test_user["id"],),
        )
        await db.commit()

    resp = await client.put("/api/books/7609/chapters/frozen", json={
        "chapters": [{"title": "Merged", "text": "alpha beta"}],
    })
    assert resp.status_code == 409
    assert len(await get_frozen_chapters(7609)) == 2


async def test_another_reader_cannot_touch_it(client, test_user):
    from services.db import get_or_create_user
    other = await get_or_create_user("resplit_other", "ro@x.com", "O", "")
    await _confirmed_upload(other["id"], [("One", "alpha")], book_id=7610)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE users SET role='user' WHERE id=?", (test_user["id"],))
        await db.commit()

    assert (await client.get("/api/books/7610/chapters/frozen")).status_code == 403
    resp = await client.put("/api/books/7610/chapters/frozen", json={
        "chapters": [{"title": "X", "text": "y"}],
    })
    assert resp.status_code == 403


async def test_a_library_book_is_not_the_readers_to_edit(client, test_user):
    """Gutenberg books go through the admin queue, not this route."""
    await save_book(7611, _META, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, frozen_at,"
            " audited_by, content_sha256) VALUES (7611, 's', 'epub', '2026-08-27', 'architect', 'h')"
        )
        await db.execute("UPDATE users SET role='user' WHERE id=?", (test_user["id"],))
        await db.commit()
    assert (await client.get("/api/books/7611/chapters/frozen")).status_code == 403
