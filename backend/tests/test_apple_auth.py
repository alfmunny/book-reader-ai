"""
Tests for Apple OAuth: service (verify_apple_id_token), db (get_or_create_user_apple),
and router (/auth/apple).

Service tests use a real RSA key pair so we can sign test tokens and verify the full
decode path without hitting Apple's servers.
"""

import json
import time
import pytest
import httpx
import respx
from unittest.mock import AsyncMock, patch

from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
import base64

from fastapi import HTTPException
import services.auth as auth_module
from services.auth import verify_apple_id_token
from services.db import get_or_create_user_apple, get_or_create_user, init_db
import services.db as db_module


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_rsa_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    return private_key, public_key


def _int_to_base64url(n: int) -> str:
    length = (n.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(n.to_bytes(length, "big")).rstrip(b"=").decode()


def _public_key_to_jwk(public_key, kid: str = "test-key-id") -> dict:
    pub_numbers = public_key.public_numbers()
    return {
        "kty": "RSA",
        "kid": kid,
        "use": "sig",
        "alg": "RS256",
        "n": _int_to_base64url(pub_numbers.n),
        "e": _int_to_base64url(pub_numbers.e),
    }


def _make_apple_id_token(private_key, kid: str = "test-key-id", sub: str = "apple-user-123",
                          email: str = "user@privaterelay.appleid.com",
                          issuer: str = "https://appleid.apple.com",
                          audience: str = "com.yourapp.web",
                          exp_offset: int = 3600) -> str:
    from jose import jwt as jose_jwt
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    payload = {
        "iss": issuer,
        "aud": audience,
        "exp": int(time.time()) + exp_offset,
        "iat": int(time.time()),
        "sub": sub,
        "email": email,
    }
    return jose_jwt.encode(payload, private_pem, algorithm="RS256", headers={"kid": kid})


# ── verify_apple_id_token ─────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_jwks_cache():
    """Clear the module-level JWKS cache before each test."""
    auth_module._apple_jwks_cache = None
    yield
    auth_module._apple_jwks_cache = None


async def test_verify_apple_id_token_happy_path(monkeypatch):
    private_key, public_key = _make_rsa_keypair()
    jwk = _public_key_to_jwk(public_key)
    token = _make_apple_id_token(private_key)

    monkeypatch.setattr(auth_module, "APPLE_CLIENT_ID", "com.yourapp.web")

    with respx.mock:
        respx.get(auth_module.APPLE_JWKS_URL).mock(
            return_value=httpx.Response(200, json={"keys": [jwk]})
        )
        payload = await verify_apple_id_token(token)

    assert payload["sub"] == "apple-user-123"
    assert payload["email"] == "user@privaterelay.appleid.com"


async def test_verify_apple_id_token_wrong_key_raises_401(monkeypatch):
    """Token signed with one key, JWKS returns a different key → should fail."""
    private_key, _ = _make_rsa_keypair()
    _, other_public = _make_rsa_keypair()
    jwk = _public_key_to_jwk(other_public)
    token = _make_apple_id_token(private_key)

    monkeypatch.setattr(auth_module, "APPLE_CLIENT_ID", "")

    with respx.mock:
        # Return wrong key both times (initial fetch + cache-bust retry)
        respx.get(auth_module.APPLE_JWKS_URL).mock(
            return_value=httpx.Response(200, json={"keys": [jwk]})
        )
        with pytest.raises(HTTPException) as exc:
            await verify_apple_id_token(token)
    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid Apple ID token"
    assert ":" not in exc.value.detail


async def test_verify_apple_id_token_jwks_unavailable_raises_503():
    with respx.mock:
        respx.get(auth_module.APPLE_JWKS_URL).mock(
            return_value=httpx.Response(503, text="unavailable")
        )
        with pytest.raises(HTTPException) as exc:
            await verify_apple_id_token("any.token.here")
    assert exc.value.status_code == 503


async def test_verify_apple_id_token_unknown_kid_raises_401(monkeypatch):
    """JWKS doesn't contain the kid from the token."""
    private_key, public_key = _make_rsa_keypair()
    jwk = _public_key_to_jwk(public_key, kid="other-kid")
    token = _make_apple_id_token(private_key, kid="test-key-id")

    monkeypatch.setattr(auth_module, "APPLE_CLIENT_ID", "")

    with respx.mock:
        respx.get(auth_module.APPLE_JWKS_URL).mock(
            return_value=httpx.Response(200, json={"keys": [jwk]})
        )
        with pytest.raises(HTTPException) as exc:
            await verify_apple_id_token(token)
    assert exc.value.status_code == 401


# ── get_or_create_user_apple ──────────────────────────────────────────────────

@pytest.fixture(autouse=True)
async def tmp_db(monkeypatch, tmp_path):
    path = str(tmp_path / "test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()


async def test_create_apple_user():
    user = await get_or_create_user_apple("apple-001", "alice@example.com", "Alice")
    assert user["apple_id"] == "apple-001"
    assert user["email"] == "alice@example.com"
    assert user["name"] == "Alice"
    assert user["id"] is not None


async def test_apple_login_idempotent():
    u1 = await get_or_create_user_apple("apple-001", "alice@example.com", "Alice")
    u2 = await get_or_create_user_apple("apple-001", "alice@example.com", "Alice")
    assert u1["id"] == u2["id"]


async def test_apple_subsequent_login_no_name_keeps_existing_name():
    """Apple only sends name on first login — blank name must not overwrite stored name."""
    await get_or_create_user_apple("apple-002", "bob@example.com", "Bob Smith")
    user2 = await get_or_create_user_apple("apple-002", "", "")
    assert user2["name"] == "Bob Smith"


async def test_apple_links_to_existing_google_user():
    """If a Google user with matching email exists, Apple login should link to that account."""
    google_user = await get_or_create_user("g-123", "shared@example.com", "Carol", "")
    apple_user = await get_or_create_user_apple("apple-003", "shared@example.com", "Carol Apple")
    assert apple_user["id"] == google_user["id"]


async def test_apple_first_user_gets_admin():
    user = await get_or_create_user_apple("apple-004", "first@example.com", "First")
    assert user["role"] == "admin"
    assert user["approved"] == 1


async def test_apple_second_user_pending():
    await get_or_create_user_apple("apple-005", "first@example.com", "First")
    user2 = await get_or_create_user_apple("apple-006", "second@example.com", "Second")
    assert user2["role"] == "user"
    assert user2["approved"] == 0


# ── /auth/apple router ────────────────────────────────────────────────────────

FAKE_APPLE_PAYLOAD = {
    "sub": "apple-user-999",
    "email": "test@privaterelay.appleid.com",
    "iss": "https://appleid.apple.com",
    "aud": "com.yourapp.web",
}


async def test_apple_login_returns_token_and_user(client):
    with patch("routers.auth.verify_apple_id_token", new_callable=AsyncMock, return_value=FAKE_APPLE_PAYLOAD):
        resp = await client.post("/api/auth/apple", json={"id_token": "valid-token", "name": "Test User"})

    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["user"]["email"] == "test@privaterelay.appleid.com"
    assert "hasGeminiKey" in data["user"]


async def test_apple_login_invalid_token_returns_401(client):
    with patch(
        "routers.auth.verify_apple_id_token",
        new_callable=AsyncMock,
        side_effect=ValueError("bad apple token"),
    ):
        resp = await client.post("/api/auth/apple", json={"id_token": "bad-token"})

    assert resp.status_code == 401
    detail = resp.json()["detail"]
    assert "bad apple token" not in detail
    assert ":" not in detail


async def test_apple_login_missing_sub_returns_401(client):
    """Payload without 'sub' claim must be rejected."""
    with patch("routers.auth.verify_apple_id_token", new_callable=AsyncMock, return_value={}):
        resp = await client.post("/api/auth/apple", json={"id_token": "token-no-sub"})

    assert resp.status_code == 401


async def test_apple_login_name_optional(client):
    """name field is optional — omitting it should still succeed."""
    with patch("routers.auth.verify_apple_id_token", new_callable=AsyncMock, return_value=FAKE_APPLE_PAYLOAD):
        resp = await client.post("/api/auth/apple", json={"id_token": "valid-token"})

    assert resp.status_code == 200


async def test_apple_login_idempotent_via_router(client):
    """Two logins with same apple sub return the same user id."""
    with patch("routers.auth.verify_apple_id_token", new_callable=AsyncMock, return_value=FAKE_APPLE_PAYLOAD):
        r1 = await client.post("/api/auth/apple", json={"id_token": "token"})
        r2 = await client.post("/api/auth/apple", json={"id_token": "token"})

    assert r1.json()["user"]["id"] == r2.json()["user"]["id"]
