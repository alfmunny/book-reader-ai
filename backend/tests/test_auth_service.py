"""
Tests for services/auth.py — JWT creation/verification and Fernet encryption.
"""

import pytest
import httpx
import respx
from jose import JWTError
from fastapi import HTTPException

import services.auth as auth_module
from services.auth import create_jwt, decrypt_api_key, encrypt_api_key, verify_google_id_token


# ── JWT ───────────────────────────────────────────────────────────────────────

def test_create_and_decode_jwt():
    token = create_jwt(user_id=42, email="alice@example.com")
    payload = auth_module.decode_jwt(token)
    assert payload["sub"] == "42"
    assert payload["email"] == "alice@example.com"


def test_decode_invalid_jwt_raises_401():
    with pytest.raises(HTTPException) as exc:
        auth_module.decode_jwt("not.a.valid.token")
    assert exc.value.status_code == 401


def test_decode_tampered_jwt_raises_401():
    token = create_jwt(user_id=1, email="x@x.com")
    tampered = token[:-4] + "XXXX"
    with pytest.raises(HTTPException) as exc:
        auth_module.decode_jwt(tampered)
    assert exc.value.status_code == 401


# ── Fernet encryption ─────────────────────────────────────────────────────────

def test_encrypt_decrypt_roundtrip():
    plaintext = "AIza_my_secret_gemini_key"
    ciphertext = encrypt_api_key(plaintext)
    assert ciphertext != plaintext
    assert decrypt_api_key(ciphertext) == plaintext


def test_encrypted_values_are_not_equal_for_same_input():
    # Fernet uses random IV — two encryptions of same value differ
    c1 = encrypt_api_key("same")
    c2 = encrypt_api_key("same")
    assert c1 != c2


def test_decrypt_garbage_raises_500():
    with pytest.raises(HTTPException) as exc:
        decrypt_api_key("not-valid-ciphertext")
    assert exc.value.status_code == 500


# ── Google ID token verification ──────────────────────────────────────────────

async def test_verify_google_id_token_rejects_bad_response():
    with respx.mock:
        respx.get("https://oauth2.googleapis.com/tokeninfo").mock(
            return_value=httpx.Response(400, json={"error": "invalid_token"})
        )
        with pytest.raises(HTTPException) as exc:
            await verify_google_id_token("bad-token")
    assert exc.value.status_code == 401


async def test_verify_google_id_token_returns_payload():
    payload = {"sub": "12345", "email": "alice@example.com", "name": "Alice", "picture": "", "aud": ""}
    with respx.mock:
        respx.get("https://oauth2.googleapis.com/tokeninfo").mock(
            return_value=httpx.Response(200, json=payload)
        )
        result = await verify_google_id_token("valid-token")
    assert result["email"] == "alice@example.com"


async def test_verify_google_id_token_audience_mismatch(monkeypatch):
    monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_ID", "expected-client-id")
    payload = {"sub": "123", "email": "x@x.com", "aud": "wrong-client-id"}
    with respx.mock:
        respx.get("https://oauth2.googleapis.com/tokeninfo").mock(
            return_value=httpx.Response(200, json=payload)
        )
        with pytest.raises(HTTPException) as exc:
            await verify_google_id_token("token")
    assert exc.value.status_code == 401


# ── OAuth commit-before-read regression (#359) ───────────────────────────────

def _make_order_tracking_aiosqlite(real_aiosqlite, events):
    """Return a fake aiosqlite module that records SELECT/COMMIT order."""
    orig_connect = real_aiosqlite.connect

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
        Row = real_aiosqlite.Row

    return FakeAiosqlite


