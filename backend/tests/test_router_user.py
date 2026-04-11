"""
Tests for routers/user.py — profile and Gemini key management.
"""

import pytest
from services.db import get_user_by_id, set_user_gemini_key
from services.auth import encrypt_api_key, decrypt_api_key


async def test_get_me_returns_profile(client, test_user):
    resp = await client.get("/api/user/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == test_user["email"]
    assert data["name"] == test_user["name"]
    assert data["hasGeminiKey"] is False


async def test_get_me_reflects_gemini_key_status(client, test_user):
    await set_user_gemini_key(test_user["id"], encrypt_api_key("AIza-key"))
    resp = await client.get("/api/user/me")
    assert resp.json()["hasGeminiKey"] is True


async def test_save_gemini_key(client, test_user):
    resp = await client.post("/api/user/gemini-key", json={"api_key": "AIza-my-key"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    updated = await get_user_by_id(test_user["id"])
    assert updated["gemini_key"] is not None
    assert decrypt_api_key(updated["gemini_key"]) == "AIza-my-key"


async def test_save_empty_gemini_key_returns_400(client):
    resp = await client.post("/api/user/gemini-key", json={"api_key": "   "})
    assert resp.status_code == 400


async def test_delete_gemini_key(client, test_user):
    await set_user_gemini_key(test_user["id"], encrypt_api_key("AIza-key"))

    resp = await client.delete("/api/user/gemini-key")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    updated = await get_user_by_id(test_user["id"])
    assert updated["gemini_key"] is None


async def test_delete_gemini_key_when_none_does_not_raise(client):
    resp = await client.delete("/api/user/gemini-key")
    assert resp.status_code == 200
