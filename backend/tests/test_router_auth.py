"""
Tests for routers/auth.py  — Google OAuth login endpoint.
"""

import pytest
from unittest.mock import AsyncMock, patch


FAKE_GOOGLE_INFO = {
    "sub": "google-123",
    "email": "user@example.com",
    "name": "Test User",
    "picture": "https://pic.example.com/a.jpg",
}

FAKE_GITHUB_PROFILE = {
    "id": "gh-123",
    "email": "gh@example.com",
    "name": "GH User",
    "picture": "https://avatars.github.com/1",
}


async def test_google_login_returns_token_and_user(client):
    with patch("routers.auth.verify_google_id_token", new_callable=AsyncMock, return_value=FAKE_GOOGLE_INFO):
        resp = await client.post("/api/auth/google", json={"id_token": "valid-token"})

    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["user"]["email"] == "user@example.com"
    assert data["user"]["name"] == "Test User"
    assert "hasGeminiKey" in data["user"]


async def test_google_login_invalid_token_returns_401(client):
    with patch(
        "routers.auth.verify_google_id_token",
        new_callable=AsyncMock,
        side_effect=ValueError("bad token"),
    ):
        resp = await client.post("/api/auth/google", json={"id_token": "bad-token"})

    assert resp.status_code == 401
    detail = resp.json()["detail"]
    assert "bad token" not in detail
    assert ":" not in detail


async def test_google_login_creates_user_in_db(client, tmp_db):
    with patch("routers.auth.verify_google_id_token", new_callable=AsyncMock, return_value=FAKE_GOOGLE_INFO):
        resp = await client.post("/api/auth/google", json={"id_token": "valid-token"})

    assert resp.status_code == 200
    # Second login with same google_id should return same user
    with patch("routers.auth.verify_google_id_token", new_callable=AsyncMock, return_value=FAKE_GOOGLE_INFO):
        resp2 = await client.post("/api/auth/google", json={"id_token": "valid-token"})

    assert resp2.json()["user"]["id"] == resp.json()["user"]["id"]


async def test_google_login_missing_optional_fields(client):
    minimal_info = {"sub": "google-456"}
    with patch("routers.auth.verify_google_id_token", new_callable=AsyncMock, return_value=minimal_info):
        resp = await client.post("/api/auth/google", json={"id_token": "token"})

    assert resp.status_code == 200
    assert resp.json()["user"]["email"] == ""


# ── GitHub login ──────────────────────────────────────────────────────────────

async def test_github_login_returns_token_and_user(client):
    with patch("routers.auth.verify_github_access_token", new_callable=AsyncMock, return_value=FAKE_GITHUB_PROFILE):
        resp = await client.post("/api/auth/github", json={"access_token": "ghp_valid"})
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["user"]["email"] == "gh@example.com"
    assert data["user"]["name"] == "GH User"
    assert "hasGeminiKey" in data["user"]


async def test_github_login_missing_access_token_returns_422(client):
    resp = await client.post("/api/auth/github", json={"access_token": ""})
    assert resp.status_code == 422


async def test_github_login_invalid_token_returns_401(client):
    from fastapi import HTTPException as FastAPIHTTPException
    with patch(
        "routers.auth.verify_github_access_token",
        new_callable=AsyncMock,
        side_effect=FastAPIHTTPException(status_code=401, detail="Invalid GitHub access token"),
    ):
        resp = await client.post("/api/auth/github", json={"access_token": "bad-token"})
    assert resp.status_code == 401
    assert "Invalid GitHub access token" in resp.json()["detail"]


async def test_github_login_idempotent(client, tmp_db):
    with patch("routers.auth.verify_github_access_token", new_callable=AsyncMock,
               return_value={"id": "gh-456", "email": "repeat@example.com", "name": "Repeat", "picture": ""}):
        resp1 = await client.post("/api/auth/github", json={"access_token": "ghp_tok1"})
    with patch("routers.auth.verify_github_access_token", new_callable=AsyncMock,
               return_value={"id": "gh-456", "email": "repeat@example.com", "name": "Repeat", "picture": ""}):
        resp2 = await client.post("/api/auth/github", json={"access_token": "ghp_tok2"})
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json()["user"]["id"] == resp2.json()["user"]["id"]


# ── Oversized token bounds checks (regression for #537) ──────────────────────

async def test_google_login_oversized_id_token_returns_422(client):
    resp = await client.post("/api/auth/google", json={"id_token": "x" * 2001})
    assert resp.status_code == 422


async def test_github_login_oversized_access_token_returns_422(client):
    resp = await client.post("/api/auth/github", json={"access_token": "x" * 501})
    assert resp.status_code == 422


async def test_apple_login_oversized_id_token_returns_422(client):
    resp = await client.post("/api/auth/apple", json={"id_token": "x" * 2001, "name": "Alice"})
    assert resp.status_code == 422


async def test_apple_login_oversized_name_returns_422(client):
    resp = await client.post("/api/auth/apple", json={"id_token": "valid-token", "name": "x" * 501})
    assert resp.status_code == 422


# ── Issue #918: empty string token/text fields ────────────────────────────────


async def test_google_login_empty_id_token_returns_422(client):
    """Regression #918: POST /auth/google with id_token='' must return 422."""
    resp = await client.post("/api/auth/google", json={"id_token": ""})
    assert resp.status_code == 422, f"Expected 422 for empty id_token, got {resp.status_code}: {resp.text}"


async def test_github_login_empty_access_token_returns_422(client):
    """Regression #918: POST /auth/github with access_token='' must return 422."""
    resp = await client.post("/api/auth/github", json={"access_token": ""})
    assert resp.status_code == 422, f"Expected 422 for empty access_token, got {resp.status_code}: {resp.text}"


async def test_apple_login_empty_id_token_returns_422(client):
    """Regression #918: POST /auth/apple with id_token='' must return 422."""
    resp = await client.post("/api/auth/apple", json={"id_token": "", "name": "Alice"})
    assert resp.status_code == 422, f"Expected 422 for empty id_token, got {resp.status_code}: {resp.text}"