async def test_get_or_create_user_new_user_select_before_commit(tmp_db, monkeypatch):
    """Regression #359: new-user INSERT in get_or_create_user must SELECT before COMMIT."""
    import aiosqlite as _real_aiosqlite
    import services.db as db_module
    from services.db import get_or_create_user

    events: list[str] = []
    monkeypatch.setattr(db_module, "aiosqlite", _make_order_tracking_aiosqlite(_real_aiosqlite, events))

    await get_or_create_user("gid-new", "new@example.com", "New User", "")

    insert_select = [e for e in events if e in ("SELECT", "COMMIT")]
    assert "COMMIT" in insert_select and "SELECT" in insert_select
    last_select = max(i for i, e in enumerate(insert_select) if e == "SELECT")
    last_commit = max(i for i, e in enumerate(insert_select) if e == "COMMIT")
    assert last_select < last_commit, (
        "SELECT must run before COMMIT in get_or_create_user new-user path (#359)"
    )


async def test_get_or_create_user_github_new_user_select_before_commit(tmp_db, monkeypatch):
    """Regression #359: new-user INSERT in get_or_create_user_github must SELECT before COMMIT."""
    import aiosqlite as _real_aiosqlite
    import services.db as db_module
    from services.db import get_or_create_user_github

    events: list[str] = []
    monkeypatch.setattr(db_module, "aiosqlite", _make_order_tracking_aiosqlite(_real_aiosqlite, events))

    await get_or_create_user_github("gh-new", "gh-new@example.com", "GH New", "")

    insert_select = [e for e in events if e in ("SELECT", "COMMIT")]
    assert "COMMIT" in insert_select and "SELECT" in insert_select
    last_select = max(i for i, e in enumerate(insert_select) if e == "SELECT")
    last_commit = max(i for i, e in enumerate(insert_select) if e == "COMMIT")
    assert last_select < last_commit, (
        "SELECT must run before COMMIT in get_or_create_user_github new-user path (#359)"
    )


async def test_get_or_create_user_apple_new_user_select_before_commit(tmp_db, monkeypatch):
    """Regression #359: new-user INSERT in get_or_create_user_apple must SELECT before COMMIT."""
    import aiosqlite as _real_aiosqlite
    import services.db as db_module
    from services.db import get_or_create_user_apple

    events: list[str] = []
    monkeypatch.setattr(db_module, "aiosqlite", _make_order_tracking_aiosqlite(_real_aiosqlite, events))

    await get_or_create_user_apple("ap-new", "ap-new@example.com", "Apple New")

    insert_select = [e for e in events if e in ("SELECT", "COMMIT")]
    assert "COMMIT" in insert_select and "SELECT" in insert_select
    last_select = max(i for i, e in enumerate(insert_select) if e == "SELECT")
    last_commit = max(i for i, e in enumerate(insert_select) if e == "COMMIT")
    assert last_select < last_commit, (
        "SELECT must run before COMMIT in get_or_create_user_apple new-user path (#359)"
    )


async def test_get_or_create_user_apple_existing_user_update_select_before_commit(tmp_db, monkeypatch):
    """Regression #359: existing-user UPDATE in get_or_create_user_apple must SELECT before COMMIT.

    Apple's COALESCE UPDATE can't be reproduced with manual dict construction,
    so it re-SELECTs after the UPDATE — that SELECT must happen before COMMIT.
    """
    import aiosqlite as _real_aiosqlite
    import services.db as db_module
    from services.db import get_or_create_user_apple

    # Create user first (without monkeypatch, so setup is clean)
    await get_or_create_user_apple("ap-existing", "ap-existing@example.com", "")

    events: list[str] = []
    monkeypatch.setattr(db_module, "aiosqlite", _make_order_tracking_aiosqlite(_real_aiosqlite, events))

    # Second call: existing user, with email/name to trigger the COALESCE UPDATE
    await get_or_create_user_apple("ap-existing", "", "Apple Existing Updated")

    update_events = [e for e in events if e in ("SELECT", "COMMIT")]
    assert "COMMIT" in update_events and "SELECT" in update_events
    last_select = max(i for i, e in enumerate(update_events) if e == "SELECT")
    last_commit = max(i for i, e in enumerate(update_events) if e == "COMMIT")
    assert last_select < last_commit, (
        "SELECT must run before COMMIT in get_or_create_user_apple existing-user UPDATE path (#359)"
    )
