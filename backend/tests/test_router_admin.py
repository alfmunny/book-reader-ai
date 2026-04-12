"""Tests for admin endpoints — retranslate."""

import json
import pytest
from unittest.mock import patch, AsyncMock
import services.db as db_module
import routers.admin as admin_module
from services.db import init_db, get_or_create_user, get_user_by_id, save_book, save_translation
from services.auth import get_current_user
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

# Two short chapters separated by a heading
BOOK_TEXT = "CHAPTER I\n\nErster Absatz des ersten Kapitels.\n\nZweiter Absatz.\n\nCHAPTER II\n\nErstes Kapitel zwei."


@pytest.fixture
async def admin_db(monkeypatch, tmp_path):
    path = str(tmp_path / "admin-test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    # admin.py imports DB_PATH as a local binding — patch it too
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


async def test_retranslate_creates_new_translation(admin_client, admin_user):
    """Retranslate deletes old cache and produces a fresh translation."""
    # Seed a book
    await save_book(100, BOOK_META, BOOK_TEXT)
    # Seed an old translation for chapter 0
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
    assert data["provider"] in ("gemini", "google")
    mock_translate.assert_awaited_once()


async def test_retranslate_book_not_found(admin_client):
    res = await admin_client.post("/api/admin/translations/999/0/en/retranslate")
    assert res.status_code == 404


async def test_retranslate_chapter_out_of_range(admin_client):
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.post("/api/admin/translations/100/99/en/retranslate")
    assert res.status_code == 400
    assert "out of range" in res.json()["detail"]


async def test_retranslate_non_admin_forbidden(admin_db, admin_user):
    """A non-admin user cannot access the retranslate endpoint."""
    from services.db import set_user_approved
    # Create a second (non-admin) user and approve them
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


async def test_unapproved_user_blocked_on_api(admin_db, admin_user):
    """An unapproved (pending) user gets 403 on regular API endpoints but can access /user/me."""
    from services.auth import create_jwt
    # Create a pending (unapproved) user
    user2 = await get_or_create_user(
        google_id="pending-user", email="pending@example.com", name="Pending", picture=""
    )
    # user2 is NOT approved (second user is pending by default)
    token = create_jwt(user2["id"], user2["email"])
    headers = {"Authorization": f"Bearer {token}"}

    # Use real auth (no dependency override) so the approval check runs
    app.dependency_overrides.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        # Auth-protected API calls should be blocked
        res = await c.post("/api/ai/translate", headers=headers,
                           json={"text": "hello", "source_language": "en", "target_language": "de"})
        assert res.status_code == 403
        assert "pending" in res.json()["detail"].lower()

        # /user/me should still work (so frontend can detect pending status)
        res = await c.get("/api/user/me", headers=headers)
        assert res.status_code == 200
        assert res.json()["approved"] is False
