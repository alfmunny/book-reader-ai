"""Tests for routers/insights.py — POST, GET, DELETE endpoints."""

import pytest
from httpx import AsyncClient
from services.db import save_book, save_insight

_META = {"title": "Test", "authors": [], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""}


async def test_post_creates_insight_and_returns_it(client: AsyncClient):
    await save_book(1, _META, "text")
    payload = {
        "book_id": 1,
        "chapter_index": 0,
        "question": "What is the theme?",
        "answer": "The theme is love.",
    }
    resp = await client.post("/api/insights", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["book_id"] == 1
    assert data["chapter_index"] == 0
    assert data["question"] == "What is the theme?"
    assert data["answer"] == "The theme is love."
    assert "id" in data


async def test_post_with_null_chapter_index(client: AsyncClient):
    await save_book(5, _META, "text")
    payload = {
        "book_id": 5,
        "chapter_index": None,
        "question": "Who is the author?",
        "answer": "Jane Austen.",
    }
    resp = await client.post("/api/insights", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["chapter_index"] is None
    assert data["book_id"] == 5


async def test_get_returns_insights_for_book_id(client: AsyncClient):
    await save_book(10, _META, "text")
    await save_book(99, _META, "text")
    for i in range(2):
        await client.post(
            "/api/insights",
            json={"book_id": 10, "question": f"Q{i}", "answer": f"A{i}"},
        )
    await client.post(
        "/api/insights",
        json={"book_id": 99, "question": "Other", "answer": "Other"},
    )

    resp = await client.get("/api/insights", params={"book_id": 10})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert all(item["book_id"] == 10 for item in data)


async def test_get_returns_only_current_users_insights(client: AsyncClient, test_user):
    """A second authenticated client should not see the first user's insights."""
    await save_book(7, _META, "text")

    await client.post(
        "/api/insights",
        json={"book_id": 7, "question": "Q1", "answer": "A1"},
    )

    from services.db import get_or_create_user
    other_user = await get_or_create_user(
        google_id="other-google",
        email="other@example.com",
        name="Other User",
        picture="",
    )
    await save_insight(other_user["id"], 7, None, "Q2", "A2")

    resp = await client.get("/api/insights", params={"book_id": 7})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["question"] == "Q1"


async def test_delete_returns_ok(client: AsyncClient):
    await save_book(3, _META, "text")
    resp = await client.post(
        "/api/insights",
        json={"book_id": 3, "question": "Delete me", "answer": "Yes"},
    )
    insight_id = resp.json()["id"]

    del_resp = await client.delete(f"/api/insights/{insight_id}")
    assert del_resp.status_code == 200
    assert del_resp.json() == {"ok": True}


async def test_delete_returns_404_if_not_found(client: AsyncClient):
    resp = await client.delete("/api/insights/999999")
    assert resp.status_code == 404


async def test_delete_returns_404_if_wrong_user(client: AsyncClient, test_user):
    """Insight belonging to another user should not be deletable."""
    from services.db import get_or_create_user

    other_user = await get_or_create_user(
        google_id="other-google-2",
        email="other2@example.com",
        name="Other 2",
        picture="",
    )
    await save_book(4, _META, "text")
    insight = await save_insight(other_user["id"], 4, None, "Q?", "A!")
    insight_id = insight["id"]

    del_resp = await client.delete(f"/api/insights/{insight_id}")
    assert del_resp.status_code == 404


async def test_get_all_returns_insights_across_books(client: AsyncClient, test_user):
    """GET /api/insights/all returns all of the user's insights with book_title."""
    await save_book(20, _META, "text")
    await save_book(21, _META, "text")
    await client.post("/api/insights", json={"book_id": 20, "question": "Q-A", "answer": "A-A"})
    await client.post("/api/insights", json={"book_id": 21, "question": "Q-B", "answer": "A-B"})

    resp = await client.get("/api/insights/all")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    book_ids = {i["book_id"] for i in items}
    assert book_ids == {20, 21}
    assert all("book_title" in i for i in items)


async def test_get_all_returns_own_insights_only(client: AsyncClient, test_user):
    """GET /api/insights/all must not return other users' insights."""
    await save_book(30, _META, "text")
    from services.db import get_or_create_user

    other = await get_or_create_user(
        google_id="other-all-g", email="other-all@example.com", name="Other", picture=""
    )
    await client.post("/api/insights", json={"book_id": 30, "question": "Mine", "answer": "yes"})
    await save_insight(other["id"], 30, None, "Theirs", "no")

    resp = await client.get("/api/insights/all")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["question"] == "Mine"


async def test_insights_require_auth(anon_client):
    resp = await anon_client.get("/api/insights?book_id=1")
    assert resp.status_code == 401

    resp = await anon_client.get("/api/insights/all")
    assert resp.status_code == 401

    resp = await anon_client.post("/api/insights", json={"book_id": 1, "question": "Q", "answer": "A"})
    assert resp.status_code == 401


async def test_post_insight_rejects_nonexistent_book(client: AsyncClient):
    """POST /insights for a book that doesn't exist must return 404.

    SQLite FK enforcement is OFF so the INSERT would otherwise silently
    succeed and store an orphaned row referencing a non-existent book."""
    resp = await client.post(
        "/api/insights",
        json={"book_id": 777777, "question": "Q?", "answer": "A."},
    )
    assert resp.status_code == 404


async def test_post_insight_rejects_empty_question(client: AsyncClient):
    """POST /insights with empty question must return 400."""
    await save_book(1, _META, "text")
    resp = await client.post(
        "/api/insights",
        json={"book_id": 1, "question": "", "answer": "Some answer."},
    )
    assert resp.status_code == 400


async def test_post_insight_rejects_empty_answer(client: AsyncClient):
    """POST /insights with empty answer must return 400."""
    await save_book(1, _META, "text")
    resp = await client.post(
        "/api/insights",
        json={"book_id": 1, "question": "What is the theme?", "answer": ""},
    )
    assert resp.status_code == 400


async def test_post_insight_rejects_negative_chapter_index(client: AsyncClient):
    """POST /insights with chapter_index < 0 must return 422 (Pydantic ge=0).
    A negative chapter_index is not a valid position — rejected at validation layer."""
    await save_book(1, _META, "text")
    resp = await client.post(
        "/api/insights",
        json={"book_id": 1, "question": "Q?", "answer": "A.", "chapter_index": -5},
    )
    assert resp.status_code == 422


async def test_save_insight_select_runs_before_commit(tmp_db, test_user, monkeypatch):
    """Regression #351: SELECT must execute before COMMIT in save_insight.

    If COMMIT precedes SELECT, a concurrent delete_book (which cascades to
    book_insights) can remove the just-inserted row between the two operations,
    causing the SELECT to return None and dict(row) to crash with TypeError.
    """
    import aiosqlite as _real_aiosqlite
    import services.db as db_module
    from services.db import save_book, save_insight

    await save_book(1, _META, "text")

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

    await save_insight(test_user["id"], 1, 0, "Q?", "A.")

    assert "COMMIT" in events and "SELECT" in events
    assert events.index("SELECT") < events.index("COMMIT"), (
        "SELECT must run before COMMIT in save_insight — otherwise a "
        "concurrent delete_book can delete the row and crash dict(None) (#351)"
    )


# ── Upload book access control ─────────────────────────────────────────────


async def test_create_insight_blocked_for_non_owner_upload(client, test_user, tmp_db, insert_private_book):
    """Creating an insight on someone else's uploaded book returns 403."""
    from services.db import get_or_create_user, set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("ins-owner-gid", "ins-owner@ex.com", "InsOwner", "")
    await insert_private_book(8901, owner["id"])
    resp = await client.post("/api/insights", json={
        "book_id": 8901,
        "question": "What is it about?",
        "answer": "Private stuff.",
    })
    assert resp.status_code == 403, resp.text


async def test_get_insights_blocked_for_non_owner_upload(client, test_user, tmp_db, insert_private_book):
    """GET /insights?book_id=N returns 403 for non-owner of a private uploaded book (#397)."""
    from services.db import get_or_create_user, set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("ins-owner-get-gid", "ins-owner-get@ex.com", "InsOwnerGet", "")
    await insert_private_book(8902, owner["id"])
    resp = await client.get("/api/insights?book_id=8902")
    assert resp.status_code == 403, resp.text


async def test_get_insights_returns_404_for_missing_book(client, test_user, tmp_db):
    """GET /insights?book_id=N returns 404 when book doesn't exist (#397)."""
    resp = await client.get("/api/insights?book_id=999999")
    assert resp.status_code == 404, resp.text


async def test_create_insight_out_of_bounds_chapter_returns_400(client, test_user, tmp_db):
    """POST /insights rejects chapter_index beyond the book's chapter count (issue #450)."""
    from services.db import save_book
    from services.book_chapters import clear_cache as _clear
    _META2 = {"title": "T2", "authors": [], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""}
    text = "CHAPTER I\n\n" + "word " * 200 + "\n\nCHAPTER II\n\n" + "word " * 200
    await save_book(9883, {**_META2, "id": 9883}, text)
    _clear()
    resp = await client.post(
        "/api/insights",
        json={"book_id": 9883, "chapter_index": 999, "question": "Q?", "answer": "A."},
    )
    assert resp.status_code == 400, f"Expected 400 for out-of-bounds chapter, got {resp.status_code}: {resp.text}"
    assert "out of range" in resp.json()["detail"].lower()


async def test_post_insight_oversized_question_returns_422(client, test_user, tmp_db):
    """POST /insights rejects question longer than max_length (issue #496)."""
    await save_book(9884, {**_META, "id": 9884}, "text")
    resp = await client.post(
        "/api/insights",
        json={"book_id": 9884, "question": "q" * 2001, "answer": "A."},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized question, got {resp.status_code}"


async def test_post_insight_oversized_answer_returns_422(client, test_user, tmp_db):
    """POST /insights rejects answer longer than max_length (issue #496)."""
    await save_book(9885, {**_META, "id": 9885}, "text")
    resp = await client.post(
        "/api/insights",
        json={"book_id": 9885, "question": "Q?", "answer": "a" * 20001},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized answer, got {resp.status_code}"


async def test_duplicate_insight_returns_existing_row(client, test_user, tmp_db):
    """POST /insights with identical question deduplicates — returns existing row, GET returns 1 entry (issue #497)."""
    await save_book(9887, {**_META, "id": 9887}, "text")
    payload = {"book_id": 9887, "chapter_index": 0, "question": "Q?", "answer": "A."}
    r1 = await client.post("/api/insights", json=payload)
    assert r1.status_code == 200
    r2 = await client.post("/api/insights", json=payload)
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"], "Duplicate POST should return the same insight id"
    resp = await client.get("/api/insights?book_id=9887")
    assert len(resp.json()) == 1, f"Expected 1 insight, got {len(resp.json())}"


async def test_create_insight_negative_chapter_index_returns_422(client, test_user, tmp_db):
    """Regression #717: POST /insights with chapter_index < 0 must return 422."""
    resp = await client.post("/api/insights", json={
        "book_id": 1, "chapter_index": -1,
        "question": "Q?", "answer": "A.",
    })
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


# ── Issue #729: ge=1 bounds on book_id, insight_id ───────────────────────────


async def test_create_insight_negative_book_id_returns_422(client, test_user):
    """Regression #729: POST /insights with book_id < 1 must return 422."""
    resp = await client.post("/api/insights", json={
        "book_id": -1, "chapter_index": 0, "question": "Q?", "answer": "A.",
    })
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_list_insights_negative_book_id_returns_422(client, test_user):
    """Regression #729: GET /insights?book_id=-1 must return 422."""
    resp = await client.get("/api/insights?book_id=-1")
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_delete_insight_negative_id_returns_422(client, test_user):
    """Regression #729: DELETE /insights/{id} with negative id must return 422."""
    resp = await client.delete("/api/insights/-1")
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


# ── Issue #822: save_insight() must not crash when row is None ────────────────


@pytest.mark.asyncio
async def test_save_insight_returns_dict_when_row_is_none(tmp_db, monkeypatch):
    """Regression #822: save_insight() must return {} instead of crashing with
    TypeError when the re-SELECT returns None (concurrent-delete race)."""
    import aiosqlite as _aio
    from services.db import save_book, save_insight

    # book_insights now has FK on user_id (migration 032), so seed user 1.
    from services.db import get_or_create_user
    await get_or_create_user(google_id="g1", email="u1@x", name="U1", picture="")
    await save_book(1, {"title": "T", "authors": [], "languages": ["de"],
                        "subjects": [], "download_count": 0, "cover": ""}, "text")

    # Patch fetchone to simulate the race: INSERT succeeds but re-SELECT finds nothing.
    original_fetchone = _aio.Cursor.fetchone

    call_count = {"n": 0}

    async def _fetchone_returns_none_once(self):
        # Return None only on the re-SELECT inside save_insight.
        if "book_insights" in (self._query if hasattr(self, "_query") else ""):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return None
        return await original_fetchone(self)

    monkeypatch.setattr(_aio.Cursor, "fetchone", _fetchone_returns_none_once)

    # Must not raise TypeError even when fetchone returns None.
    result = await save_insight(1, 1, None, "Q?", "A.")
    assert isinstance(result, dict), f"save_insight must return a dict, got {type(result)}"
