"""
Extended tests for services/auth.py — encryption, JWT, Google/Apple OAuth,
FastAPI auth dependencies.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

import services.db as db_module
from services.db import init_db, get_or_create_user
from services.auth import (
    encrypt_api_key,
    decrypt_api_key,
    create_jwt,
    decode_jwt,
    verify_google_id_token,
    _get_apple_jwks,
    verify_apple_id_token,
)
import services.auth as auth_module


@pytest.fixture(autouse=True)
async def tmp_db(monkeypatch, tmp_path):
    path = str(tmp_path / "test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()


@pytest.fixture(autouse=True)
def reset_apple_cache():
    """Clear the Apple JWKS cache between tests."""
    auth_module._apple_jwks_cache = None
    yield
    auth_module._apple_jwks_cache = None


# ── Encryption / Decryption ───────────────────────────────────────────────────

def test_encrypt_decrypt_roundtrip():
    plaintext = "my-secret-gemini-key-1234"
    ciphertext = encrypt_api_key(plaintext)
    assert ciphertext != plaintext
    assert decrypt_api_key(ciphertext) == plaintext


def test_encrypt_empty_string():
    ciphertext = encrypt_api_key("")
    assert decrypt_api_key(ciphertext) == ""


def test_decrypt_invalid_ciphertext_raises_500():
    with pytest.raises(HTTPException) as exc_info:
        decrypt_api_key("not-valid-ciphertext")
    assert exc_info.value.status_code == 500


def test_encrypt_produces_different_ciphertext_each_call():
    # Fernet uses random IV — two encryptions of same text differ
    c1 = encrypt_api_key("same")
    c2 = encrypt_api_key("same")
    assert c1 != c2
    assert decrypt_api_key(c1) == "same"
    assert decrypt_api_key(c2) == "same"


# ── JWT ───────────────────────────────────────────────────────────────────────

def test_jwt_create_and_decode_roundtrip():
    token = create_jwt(42, "user@example.com")
    payload = decode_jwt(token)
    assert payload["sub"] == "42"
    assert payload["email"] == "user@example.com"


def test_jwt_decode_expired_token_raises_401():
    from jose import jwt as jose_jwt
    expired_payload = {
        "sub": "1",
        "email": "x@y.com",
        "exp": datetime.now(timezone.utc) - timedelta(days=1),
    }
    token = jose_jwt.encode(expired_payload, auth_module.JWT_SECRET, algorithm="HS256")
    with pytest.raises(HTTPException) as exc_info:
        decode_jwt(token)
    assert exc_info.value.status_code == 401


def test_jwt_decode_tampered_signature_raises_401():
    token = create_jwt(1, "x@y.com")
    tampered = token[:-4] + "xxxx"
    with pytest.raises(HTTPException) as exc_info:
        decode_jwt(tampered)
    assert exc_info.value.status_code == 401


def test_jwt_decode_garbage_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        decode_jwt("not.a.jwt")
    assert exc_info.value.status_code == 401


# ── Google OAuth ──────────────────────────────────────────────────────────────

async def test_verify_google_token_returns_payload():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"sub": "1234", "email": "g@example.com", "aud": "client-id"}

    with (
        patch.object(auth_module, "GOOGLE_CLIENT_ID", "client-id"),
        patch("httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        result = await verify_google_id_token("fake-token")

    assert result["sub"] == "1234"
    assert result["email"] == "g@example.com"


async def test_verify_google_token_skips_aud_check_when_no_client_id():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"sub": "5678", "email": "g2@example.com", "aud": "some-other-client"}

    with (
        patch.object(auth_module, "GOOGLE_CLIENT_ID", ""),
        patch("httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        result = await verify_google_id_token("fake-token")

    assert result["sub"] == "5678"


async def test_verify_google_token_non_200_raises_401():
    mock_resp = MagicMock()
    mock_resp.status_code = 401

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        with pytest.raises(HTTPException) as exc_info:
            await verify_google_id_token("bad-token")
    assert exc_info.value.status_code == 401


async def test_verify_google_token_audience_mismatch_raises_401():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"sub": "x", "aud": "wrong-client"}

    with (
        patch.object(auth_module, "GOOGLE_CLIENT_ID", "my-client-id"),
        patch("httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        with pytest.raises(HTTPException) as exc_info:
            await verify_google_id_token("token")
    assert exc_info.value.status_code == 401


# ── Apple JWKS cache ──────────────────────────────────────────────────────────

async def test_get_apple_jwks_caches_result():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"keys": [{"kid": "k1"}]}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        r1 = await _get_apple_jwks()
        r2 = await _get_apple_jwks()
        assert mock_client.get.call_count == 1  # cached after first call

    assert r1 == r2 == {"keys": [{"kid": "k1"}]}


async def test_get_apple_jwks_non_200_raises_503():
    mock_resp = MagicMock()
    mock_resp.status_code = 503

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        with pytest.raises(HTTPException) as exc_info:
            await _get_apple_jwks()
    assert exc_info.value.status_code == 503


# ── Apple token verification ──────────────────────────────────────────────────

def _fake_apple_jwks():
    return {"keys": [{"kid": "test-kid", "kty": "RSA", "n": "x" * 64, "e": "AQAB"}]}


async def test_verify_apple_token_malformed_header_raises_401():
    # Token with non-base64 header
    with pytest.raises(HTTPException) as exc_info:
        await verify_apple_id_token("!!!.payload.sig")
    assert exc_info.value.status_code == 401


async def test_verify_apple_token_key_not_found_raises_401():
    # Token with a kid that doesn't match any key in JWKS
    import base64, json
    header = base64.urlsafe_b64encode(json.dumps({"kid": "missing-kid", "alg": "RS256"}).encode()).rstrip(b"=").decode()
    fake_token = f"{header}.payload.sig"

    jwks = {"keys": [{"kid": "different-kid"}]}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = jwks
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        with pytest.raises(HTTPException) as exc_info:
            await verify_apple_id_token(fake_token)
    assert exc_info.value.status_code == 401
    assert "not found" in exc_info.value.detail.lower()


# ── FastAPI auth dependencies ─────────────────────────────────────────────────

async def test_get_current_user_blocks_unapproved():
    """Unapproved user gets 403 on protected endpoints."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    # First user is auto-approved admin; second is pending
    await get_or_create_user("g_admin", "admin@example.com", "Admin", "")
    user = await get_or_create_user("g_unapp", "unapp@example.com", "Pending", "")
    assert user["approved"] == 0
    token = create_jwt(user["id"], user["email"])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get(
            "/api/user/reading-progress",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 403


async def test_get_current_user_approved_user_passes():
    """Approved user with valid token gets through."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    user = await get_or_create_user("g_approved", "approved@example.com", "Approved", "")
    assert user["approved"] == 1
    token = create_jwt(user["id"], user["email"])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get(
            "/api/user/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200


async def test_get_current_user_missing_token_returns_401():
    from httpx import AsyncClient, ASGITransport
    from main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/user/me")
    assert resp.status_code == 401


async def test_get_current_user_invalid_token_returns_401():
    from httpx import AsyncClient, ASGITransport
    from main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get(
            "/api/user/me",
            headers={"Authorization": "Bearer garbage.token.here"},
        )
    assert resp.status_code == 401
