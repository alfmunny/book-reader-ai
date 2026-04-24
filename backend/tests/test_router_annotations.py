"""
Tests for routers/annotations.py — CRUD for book annotations.
"""

import pytest
from services.db import save_book, create_annotation

_BOOK_META = {
    "title": "Test Book",
    "authors": ["Author"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 8001


async def test_create_annotation(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/annotations", json={
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "It was the best of times.",
        "note_text": "Famous opener",
        "color": "yellow",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["book_id"] == BOOK_ID
    assert data["chapter_index"] == 0
    assert data["sentence_text"] == "It was the best of times."
    assert data["note_text"] == "Famous opener"
    assert data["color"] == "yellow"
    assert data["id"] is not None


async def test_create_annotation_defaults(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/annotations", json={
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "A sentence.",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["note_text"] == ""
    assert data["color"] == "yellow"


async def test_get_annotations_for_book(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await create_annotation(test_user["id"], BOOK_ID, 0, "Sentence 1", "note1", "blue")
    await create_annotation(test_user["id"], BOOK_ID, 1, "Sentence 2", "note2", "red")

    resp = await client.get(f"/api/annotations?book_id={BOOK_ID}")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    texts = {a["sentence_text"] for a in items}
    assert "Sentence 1" in texts
    assert "Sentence 2" in texts


async def test_get_annotations_returns_own_only(client, test_user):
    """Annotations from other users should not appear."""
    from services.db import get_or_create_user
    other = await get_or_create_user(
        google_id="other-g", email="other@example.com", name="Other", picture=""
    )
    await save_book(BOOK_ID, _BOOK_META, "text")
    await create_annotation(test_user["id"], BOOK_ID, 0, "My sentence", "mine", "yellow")
    await create_annotation(other["id"], BOOK_ID, 0, "Other sentence", "theirs", "green")

    resp = await client.get(f"/api/annotations?book_id={BOOK_ID}")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["sentence_text"] == "My sentence"


async def test_update_annotation(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    ann = await create_annotation(test_user["id"], BOOK_ID, 0, "Text", "old note", "yellow")

    resp = await client.patch(f"/api/annotations/{ann['id']}", json={
        "note_text": "updated note",
        "color": "blue",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["note_text"] == "updated note"
    assert data["color"] == "blue"


async def test_update_annotation_note_text_only(client, test_user):
    """PATCH with only note_text must work — color should remain unchanged.

    Regression: AnnotationUpdate previously required both fields, so the
    notes-page save (which only sends note_text) always returned 422.
    """
    await save_book(BOOK_ID, _BOOK_META, "text")
    ann = await create_annotation(test_user["id"], BOOK_ID, 0, "Text", "old", "blue")

    resp = await client.patch(f"/api/annotations/{ann['id']}", json={"note_text": "new note"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["note_text"] == "new note"
    assert data["color"] == "blue"  # unchanged


async def test_update_annotation_not_found_returns_404(client, test_user):
    resp = await client.patch("/api/annotations/99999", json={
        "note_text": "x",
        "color": "blue",
    })
    assert resp.status_code == 404


async def test_update_annotation_own_only(client, test_user):
    """Cannot update another user's annotation — 404 rather than 403 (ownership hidden)."""
    from services.db import get_or_create_user
    other = await get_or_create_user(
        google_id="other-g2", email="other2@example.com", name="Other2", picture=""
    )
    await save_book(BOOK_ID, _BOOK_META, "text")
    ann = await create_annotation(other["id"], BOOK_ID, 0, "Their text", "", "yellow")

    resp = await client.patch(f"/api/annotations/{ann['id']}", json={
        "note_text": "hijack",
        "color": "blue",
    })
    assert resp.status_code == 404


async def test_delete_annotation(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    ann = await create_annotation(test_user["id"], BOOK_ID, 0, "To delete", "", "yellow")

    resp = await client.delete(f"/api/annotations/{ann['id']}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Confirm gone
    resp = await client.get(f"/api/annotations?book_id={BOOK_ID}")
    assert resp.json() == []


async def test_delete_annotation_not_found_returns_404(client, test_user):
    resp = await client.delete("/api/annotations/99999")
    assert resp.status_code == 404


async def test_delete_annotation_own_only(client, test_user):
    from services.db import get_or_create_user
    other = await get_or_create_user(
        google_id="other-g3", email="other3@example.com", name="Other3", picture=""
    )
    await save_book(BOOK_ID, _BOOK_META, "text")
    ann = await create_annotation(other["id"], BOOK_ID, 0, "Theirs", "", "yellow")

    resp = await client.delete(f"/api/annotations/{ann['id']}")
    assert resp.status_code == 404


async def test_annotations_require_auth(anon_client):
    resp = await anon_client.get(f"/api/annotations?book_id={BOOK_ID}")
    assert resp.status_code == 401

    resp = await anon_client.post("/api/annotations", json={
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "x",
    })
    assert resp.status_code == 401


async def test_get_all_returns_annotations_across_books(client, test_user):
    """GET /api/annotations/all returns all of the user's annotations with book_title."""
    from services.db import save_book

    await save_book(8101, {**_BOOK_META, "title": "Book A"}, "text")
    await save_book(8102, {**_BOOK_META, "title": "Book B"}, "text")
    await create_annotation(test_user["id"], 8101, 0, "Sentence A", "note A", "yellow")
    await create_annotation(test_user["id"], 8102, 1, "Sentence B", "note B", "blue")

    resp = await client.get("/api/annotations/all")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    book_ids = {a["book_id"] for a in items}
    assert book_ids == {8101, 8102}
    assert all("book_title" in a for a in items)


async def test_get_all_returns_own_annotations_only(client, test_user):
    """GET /api/annotations/all must not include other users' annotations."""
    from services.db import save_book, get_or_create_user

    other = await get_or_create_user(
        google_id="other-all-ann-g", email="other-all-ann@example.com", name="Other", picture=""
    )
    await save_book(8103, _BOOK_META, "text")
    await create_annotation(test_user["id"], 8103, 0, "My sentence", "mine", "yellow")
    await create_annotation(other["id"], 8103, 0, "Their sentence", "theirs", "green")

    resp = await client.get("/api/annotations/all")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["sentence_text"] == "My sentence"


async def test_get_all_requires_auth(anon_client):
    resp = await anon_client.get("/api/annotations/all")
    assert resp.status_code == 401


async def test_create_annotation_rejects_nonexistent_book(client, test_user):
    """POST /annotations for a book that doesn't exist must return 404.

    SQLite FK enforcement is OFF so the INSERT would otherwise silently
    succeed and store an orphaned row referencing a non-existent book."""
    resp = await client.post("/api/annotations", json={
        "book_id": 777777,
        "chapter_index": 0,
        "sentence_text": "Orphan sentence.",
    })
    assert resp.status_code == 404


async def test_create_annotation_rejects_empty_sentence(client, test_user):
    """POST /annotations with empty sentence_text must return 400.

    An annotation with no text context is meaningless and represents a
    client error."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/annotations", json={
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "",
    })
    assert resp.status_code == 400


async def test_create_annotation_rejects_negative_chapter_index(client, test_user):
    """POST /annotations with chapter_index < 0 must return 422 (Pydantic ge=0).
    Negative indices are not valid book positions — rejected at validation layer."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/annotations", json={
        "book_id": BOOK_ID,
        "chapter_index": -1,
        "sentence_text": "Some highlighted text.",
    })
    assert resp.status_code == 422


async def test_create_annotation_select_runs_before_commit(tmp_db, test_user, monkeypatch):
    """Regression #349: SELECT must execute before COMMIT in create_annotation.

    If COMMIT precedes SELECT, a concurrent write on another connection can
    land between the two operations, causing the function to return data it did
    not write (stale-return race). Placing SELECT inside the transaction
    guarantees it only sees the current connection's own uncommitted write.
    """
    import aiosqlite as _real_aiosqlite
    import services.db as db_module
    from services.db import save_book, create_annotation

    await save_book(BOOK_ID, _BOOK_META, "text")

    events: list[str] = []
    orig_connect = _real_aiosqlite.connect

    def patched_connect(database, **kwargs):
        real_cm = orig_connect(database, **kwargs)

        class TrackedConn:
            def __init__(self):
                self._conn = None

            async def __aenter__(self):
                self._conn = await real_cm.__aenter__()
                return self

            async def __aexit__(self, *args):
                return await real_cm.__aexit__(*args)

            @property
            def row_factory(self):
                return self._conn.row_factory

            @row_factory.setter
            def row_factory(self, v):
                self._conn.row_factory = v

            def execute(self, sql, *args, **kwargs):
                if sql.strip().upper().startswith("SELECT"):
                    events.append("SELECT")
                return self._conn.execute(sql, *args, **kwargs)

            async def commit(self):
                events.append("COMMIT")
                return await self._conn.commit()

        return TrackedConn()

    class FakeAiosqlite:
        connect = staticmethod(patched_connect)
        Row = _real_aiosqlite.Row

    monkeypatch.setattr(db_module, "aiosqlite", FakeAiosqlite)

    await create_annotation(test_user["id"], BOOK_ID, 0, "Sentence", "my-note", "yellow")

    assert "COMMIT" in events and "SELECT" in events, "both operations must fire"
    assert events.index("SELECT") < events.index("COMMIT"), (
        "SELECT must run before COMMIT so the return value reflects this "
        "connection's own write, not a concurrent modification (#349)"
    )


async def test_update_annotation_select_runs_before_commit(tmp_db, test_user, monkeypatch):
    """Regression #349: SELECT must execute before COMMIT in update_annotation."""
    import aiosqlite as _real_aiosqlite
    import services.db as db_module
    from services.db import save_book, create_annotation, update_annotation

    await save_book(BOOK_ID, _BOOK_META, "text")
    ann = await create_annotation(test_user["id"], BOOK_ID, 0, "Sentence", "v1", "yellow")

    events: list[str] = []
    orig_connect = _real_aiosqlite.connect

    def patched_connect(database, **kwargs):
        real_cm = orig_connect(database, **kwargs)

        class TrackedConn:
            def __init__(self):
                self._conn = None

            async def __aenter__(self):
                self._conn = await real_cm.__aenter__()
                return self

            async def __aexit__(self, *args):
                return await real_cm.__aexit__(*args)

            @property
            def row_factory(self):
                return self._conn.row_factory

            @row_factory.setter
            def row_factory(self, v):
                self._conn.row_factory = v

            def execute(self, sql, *args, **kwargs):
                if sql.strip().upper().startswith("SELECT"):
                    events.append("SELECT")
                return self._conn.execute(sql, *args, **kwargs)

            async def commit(self):
                events.append("COMMIT")
                return await self._conn.commit()

        return TrackedConn()

    class FakeAiosqlite:
        connect = staticmethod(patched_connect)
        Row = _real_aiosqlite.Row

    monkeypatch.setattr(db_module, "aiosqlite", FakeAiosqlite)

    await update_annotation(ann["id"], test_user["id"], note_text="v2")

    assert "COMMIT" in events and "SELECT" in events, "both operations must fire"
    assert events.index("SELECT") < events.index("COMMIT"), (
        "SELECT must run before COMMIT so update_annotation returns its own "
        "write, not a concurrent modification (#349)"
    )


# ── Upload book access control ─────────────────────────────────────────────


async def test_create_annotation_blocked_for_non_owner_upload(client, test_user, tmp_db, insert_private_book):
    """Creating an annotation on someone else's uploaded book returns 403."""
    from services.db import get_or_create_user, set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("ann-owner-gid", "ann-owner@ex.com", "AnnOwner", "")
    await insert_private_book(8801, owner["id"])
    resp = await client.post("/api/annotations", json={
        "book_id": 8801,
        "chapter_index": 0,
        "sentence_text": "some text",
    })
    assert resp.status_code == 403, resp.text


async def test_get_annotations_blocked_for_non_owner_upload(client, test_user, tmp_db, insert_private_book):
    """GET /annotations?book_id=N returns 403 for non-owner of a private uploaded book (#397)."""
    from services.db import get_or_create_user, set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("ann-owner-get-gid", "ann-owner-get@ex.com", "AnnOwnerGet", "")
    await insert_private_book(8802, owner["id"])
    resp = await client.get(f"/api/annotations?book_id=8802")
    assert resp.status_code == 403, resp.text


async def test_get_annotations_returns_404_for_missing_book(client, test_user, tmp_db):
    """GET /annotations?book_id=N returns 404 when book doesn't exist (#397)."""
    resp = await client.get("/api/annotations?book_id=999998")
    assert resp.status_code == 404, resp.text


async def test_create_annotation_out_of_bounds_chapter_returns_400(client, test_user, tmp_db):
    """POST /annotations rejects chapter_index beyond the book's chapter count (issue #450)."""
    from services.book_chapters import clear_cache as _clear
    text = "CHAPTER I\n\n" + "word " * 200 + "\n\nCHAPTER II\n\n" + "word " * 200
    await save_book(9882, {**_BOOK_META, "id": 9882}, text)
    _clear()
    resp = await client.post(
        "/api/annotations",
        json={"book_id": 9882, "chapter_index": 999, "sentence_text": "some sentence"},
    )
    assert resp.status_code == 400, f"Expected 400 for out-of-bounds chapter, got {resp.status_code}: {resp.text}"
    assert "out of range" in resp.json()["detail"].lower()


# ── Text field max_length validation (Issue #494) ─────────────────────────────

@pytest.mark.asyncio
async def test_create_annotation_oversized_note_text_returns_422(client, test_user, tmp_db):
    """Regression #494: note_text over 10,000 chars must be rejected with 422.

    Without a limit a user could store multi-MB notes, causing DB bloat
    and degrading annotation query performance.
    """
    text = "CHAPTER I\n\n" + "word " * 300
    await save_book(9890, {**_BOOK_META, "id": 9890}, text)
    from services.book_chapters import clear_cache as _clear
    _clear()
    resp = await client.post(
        "/api/annotations",
        json={
            "book_id": 9890,
            "chapter_index": 0,
            "sentence_text": "A sentence.",
            "note_text": "x" * 10_001,
        },
    )
    assert resp.status_code == 422, (
        f"Expected 422 for oversized note_text, got {resp.status_code}: {resp.text[:200]}"
    )


@pytest.mark.asyncio
async def test_create_annotation_oversized_sentence_text_returns_422(client, test_user, tmp_db):
    """Regression #494: sentence_text over 5,000 chars must be rejected with 422."""
    text = "CHAPTER I\n\n" + "word " * 300
    await save_book(9893, {**_BOOK_META, "id": 9893}, text)
    from services.book_chapters import clear_cache as _clear
    _clear()
    resp = await client.post(
        "/api/annotations",
        json={
            "book_id": 9893,
            "chapter_index": 0,
            "sentence_text": "y" * 5_001,
        },
    )
    assert resp.status_code == 422, (
        f"Expected 422 for oversized sentence_text, got {resp.status_code}: {resp.text[:200]}"
    )


async def test_patch_annotation_oversized_note_text_returns_422(client, test_user, tmp_db):
    """PATCH /annotations/{id} rejects note_text longer than max_length (issue #504)."""
    from services.db import save_book
    text = "CHAPTER I\n\n" + "word " * 300
    await save_book(9895, {**_BOOK_META, "id": 9895}, text)
    from services.book_chapters import clear_cache as _clear
    _clear()
    ann = await create_annotation(test_user["id"], 9895, 0, "Some sentence.", "", "yellow")
    resp = await client.patch(
        f"/api/annotations/{ann['id']}",
        json={"note_text": "x" * 10_001},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized note_text in PATCH, got {resp.status_code}"


async def test_create_annotation_negative_chapter_index_returns_422(client, test_user, tmp_db):
    """Regression #717: POST /annotations with chapter_index < 0 must return 422."""
    resp = await client.post("/api/annotations", json={
        "book_id": 1, "chapter_index": -1,
        "sentence_text": "some text", "note_text": "", "color": "yellow",
    })
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


# ── Issue #729: ge=1 bounds on book_id, annotation_id ────────────────────────


async def test_create_annotation_negative_book_id_returns_422(client, test_user):
    """Regression #729: POST /annotations with book_id < 1 must return 422."""
    resp = await client.post("/api/annotations", json={
        "book_id": -1, "chapter_index": 0,
        "sentence_text": "text", "note_text": "", "color": "yellow",
    })
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_list_annotations_negative_book_id_returns_422(client, test_user):
    """Regression #729: GET /annotations?book_id=-1 must return 422."""
    resp = await client.get("/api/annotations?book_id=-1")
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_update_annotation_negative_id_returns_422(client, test_user):
    """Regression #729: PATCH /annotations/{id} with negative id must return 422."""
    resp = await client.patch("/api/annotations/-1", json={"note_text": "note"})
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_delete_annotation_negative_id_returns_422(client, test_user):
    """Regression #729: DELETE /annotations/{id} with negative id must return 422."""
    resp = await client.delete("/api/annotations/-1")
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


# ── Issue #829: create_annotation returns {} instead of crashing when re-SELECT is None ──


@pytest.mark.asyncio
async def test_create_annotation_returns_dict_when_row_is_none(tmp_db, monkeypatch):
    """Regression #829: create_annotation() must return {} not crash when the
    re-SELECT returns None (concurrent-delete race between upsert and re-SELECT)."""
    import aiosqlite as _aio
    from services.db import save_book, create_annotation

    await save_book(BOOK_ID, _BOOK_META, "text")

    original_fetchone = _aio.Cursor.fetchone
    call_count = {"n": 0}

    async def _fetchone_none_once(self):
        if "annotations" in getattr(self, "_query", ""):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return None
        return await original_fetchone(self)

    monkeypatch.setattr(_aio.Cursor, "fetchone", _fetchone_none_once)
    result = await create_annotation(1, BOOK_ID, 0, "sentence", "note", "yellow")
    assert isinstance(result, dict), f"create_annotation must return a dict, got {type(result)}"
