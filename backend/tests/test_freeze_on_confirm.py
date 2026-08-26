"""Finishing an upload's audit fossilizes it.

Annotations anchor to `chapter_index`, so a split that can still move silently
re-anchors them. Confirming an audit is the moment the reader says "this split is
right", which is exactly when it should be fixed.

The subtlety: `get_chapters` routes any book with a `book_freeze` row to
`book_chapters`. Writing the freeze row without populating that table would make
the book unreadable, so confirm does both.
"""
import aiosqlite

import services.db as db_module
from services.db import save_book, get_book_freeze, get_frozen_chapters

BOOK_ID = 9501
_META = {
    "title": "Notes on a Field Season",
    "authors": ["H. Weiss"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}


async def _make_upload(user_id: int, chapters, book_id: int = BOOK_ID):
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


async def _confirm(client, book_id: int = BOOK_ID, chapters=None):
    payload = chapters or [
        {"title": "Arrival", "original_index": 0},
        {"title": "The Ridge", "original_index": 1},
    ]
    return await client.post(f"/api/books/{book_id}/chapters/confirm", json={"chapters": payload})


# ── the freeze itself ────────────────────────────────────────────────────────

async def test_confirming_freezes_the_book(client, test_user):
    await _make_upload(test_user["id"], [("A", "alpha"), ("B", "beta")])
    resp = await _confirm(client)
    assert resp.status_code == 200

    freeze = await get_book_freeze(BOOK_ID)
    assert freeze is not None
    assert freeze["chapter_source"] == "upload"


async def test_audited_by_records_the_owner(client, test_user):
    """The attestation the one-way door rests on — the user id, per owner decision."""
    await _make_upload(test_user["id"], [("A", "alpha")])
    await _confirm(client, chapters=[{"title": "A", "original_index": 0}])

    freeze = await get_book_freeze(BOOK_ID)
    assert freeze["audited_by"] == str(test_user["id"])


async def test_a_private_upload_is_never_published(client, test_user):
    """`source='upload'` already keeps it out of the catalog; published_at stays
    NULL so nothing downstream can mistake it for library content."""
    await _make_upload(test_user["id"], [("A", "alpha")])
    await _confirm(client, chapters=[{"title": "A", "original_index": 0}])

    freeze = await get_book_freeze(BOOK_ID)
    assert freeze["published_at"] is None

    from services.db import list_audited_books
    assert [b["id"] for b in await list_audited_books()] == []


async def test_content_hash_covers_the_confirmed_text(client, test_user):
    await _make_upload(test_user["id"], [("A", "alpha"), ("B", "beta")])
    await _confirm(client)
    first = (await get_book_freeze(BOOK_ID))["content_sha256"]

    await _make_upload(test_user["id"], [("A", "alpha"), ("B", "DIFFERENT")], book_id=9502)
    await _confirm(client, book_id=9502)
    second = (await get_book_freeze(9502))["content_sha256"]

    assert first and first != second


# ── the book stays readable ──────────────────────────────────────────────────

async def test_frozen_chapters_are_stored_so_the_book_stays_readable(client, test_user):
    """get_chapters routes any frozen book to book_chapters. Writing the freeze
    row without filling that table would leave the reader with nothing."""
    await _make_upload(test_user["id"], [("A", "alpha text"), ("B", "beta text")])
    await _confirm(client)

    rows = await get_frozen_chapters(BOOK_ID)
    assert [r["title"] for r in rows] == ["Arrival", "The Ridge"]
    assert [r["text"] for r in rows] == ["alpha text", "beta text"]


async def test_get_chapters_serves_the_frozen_split(client, test_user):
    await _make_upload(test_user["id"], [("A", "alpha text"), ("B", "beta text")])
    await _confirm(client)

    from services.book_chapters import get_chapters, clear_cache
    clear_cache(BOOK_ID)
    chapters = await get_chapters(BOOK_ID)
    assert [c.title for c in chapters] == ["Arrival", "The Ridge"]


async def test_frozen_chapters_match_the_confirmed_order(client, test_user):
    await _make_upload(test_user["id"], [("A", "one"), ("B", "two"), ("C", "three")])
    await _confirm(client, chapters=[
        {"title": "Third", "original_index": 2},
        {"title": "First", "original_index": 0},
    ])
    rows = await get_frozen_chapters(BOOK_ID)
    assert [(r["chapter_index"], r["title"], r["text"]) for r in rows] == [
        (0, "Third", "three"),
        (1, "First", "one"),
    ]


# ── re-confirming ────────────────────────────────────────────────────────────

async def test_confirming_twice_is_refused(client, test_user):
    """Freezing is a one-way door; the second confirm has no drafts to act on."""
    await _make_upload(test_user["id"], [("A", "alpha")])
    await _confirm(client, chapters=[{"title": "A", "original_index": 0}])

    second = await _confirm(client, chapters=[{"title": "Renamed", "original_index": 0}])
    assert second.status_code == 400

    rows = await get_frozen_chapters(BOOK_ID)
    assert [r["title"] for r in rows] == ["A"]


# ── gutenberg books are untouched ────────────────────────────────────────────

async def test_confirm_is_still_upload_only(client, test_user):
    """A Gutenberg book has no draft chapters and must not be freezable this way —
    admin books are audited and frozen by a session, not by this endpoint."""
    await save_book(9503, _META, "text")
    resp = await _confirm(client, book_id=9503, chapters=[{"title": "X", "original_index": 0}])
    assert resp.status_code == 400
    assert await get_book_freeze(9503) is None
