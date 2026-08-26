"""An in-progress chapter-split audit persists across sessions.

A long book cannot be audited in one sitting, so every edit autosaves to the
draft and the shelf can show how far in the reader got. Two write paths, because
they have very different costs:

- ``PATCH .../chapters/draft`` — titles and review ticks only. The common case,
  fired on a debounce while typing, and cheap: it never carries chapter text.
- ``PUT .../chapters/draft`` — the whole structure including text. Used after a
  split or merge, which are the only edits that change what text a chapter holds.
"""
import aiosqlite

import services.db as db_module
from services.db import save_book

BOOK_ID = 9401
_META = {
    "title": "Notes on a Field Season",
    "authors": ["H. Weiss"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}


async def _make_upload(user_id: int, chapters: list[tuple[str, str]], book_id: int = BOOK_ID):
    """Create an uploaded book with draft chapters."""
    await save_book(book_id, _META, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "UPDATE books SET source='upload', owner_user_id=? WHERE id=?", (user_id, book_id)
        )
        await db.executemany(
            "INSERT INTO user_book_chapters (book_id, chapter_index, title, text, is_draft)"
            " VALUES (?, ?, ?, ?, 1)",
            [(book_id, i, t, x) for i, (t, x) in enumerate(chapters)],
        )
        await db.commit()


async def _rows(book_id: int = BOOK_ID) -> list[dict]:
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT chapter_index, title, text, reviewed, updated_at, is_draft"
            " FROM user_book_chapters WHERE book_id=? ORDER BY chapter_index",
            (book_id,),
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


async def _demote(user_id: int) -> None:
    """Drop the acting user to a plain role — admins may edit any upload."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE users SET role='user' WHERE id=?", (user_id,))
        await db.commit()

# ── reading a draft back ──────────────────────────────────────────────────────

async def test_draft_returns_review_state(client, test_user):
    await _make_upload(test_user["id"], [("One", "a" * 500), ("Two", "b" * 500)])
    resp = await client.get(f"/api/books/{BOOK_ID}/chapters/draft")
    assert resp.status_code == 200
    chapters = resp.json()["chapters"]
    assert [c["reviewed"] for c in chapters] == [False, False]


async def test_draft_returns_full_text_not_a_preview(client, test_user):
    """A 300-character preview is not enough to judge a split on."""
    body = "para one.\n\npara two.\n\n" + ("x" * 900)
    await _make_upload(test_user["id"], [("One", body)])
    resp = await client.get(f"/api/books/{BOOK_ID}/chapters/draft")
    assert resp.json()["chapters"][0]["text"] == body


# ── PATCH: titles and ticks ───────────────────────────────────────────────────

async def test_patch_saves_titles(client, test_user):
    await _make_upload(test_user["id"], [("One", "a"), ("Two", "b")])
    resp = await client.patch(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [
            {"chapter_index": 0, "title": "1. Arrival"},
            {"chapter_index": 1, "title": "2. The Ridge"},
        ]
    })
    assert resp.status_code == 200
    assert [r["title"] for r in await _rows()] == ["1. Arrival", "2. The Ridge"]


async def test_patch_saves_review_ticks(client, test_user):
    await _make_upload(test_user["id"], [("One", "a"), ("Two", "b")])
    await client.patch(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [{"chapter_index": 0, "reviewed": True}]
    })
    assert [r["reviewed"] for r in await _rows()] == [1, 0]


async def test_patch_stamps_updated_at(client, test_user):
    await _make_upload(test_user["id"], [("One", "a")])
    assert (await _rows())[0]["updated_at"] is None
    await client.patch(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [{"chapter_index": 0, "reviewed": True}]
    })
    assert (await _rows())[0]["updated_at"] is not None


async def test_patch_leaves_text_alone(client, test_user):
    """The cheap path must never touch chapter text."""
    await _make_upload(test_user["id"], [("One", "original text")])
    await client.patch(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [{"chapter_index": 0, "title": "Renamed"}]
    })
    assert (await _rows())[0]["text"] == "original text"


async def test_patch_ignores_an_unknown_chapter_index(client, test_user):
    await _make_upload(test_user["id"], [("One", "a")])
    resp = await client.patch(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [{"chapter_index": 99, "title": "Nowhere"}]
    })
    assert resp.status_code == 200
    assert [r["title"] for r in await _rows()] == ["One"]


# ── PUT: structure after a split or merge ─────────────────────────────────────

async def test_put_splits_a_chapter(client, test_user):
    await _make_upload(test_user["id"], [("Whole", "first half\n\nsecond half")])
    resp = await client.put(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [
            {"title": "First", "text": "first half", "reviewed": True},
            {"title": "Second", "text": "second half"},
        ]
    })
    assert resp.status_code == 200
    rows = await _rows()
    assert [r["title"] for r in rows] == ["First", "Second"]
    assert [r["text"] for r in rows] == ["first half", "second half"]
    assert [r["reviewed"] for r in rows] == [1, 0]


async def test_put_merges_chapters(client, test_user):
    await _make_upload(test_user["id"], [("A", "alpha"), ("B", "beta")])
    await client.put(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [{"title": "A", "text": "alpha\n\nbeta"}]
    })
    rows = await _rows()
    assert len(rows) == 1
    assert rows[0]["text"] == "alpha\n\nbeta"


async def test_put_reindexes_contiguously(client, test_user):
    await _make_upload(test_user["id"], [("A", "a"), ("B", "b"), ("C", "c")])
    await client.put(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [{"title": "A", "text": "a"}, {"title": "C", "text": "c"}]
    })
    assert [r["chapter_index"] for r in await _rows()] == [0, 1]


async def test_put_keeps_rows_as_drafts(client, test_user):
    """Structural saves are autosaves — they must not confirm the book."""
    await _make_upload(test_user["id"], [("A", "a")])
    await client.put(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [{"title": "A", "text": "a"}]
    })
    assert all(r["is_draft"] == 1 for r in await _rows())


async def test_put_rejects_an_empty_chapter_list(client, test_user):
    await _make_upload(test_user["id"], [("A", "a")])
    resp = await client.put(f"/api/books/{BOOK_ID}/chapters/draft", json={"chapters": []})
    assert resp.status_code == 400
    assert len(await _rows()) == 1, "a rejected save must not destroy the draft"


# ── ownership ─────────────────────────────────────────────────────────────────

async def test_patch_rejects_another_users_book(client, test_user):
    from services.db import get_or_create_user
    other = await get_or_create_user("other_g", "other@x.com", "Other", "")
    await _make_upload(other["id"], [("One", "a")])
    await _demote(test_user["id"])
    resp = await client.patch(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [{"chapter_index": 0, "title": "Mine now"}]
    })
    assert resp.status_code == 403
    assert [r["title"] for r in await _rows()] == ["One"]


async def test_put_rejects_another_users_book(client, test_user):
    from services.db import get_or_create_user
    other = await get_or_create_user("other_g2", "other2@x.com", "Other", "")
    await _make_upload(other["id"], [("One", "a")])
    await _demote(test_user["id"])
    resp = await client.put(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [{"title": "Mine now", "text": "x"}]
    })
    assert resp.status_code == 403


async def test_patch_404s_for_a_missing_book(client, test_user):
    resp = await client.patch("/api/books/999999/chapters/draft", json={
        "chapters": [{"chapter_index": 0, "title": "X"}]
    })
    assert resp.status_code == 404


# ── the in-progress list ──────────────────────────────────────────────────────

async def test_drafts_list_reports_audit_progress(client, test_user):
    await _make_upload(test_user["id"], [("A", "a"), ("B", "b"), ("C", "c")])
    await client.patch(f"/api/books/{BOOK_ID}/chapters/draft", json={
        "chapters": [{"chapter_index": 0, "reviewed": True}]
    })
    resp = await client.get("/api/books/uploads/drafts")
    assert resp.status_code == 200
    entry = next(d for d in resp.json() if d["book_id"] == BOOK_ID)
    assert entry["chapter_count"] == 3
    assert entry["reviewed_count"] == 1
    assert entry["title"] == "Notes on a Field Season"


async def test_drafts_list_excludes_confirmed_books(client, test_user):
    await _make_upload(test_user["id"], [("A", "a")])
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE user_book_chapters SET is_draft=0 WHERE book_id=?", (BOOK_ID,))
        await db.commit()
    resp = await client.get("/api/books/uploads/drafts")
    assert [d["book_id"] for d in resp.json()] == []


async def test_drafts_list_is_scoped_to_the_owner(client, test_user):
    from services.db import get_or_create_user
    other = await get_or_create_user("other_g3", "other3@x.com", "Other", "")
    await _make_upload(other["id"], [("A", "a")], book_id=9402)
    await _make_upload(test_user["id"], [("B", "b")], book_id=9403)
    resp = await client.get("/api/books/uploads/drafts")
    assert [d["book_id"] for d in resp.json()] == [9403]


async def test_drafts_list_orders_most_recently_touched_first(client, test_user):
    await _make_upload(test_user["id"], [("A", "a")], book_id=9404)
    await _make_upload(test_user["id"], [("B", "b")], book_id=9405)
    await client.patch("/api/books/9404/chapters/draft", json={
        "chapters": [{"chapter_index": 0, "reviewed": True}]
    })
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "UPDATE user_book_chapters SET updated_at='2099-01-01T00:00:00' WHERE book_id=9405"
        )
        await db.commit()
    resp = await client.get("/api/books/uploads/drafts")
    assert [d["book_id"] for d in resp.json()][:2] == [9405, 9404]
