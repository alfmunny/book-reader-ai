"""
Tests for routers/uploads.py — user book upload endpoints.
"""
import io
import json
import pytest
from unittest.mock import AsyncMock, patch
from services.db import get_or_create_user, get_user_by_id
from services.auth import get_current_user, get_optional_user
from main import app
from httpx import AsyncClient, ASGITransport


# ── Helpers ────────────────────────────────────────────────────────────────────

SAMPLE_TXT = b"""My Test Novel

Chapter 1

This is the first chapter of the book. It has some content that is interesting.

Chapter 2

This is the second chapter. More content follows here and continues on.
"""

SECOND_USER = {
    "google_id": "other-google-id",
    "email": "other@example.com",
    "name": "Other User",
    "picture": "",
}


def _txt_upload(content: bytes = SAMPLE_TXT, filename: str = "test.txt"):
    return {"file": (filename, io.BytesIO(content), "text/plain")}


# ── Tests ─────────────────────────────────────────────────────────────────────

async def test_upload_txt_file_creates_draft_book(client, test_user):
    resp = await client.post("/api/books/upload", files=_txt_upload())
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "book_id" in data
    assert data["format"] == "txt"
    assert isinstance(data["detected_chapters"], list)
    assert len(data["detected_chapters"]) >= 1
    assert data["title"]  # some title detected


async def test_upload_quota_returns_count(client, test_user):
    resp = await client.get("/api/books/upload/quota")
    assert resp.status_code == 200
    data = resp.json()
    assert data["used"] == 0
    assert data["max"] == 10

    # Upload a book and verify count increases
    await client.post("/api/books/upload", files=_txt_upload())
    resp2 = await client.get("/api/books/upload/quota")
    assert resp2.json()["used"] == 1


async def test_upload_quota_exceeded_returns_429(client, test_user):
    # Patch the quota check function to simulate limit reached
    with patch("routers.uploads._user_upload_count", new_callable=AsyncMock, return_value=10):
        resp = await client.post("/api/books/upload", files=_txt_upload())
    assert resp.status_code == 429
    assert "limit" in resp.json()["detail"].lower()


async def test_upload_wrong_format_returns_400(client, test_user):
    resp = await client.post(
        "/api/books/upload",
        files={"file": ("story.pdf", io.BytesIO(b"PDF content"), "application/pdf")},
    )
    assert resp.status_code == 400
    assert "supported" in resp.json()["detail"].lower()


async def test_confirm_chapters_makes_book_readable(client, test_user):
    # Upload first
    upload_resp = await client.post("/api/books/upload", files=_txt_upload())
    assert upload_resp.status_code == 200
    book_id = upload_resp.json()["book_id"]
    detected = upload_resp.json()["detected_chapters"]

    # Confirm chapters
    chapters_to_confirm = [
        {"title": ch["title"], "original_index": ch["index"]}
        for ch in detected
    ]
    confirm_resp = await client.post(
        f"/api/books/{book_id}/chapters/confirm",
        json={"chapters": chapters_to_confirm},
    )
    assert confirm_resp.status_code == 200
    data = confirm_resp.json()
    assert data["ok"] is True
    assert data["chapter_count"] == len(detected)

    # Should now be accessible via /chapters
    chapters_resp = await client.get(f"/api/books/{book_id}/chapters")
    assert chapters_resp.status_code == 200
    ch_data = chapters_resp.json()
    assert len(ch_data["chapters"]) == len(detected)


async def test_delete_uploaded_book(client, test_user):
    upload_resp = await client.post("/api/books/upload", files=_txt_upload())
    book_id = upload_resp.json()["book_id"]

    del_resp = await client.delete(f"/api/books/upload/{book_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["ok"] is True

    # Quota should be back to 0
    quota_resp = await client.get("/api/books/upload/quota")
    assert quota_resp.json()["used"] == 0


async def test_delete_uploaded_book_not_found(client):
    resp = await client.delete("/api/books/upload/99999")
    assert resp.status_code == 404


async def test_cannot_delete_gutenberg_book(client):
    from services.db import save_book
    await save_book(1342, {"id": 1342, "title": "Pride", "authors": [], "languages": [], "subjects": [], "download_count": 0, "cover": ""}, "some text")
    resp = await client.delete("/api/books/upload/1342")
    assert resp.status_code == 400
    assert "gutenberg" in resp.json()["detail"].lower()


async def test_get_draft_chapters_requires_ownership(tmp_db, test_user):
    """Another user cannot access draft chapters that belong to test_user."""
    # Upload as test_user
    async def _test_user_override():
        return await get_user_by_id(test_user["id"])

    app.dependency_overrides[get_current_user] = _test_user_override
    app.dependency_overrides[get_optional_user] = _test_user_override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        upload_resp = await c.post("/api/books/upload", files=_txt_upload())
        book_id = upload_resp.json()["book_id"]
    app.dependency_overrides.clear()

    # Now access as a different user
    other_user = await get_or_create_user(**SECOND_USER)

    async def _other_user_override():
        return await get_user_by_id(other_user["id"])

    app.dependency_overrides[get_current_user] = _other_user_override
    app.dependency_overrides[get_optional_user] = _other_user_override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        draft_resp = await c.get(f"/api/books/{book_id}/chapters/draft")
    app.dependency_overrides.clear()

    assert draft_resp.status_code == 403


async def test_get_draft_chapters_before_confirm(client, test_user):
    upload_resp = await client.post("/api/books/upload", files=_txt_upload())
    book_id = upload_resp.json()["book_id"]

    draft_resp = await client.get(f"/api/books/{book_id}/chapters/draft")
    assert draft_resp.status_code == 200
    data = draft_resp.json()
    assert "chapters" in data
    assert len(data["chapters"]) >= 1


async def test_chapters_endpoint_returns_400_for_draft_book(client, test_user):
    """Before confirming, /books/{id}/chapters should return 400."""
    upload_resp = await client.post("/api/books/upload", files=_txt_upload())
    book_id = upload_resp.json()["book_id"]

    chapters_resp = await client.get(f"/api/books/{book_id}/chapters")
    assert chapters_resp.status_code == 400
