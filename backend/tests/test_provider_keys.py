"""
Tests for per-user Claude and DeepSeek API key storage (BYOK), mirroring the
Gemini key endpoints. Requested by the repo owner in-session; groundwork for
provider selection in the insight chat.
"""

import pytest
from services.db import (
    get_user_by_id,
    set_user_claude_key,
    set_user_deepseek_key,
)
from services.auth import encrypt_api_key, decrypt_api_key


# ── /me flags ─────────────────────────────────────────────────────────────────

async def test_get_me_has_provider_key_flags_false_by_default(client):
    resp = await client.get("/api/user/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["hasClaudeKey"] is False
    assert data["hasDeepseekKey"] is False


async def test_get_me_reflects_claude_key_status(client, test_user):
    await set_user_claude_key(test_user["id"], encrypt_api_key("sk-ant-key"))
    resp = await client.get("/api/user/me")
    assert resp.json()["hasClaudeKey"] is True
    assert resp.json()["hasDeepseekKey"] is False


async def test_get_me_reflects_deepseek_key_status(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds-key"))
    resp = await client.get("/api/user/me")
    assert resp.json()["hasDeepseekKey"] is True
    assert resp.json()["hasClaudeKey"] is False


# ── save ──────────────────────────────────────────────────────────────────────

async def test_save_claude_key(client, test_user):
    resp = await client.post("/api/user/claude-key", json={"api_key": "sk-ant-my-key"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    updated = await get_user_by_id(test_user["id"])
    assert updated["claude_key"] is not None
    assert decrypt_api_key(updated["claude_key"]) == "sk-ant-my-key"


async def test_save_deepseek_key(client, test_user):
    resp = await client.post("/api/user/deepseek-key", json={"api_key": "sk-ds-my-key"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    updated = await get_user_by_id(test_user["id"])
    assert updated["deepseek_key"] is not None
    assert decrypt_api_key(updated["deepseek_key"]) == "sk-ds-my-key"


async def test_save_whitespace_claude_key_returns_400(client):
    resp = await client.post("/api/user/claude-key", json={"api_key": "   "})
    assert resp.status_code == 400


async def test_save_empty_claude_key_returns_422(client):
    resp = await client.post("/api/user/claude-key", json={"api_key": ""})
    assert resp.status_code == 422


async def test_save_overlong_deepseek_key_returns_422(client):
    resp = await client.post("/api/user/deepseek-key", json={"api_key": "x" * 501})
    assert resp.status_code == 422


# ── delete ────────────────────────────────────────────────────────────────────

async def test_delete_claude_key(client, test_user):
    await set_user_claude_key(test_user["id"], encrypt_api_key("sk-ant-key"))

    resp = await client.delete("/api/user/claude-key")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    updated = await get_user_by_id(test_user["id"])
    assert updated["claude_key"] is None


async def test_delete_deepseek_key(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds-key"))

    resp = await client.delete("/api/user/deepseek-key")
    assert resp.status_code == 200

    updated = await get_user_by_id(test_user["id"])
    assert updated["deepseek_key"] is None


async def test_delete_provider_key_when_none_does_not_raise(client):
    resp = await client.delete("/api/user/claude-key")
    assert resp.status_code == 200
    resp = await client.delete("/api/user/deepseek-key")
    assert resp.status_code == 200


# ── keys are independent ──────────────────────────────────────────────────────

async def test_provider_keys_are_independent(client, test_user):
    await client.post("/api/user/claude-key", json={"api_key": "sk-ant-a"})
    await client.post("/api/user/deepseek-key", json={"api_key": "sk-ds-b"})

    resp = await client.delete("/api/user/claude-key")
    assert resp.status_code == 200

    updated = await get_user_by_id(test_user["id"])
    assert updated["claude_key"] is None
    assert decrypt_api_key(updated["deepseek_key"]) == "sk-ds-b"
