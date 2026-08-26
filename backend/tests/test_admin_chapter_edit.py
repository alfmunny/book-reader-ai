"""An admin can fix a bad split on a book in the review queue.

Finding a bad split used to be a dead end: the chapters were frozen and nothing
in the UI could change them. Freezing is a source selector, not a lock — it stops
the splitter drifting, it does not forbid deliberate correction.

The one thing that must not happen is re-anchoring live notes: annotations,
vocabulary occurrences and translations all store a bare chapter_index. A book in
the queue has none of those, which is exactly why editing there is safe.
"""
import aiosqlite

import services.db as db_module
from services.db import save_book, get_book_freeze, get_frozen_chapters

_META = {"title": "Faust", "authors": ["Goethe"], "languages": ["de"],
         "subjects": [], "download_count": 0, "cover": ""}


async def _frozen(book_id: int, chapters, published: bool = False):
    await save_book(book_id, _META, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.executemany(
            "INSERT INTO book_chapters (book_id, chapter_index, title, text) VALUES (?,?,?,?)",
            [(book_id, i, t, x) for i, (t, x) in enumerate(chapters)],
        )
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, frozen_at,"
            " audited_by, content_sha256, published_at)"
            " VALUES (?, 'html_preference', 'epub', '2026-08-26', 'architect', 'old', ?)",
            (book_id, "2026-08-26" if published else None),
        )
        await db.commit()


# ── reading ───────────────────────────────────────────────────────────────────

async def test_admin_reads_the_frozen_chapters(client, test_user):
    await _frozen(7501, [("One", "alpha"), ("Two", "beta")])
    resp = await client.get("/api/admin/books/7501/chapters")
    assert resp.status_code == 200
    body = resp.json()
    assert [c["title"] for c in body["chapters"]] == ["One", "Two"]
    assert body["chapters"][0]["text"] == "alpha"


async def test_reading_an_unfrozen_book_404s(client, test_user):
    await save_book(7502, _META, "text")
    assert (await client.get("/api/admin/books/7502/chapters")).status_code == 404


async def test_reading_reports_whether_edits_are_safe(client, test_user):
    """The client needs to know before offering an edit, not after."""
    await _frozen(7503, [("One", "alpha")])
    assert (await client.get("/api/admin/books/7503/chapters")).json()["editable"] is True


# ── rewriting ─────────────────────────────────────────────────────────────────

async def test_admin_rewrites_the_split(client, test_user):
    await _frozen(7504, [("Whole", "first\n\nsecond")])
    resp = await client.put("/api/admin/books/7504/chapters", json={
        "chapters": [{"title": "First", "text": "first"}, {"title": "Second", "text": "second"}],
    })
    assert resp.status_code == 200
    rows = await get_frozen_chapters(7504)
    assert [(r["chapter_index"], r["title"], r["text"]) for r in rows] == [
        (0, "First", "first"), (1, "Second", "second"),
    ]


async def test_rewriting_restamps_the_content_hash(client, test_user):
    """The hash is the attestation that what was reviewed is what is stored."""
    await _frozen(7505, [("One", "alpha")])
    await client.put("/api/admin/books/7505/chapters", json={
        "chapters": [{"title": "One", "text": "changed"}],
    })
    freeze = await get_book_freeze(7505)
    assert freeze["content_sha256"] != "old"


async def test_rewriting_records_who_did_it(client, test_user):
    await _frozen(7506, [("One", "alpha")])
    await client.put("/api/admin/books/7506/chapters", json={
        "chapters": [{"title": "One", "text": "changed"}],
    })
    assert (await get_book_freeze(7506))["audited_by"] == str(test_user["id"])


async def test_rewriting_keeps_the_book_frozen_and_unpublished(client, test_user):
    await _frozen(7507, [("One", "alpha")])
    await client.put("/api/admin/books/7507/chapters", json={
        "chapters": [{"title": "One", "text": "changed"}],
    })
    freeze = await get_book_freeze(7507)
    assert freeze is not None
    assert freeze["published_at"] is None, "editing must not publish"


async def test_rewriting_rejects_an_empty_split(client, test_user):
    await _frozen(7508, [("One", "alpha")])
    resp = await client.put("/api/admin/books/7508/chapters", json={"chapters": []})
    assert resp.status_code == 400
    assert len(await get_frozen_chapters(7508)) == 1, "a refused edit must not destroy the split"


# ── the safety net ────────────────────────────────────────────────────────────

async def test_rewriting_is_refused_once_notes_anchor_to_the_split(client, test_user):
    """A published book with annotations is the case the guard exists for —
    changing the split would silently re-anchor every note."""
    await _frozen(7509, [("One", "alpha"), ("Two", "beta")], published=True)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text, note_text, color)"
            " VALUES (?, 7509, 1, 's', '', 'yellow')",
            (test_user["id"],),
        )
        await db.commit()

    resp = await client.put("/api/admin/books/7509/chapters", json={
        "chapters": [{"title": "Merged", "text": "alpha beta"}],
    })
    assert resp.status_code == 409
    assert "annotation" in resp.json()["detail"].lower()
    assert len(await get_frozen_chapters(7509)) == 2, "the split must be untouched"


async def test_reading_says_a_book_with_notes_is_not_editable(client, test_user):
    await _frozen(7510, [("One", "alpha")], published=True)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text, note_text, color)"
            " VALUES (?, 7510, 0, 's', '', 'yellow')",
            (test_user["id"],),
        )
        await db.commit()
    body = (await client.get("/api/admin/books/7510/chapters")).json()
    assert body["editable"] is False
    assert body["blocked_by"]["annotations"] == 1


async def test_a_queued_book_is_always_editable(client, test_user):
    """Nobody can read an unpublished book, so nothing anchors to it — the guard
    never fires for the case the queue is actually for."""
    await _frozen(7511, [("One", "alpha")])
    assert (await client.get("/api/admin/books/7511/chapters")).json()["editable"] is True


async def test_chapter_edit_requires_admin(client, test_user):
    await _frozen(7512, [("One", "alpha")])
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE users SET role='user' WHERE id=?", (test_user["id"],))
        await db.commit()
    resp = await client.put("/api/admin/books/7512/chapters", json={
        "chapters": [{"title": "X", "text": "y"}],
    })
    assert resp.status_code in (401, 403)
