"""Tests for admin endpoints — users, books, audio, translations, stats."""

import json
import pytest
from unittest.mock import patch, AsyncMock
import aiosqlite
import services.db as db_module
import routers.admin as admin_module
from services.db import (
    init_db, get_or_create_user, get_user_by_id, save_book,
    save_translation, set_user_approved,
)
from services.auth import get_current_user, create_jwt
from main import app
from httpx import AsyncClient, ASGITransport


ADMIN_USER = {
    "google_id": "admin-google-id",
    "email": "admin@example.com",
    "name": "Admin",
    "picture": "",
}

BOOK_META = {
    "id": 100,
    "title": "Test Book",
    "authors": ["Author"],
    "languages": ["de"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}

BOOK_TEXT = "CHAPTER I\n\nErster Absatz des ersten Kapitels.\n\nZweiter Absatz.\n\nCHAPTER II\n\nErstes Kapitel zwei."


@pytest.fixture
async def admin_db(monkeypatch, tmp_path):
    path = str(tmp_path / "admin-test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    monkeypatch.setattr(admin_module, "DB_PATH", path)
    await init_db()
    return path


@pytest.fixture
async def admin_user(admin_db):
    """First user is auto-admin."""
    return await get_or_create_user(**ADMIN_USER)


@pytest.fixture
async def admin_client(admin_user):
    async def _override():
        return await get_user_by_id(admin_user["id"])

    app.dependency_overrides[get_current_user] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


# ── Users ────────────────────────────────────────────────────────────────────

async def test_get_users(admin_client, admin_user):
    res = await admin_client.get("/api/admin/users")
    assert res.status_code == 200
    users = res.json()
    assert len(users) >= 1
    assert any(u["email"] == "admin@example.com" for u in users)


async def test_approve_user(admin_client, admin_db):
    user2 = await get_or_create_user(
        google_id="user2", email="u2@test.com", name="User2", picture=""
    )
    res = await admin_client.put(
        f"/api/admin/users/{user2['id']}/approve",
        json={"approved": True},
    )
    assert res.status_code == 200
    updated = await get_user_by_id(user2["id"])
    assert updated["approved"] == 1


async def test_change_role(admin_client, admin_db):
    user2 = await get_or_create_user(
        google_id="user2", email="u2@test.com", name="User2", picture=""
    )
    await set_user_approved(user2["id"], True)
    res = await admin_client.put(
        f"/api/admin/users/{user2['id']}/role",
        json={"role": "admin"},
    )
    assert res.status_code == 200
    updated = await get_user_by_id(user2["id"])
    assert updated["role"] == "admin"


async def test_change_role_invalid(admin_client):
    res = await admin_client.put("/api/admin/users/1/role", json={"role": "superuser"})
    assert res.status_code == 400


async def test_cannot_demote_self(admin_client, admin_user):
    res = await admin_client.put(
        f"/api/admin/users/{admin_user['id']}/role",
        json={"role": "user"},
    )
    assert res.status_code == 400
    assert "yourself" in res.json()["detail"].lower()


async def test_delete_user(admin_client, admin_db):
    user2 = await get_or_create_user(
        google_id="del-user", email="del@test.com", name="Del", picture=""
    )
    res = await admin_client.delete(f"/api/admin/users/{user2['id']}")
    assert res.status_code == 200
    assert await get_user_by_id(user2["id"]) is None


async def test_cannot_delete_self(admin_client, admin_user):
    res = await admin_client.delete(f"/api/admin/users/{admin_user['id']}")
    assert res.status_code == 400


# ── Books ────────────────────────────────────────────────────────────────────

async def test_get_books(admin_client, admin_db):
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.get("/api/admin/books")
    assert res.status_code == 200
    books = res.json()
    assert len(books) >= 1
    assert books[0]["text_length"] > 0


async def test_delete_book(admin_client, admin_db):
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.delete("/api/admin/books/100")
    assert res.status_code == 200


# ── Translations ─────────────────────────────────────────────────────────────

async def test_get_translations(admin_client, admin_db):
    await save_translation(100, 0, "en", ["Hello"])
    res = await admin_client.get("/api/admin/translations")
    assert res.status_code == 200
    assert len(res.json()) >= 1


async def test_delete_book_translations(admin_client, admin_db):
    await save_translation(100, 0, "en", ["Hello"])
    res = await admin_client.delete("/api/admin/translations/100")
    assert res.status_code == 200
    assert res.json()["deleted"] >= 1


async def test_delete_specific_translation(admin_client, admin_db):
    await save_translation(100, 0, "en", ["Hello"])
    await save_translation(100, 0, "de", ["Hallo"])
    res = await admin_client.delete("/api/admin/translations/100/0/en")
    assert res.status_code == 200
    assert res.json()["deleted"] == 1


# ── Audio ────────────────────────────────────────────────────────────────────

async def test_get_audio_empty(admin_client, admin_db):
    res = await admin_client.get("/api/admin/audio")
    assert res.status_code == 200
    assert res.json() == []


async def test_delete_book_audio(admin_client, admin_db):
    res = await admin_client.delete("/api/admin/audio/999")
    assert res.status_code == 200
    assert res.json()["deleted"] == 0


# ── Stats ────────────────────────────────────────────────────────────────────

async def test_stats(admin_client, admin_db):
    res = await admin_client.get("/api/admin/stats")
    assert res.status_code == 200
    data = res.json()
    assert "users_total" in data
    assert "books_cached" in data
    assert "audio_cache_mb" in data
    assert data["users_total"] >= 1


# ── Retranslate ──────────────────────────────────────────────────────────────

async def test_retranslate_creates_new_translation(admin_client, admin_user):
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "en", ["Old stale translation."])

    with patch(
        "routers.admin.do_translate",
        new_callable=AsyncMock,
        return_value=["Fresh paragraph one.", "Fresh paragraph two."],
    ) as mock_translate:
        res = await admin_client.post("/api/admin/translations/100/0/en/retranslate")

    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["paragraphs_count"] == 2
    mock_translate.assert_awaited_once()


async def test_retranslate_book_not_found(admin_client):
    res = await admin_client.post("/api/admin/translations/999/0/en/retranslate")
    assert res.status_code == 404


async def test_retranslate_chapter_out_of_range(admin_client):
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.post("/api/admin/translations/100/99/en/retranslate")
    assert res.status_code == 400


async def test_retranslate_non_admin_forbidden(admin_db, admin_user):
    user2 = await get_or_create_user(
        google_id="user2", email="user2@example.com", name="User 2", picture=""
    )
    await set_user_approved(user2["id"], True)

    async def _override():
        return await get_user_by_id(user2["id"])

    app.dependency_overrides[get_current_user] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.post("/api/admin/translations/100/0/en/retranslate")
    app.dependency_overrides.clear()

    assert res.status_code == 403


# ── Auth / pending user ──────────────────────────────────────────────────────

async def test_unapproved_user_blocked_on_api(admin_db, admin_user):
    user2 = await get_or_create_user(
        google_id="pending-user", email="pending@example.com", name="Pending", picture=""
    )
    token = create_jwt(user2["id"], user2["email"])
    headers = {"Authorization": f"Bearer {token}"}

    app.dependency_overrides.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.post("/api/ai/translate", headers=headers,
                           json={"text": "hello", "source_language": "en", "target_language": "de"})
        assert res.status_code == 403

        res = await c.get("/api/user/me", headers=headers)
        assert res.status_code == 200
        assert res.json()["approved"] is False


# ── Seed popular books SSE ──────────────────────────────────────────────────

def _parse_sse(body: str) -> list[dict]:
    import json as _json
    events = []
    for block in body.strip().split("\n\n"):
        event = None
        data = None
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                data = _json.loads(line.removeprefix("data:").strip())
        if event and data is not None:
            events.append({"event": event, **data})
    return events


async def test_seed_popular_skips_already_cached(admin_client, admin_db, monkeypatch, tmp_path):
    """A manifest entry whose book is already in the DB is counted as cached,
    not re-downloaded. Verifies the polling-based seed job."""
    import json as _json
    import asyncio
    from services.seed_popular import manager as seed_manager, SeedPopularManager

    # Fresh manager so tests don't share state
    monkeypatch.setattr("services.seed_popular._manager", SeedPopularManager())
    monkeypatch.setattr("routers.admin.bulk_manager", bulk_manager := __import__("services.bulk_translate").bulk_translate.manager)  # unchanged

    manifest = [{
        "id": 100, "title": "Test Book",
        "authors": ["Author"], "languages": ["en"],
        "download_count": 100, "cover": "",
    }]
    manifest_path = tmp_path / "popular_books.json"
    manifest_path.write_text(_json.dumps(manifest))
    import os as _os
    original_join = _os.path.join
    def _fake_join(*parts):
        joined = original_join(*parts)
        if joined.endswith("popular_books.json"):
            return str(manifest_path)
        return joined
    monkeypatch.setattr(_os.path, "join", _fake_join)

    await save_book(100, manifest[0], "Some text")

    with patch("services.seed_popular.get_book_meta") as m_meta, \
         patch("services.seed_popular.get_book_text") as m_text:
        res = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res.status_code == 200

        # Wait for the background task to complete
        mgr = __import__("services.seed_popular", fromlist=["manager"]).manager()
        while mgr.is_running():
            await asyncio.sleep(0.01)

        status = await admin_client.get("/api/admin/books/seed-popular/status")
        body = status.json()
        assert body["state"]["status"] == "completed"
        assert body["state"]["already_cached"] == 1
        assert body["state"]["total"] == 0
        m_meta.assert_not_called()
        m_text.assert_not_called()


async def test_seed_popular_downloads_missing_books(admin_client, admin_db, monkeypatch, tmp_path):
    """A manifest entry whose book isn't cached triggers download + save."""
    import json as _json
    import asyncio
    from services.seed_popular import SeedPopularManager
    monkeypatch.setattr("services.seed_popular._manager", SeedPopularManager())

    manifest = [{
        "id": 101, "title": "New Book",
        "authors": ["Author"], "languages": ["en"],
        "download_count": 50, "cover": "",
    }]
    manifest_path = tmp_path / "popular_books.json"
    manifest_path.write_text(_json.dumps(manifest))
    import os as _os
    original_join = _os.path.join
    def _fake_join(*parts):
        joined = original_join(*parts)
        if joined.endswith("popular_books.json"):
            return str(manifest_path)
        return joined
    monkeypatch.setattr(_os.path, "join", _fake_join)

    meta_mock = AsyncMock(return_value={**manifest[0], "subjects": []})
    text_mock = AsyncMock(return_value="Book text " * 50)
    with patch("services.seed_popular.get_book_meta", meta_mock), \
         patch("services.seed_popular.get_book_text", text_mock):
        res = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res.status_code == 200

        mgr = __import__("services.seed_popular", fromlist=["manager"]).manager()
        while mgr.is_running():
            await asyncio.sleep(0.01)

        status = await admin_client.get("/api/admin/books/seed-popular/status")
        body = status.json()
        assert body["state"]["status"] == "completed"
        assert body["state"]["downloaded"] == 1
        assert body["state"]["failed"] == 0

    from services.db import get_cached_book
    cached = await get_cached_book(101)
    assert cached is not None
    assert cached["title"] == "New Book"


async def test_seed_popular_refuses_concurrent_start(admin_client, admin_db, monkeypatch, tmp_path):
    """Second start while one is running returns 409."""
    import json as _json
    import asyncio
    from services.seed_popular import SeedPopularManager
    monkeypatch.setattr("services.seed_popular._manager", SeedPopularManager())

    manifest = [{"id": 102, "title": "X", "authors": [], "languages": ["en"],
                 "download_count": 1, "cover": ""}]
    manifest_path = tmp_path / "popular_books.json"
    manifest_path.write_text(_json.dumps(manifest))
    import os as _os
    original_join = _os.path.join
    monkeypatch.setattr(
        _os.path, "join",
        lambda *p: str(manifest_path) if original_join(*p).endswith("popular_books.json") else original_join(*p),
    )

    # Make the job slow by mocking get_book_meta to sleep
    async def slow_meta(book_id):
        await asyncio.sleep(1)
        return {"id": book_id, "title": "X", "authors": [], "languages": ["en"],
                "subjects": [], "download_count": 1, "cover": ""}
    async def fake_text(book_id):
        return "text"

    with patch("services.seed_popular.get_book_meta", slow_meta), \
         patch("services.seed_popular.get_book_text", fake_text):
        res1 = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res1.status_code == 200

        res2 = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res2.status_code == 409

        # Clean up — stop the job
        await admin_client.post("/api/admin/books/seed-popular/stop")
