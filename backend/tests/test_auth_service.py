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
