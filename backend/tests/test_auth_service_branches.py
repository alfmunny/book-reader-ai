"""
Branch-coverage tests for services/auth.py.

Targets:
- Line 29: _fernet() when ENCRYPTION_KEY env var is set
- Line 163: get_current_user() — user not found in DB → 401
- Lines 177-189: get_optional_user() — all branches
"""

import os
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException, Request
from cryptography.fernet import Fernet

import services.auth as auth_module
from services.auth import (
    _fernet,
    get_current_user,
    get_optional_user,
    create_jwt,
    encrypt_api_key,
    decrypt_api_key,
)


# ── _fernet() with explicit ENCRYPTION_KEY ────────────────────────────────────

def test_fernet_uses_encryption_key_env_var():
    """Line 29: when ENCRYPTION_KEY is set, _fernet() should use it directly."""
    key = Fernet.generate_key().decode()
    with patch.dict(os.environ, {"ENCRYPTION_KEY": key}):
        f = _fernet()
    # Verify it's a working Fernet instance with the right key
    test_msg = b"hello"
    encrypted = f.encrypt(test_msg)
    # Build a second Fernet from the same key and check decryption
    f2 = Fernet(key.encode())
    assert f2.decrypt(encrypted) == test_msg


def test_fernet_with_env_key_roundtrip():
    """Encrypt with env-key-based _fernet, decrypt with same key."""
    key = Fernet.generate_key().decode()
    with patch.dict(os.environ, {"ENCRYPTION_KEY": key}):
        ciphertext = encrypt_api_key("my-secret-api-key")
        plaintext = decrypt_api_key(ciphertext)
    assert plaintext == "my-secret-api-key"


# ── get_current_user() — user deleted from DB ────────────────────────────────

def _make_request(token: str | None = None, path: str = "/api/books") -> Request:
    """Build a minimal fake Request for FastAPI dependency tests."""
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "query_string": b"",
        "headers": [],
    }
    if token is not None:
        scope["headers"] = [(b"authorization", f"Bearer {token}".encode())]
    return Request(scope)


async def test_get_current_user_raises_401_when_user_not_in_db():
    """Line 163: valid JWT but user deleted from DB → 401."""
    token = create_jwt(user_id=999, email="ghost@example.com")
    request = _make_request(token=token)

    with patch("services.auth.get_user_by_id", new_callable=AsyncMock, return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request)

    assert exc_info.value.status_code == 401
    assert "not found" in exc_info.value.detail.lower()


async def test_get_current_user_raises_403_when_not_approved():
    """Valid JWT, user exists but not approved, path is not /user/me → 403."""
    token = create_jwt(user_id=1, email="pending@example.com")
    request = _make_request(token=token, path="/api/books")

    user = {"id": 1, "email": "pending@example.com", "approved": False}
    with patch("services.auth.get_user_by_id", new_callable=AsyncMock, return_value=user):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request)

    assert exc_info.value.status_code == 403


async def test_get_current_user_allows_unapproved_on_me_endpoint():
    """/user/me endpoint is exempt from approval check."""
    token = create_jwt(user_id=1, email="pending@example.com")
    request = _make_request(token=token, path="/api/user/me")

    user = {"id": 1, "email": "pending@example.com", "approved": False}
    with patch("services.auth.get_user_by_id", new_callable=AsyncMock, return_value=user):
        result = await get_current_user(request)

    assert result["email"] == "pending@example.com"


async def test_get_current_user_returns_approved_user():
    """Happy path: approved user is returned."""
    token = create_jwt(user_id=42, email="alice@example.com")
    request = _make_request(token=token)

    user = {"id": 42, "email": "alice@example.com", "approved": True}
    with patch("services.auth.get_user_by_id", new_callable=AsyncMock, return_value=user):
        result = await get_current_user(request)

    assert result["id"] == 42


# ── get_optional_user() — all branches ───────────────────────────────────────

async def test_get_optional_user_no_auth_header_returns_none():
    """Lines 177-179: no Authorization header → return None."""
    request = _make_request(token=None)
    result = await get_optional_user(request)
    assert result is None


async def test_get_optional_user_non_bearer_header_returns_none():
    """Header present but not Bearer → return None."""
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/books",
        "query_string": b"",
        "headers": [(b"authorization", b"Basic dXNlcjpwYXNz")],
    }
    request = Request(scope)
    result = await get_optional_user(request)
    assert result is None


async def test_get_optional_user_valid_token_user_not_found_returns_none():
    """Lines 184-186: valid token but user not in DB → return None."""
    token = create_jwt(user_id=999, email="ghost@example.com")
    request = _make_request(token=token)

    with patch("services.auth.get_user_by_id", new_callable=AsyncMock, return_value=None):
        result = await get_optional_user(request)

    assert result is None


async def test_get_optional_user_valid_token_not_approved_returns_none():
    """Line 185: user exists but not approved → return None."""
    token = create_jwt(user_id=5, email="pending@example.com")
    request = _make_request(token=token)

    user = {"id": 5, "email": "pending@example.com", "approved": False}
    with patch("services.auth.get_user_by_id", new_callable=AsyncMock, return_value=user):
        result = await get_optional_user(request)

    assert result is None


async def test_get_optional_user_exception_during_decode_returns_none():
    """Lines 188-189: any exception during token decode → return None (no raise)."""
    # "Bearer " prefix present but token is garbage → decode_jwt raises HTTPException
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/books",
        "query_string": b"",
        "headers": [(b"authorization", b"Bearer this.is.garbage")],
    }
    request = Request(scope)
    result = await get_optional_user(request)
    assert result is None


async def test_get_optional_user_valid_approved_user_returns_user():
    """Lines 186-187: valid token, approved user → return user dict."""
    token = create_jwt(user_id=42, email="alice@example.com")
    request = _make_request(token=token)

    user = {"id": 42, "email": "alice@example.com", "approved": True}
    with patch("services.auth.get_user_by_id", new_callable=AsyncMock, return_value=user):
        result = await get_optional_user(request)

    assert result is not None
    assert result["id"] == 42
    assert result["email"] == "alice@example.com"
