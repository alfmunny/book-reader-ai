"""
Tests for provider selection on POST /ai/qa (insight chat).

The reader can choose which AI provider answers a chat question — Gemini
(default/auto), Claude, or DeepSeek — each using the user's own stored key.
Requested by the repo owner in-session; follows the BYOK columns added with
the provider-key endpoints.
"""

from unittest.mock import AsyncMock, patch

import pytest
from services.auth import encrypt_api_key
from services.db import (
    set_user_gemini_key,
    set_user_claude_key,
    set_user_deepseek_key,
)

QA_BODY = {
    "question": "What is the meaning?",
    "passage": "Some passage",
    "book_title": "Hitchhiker",
    "author": "Adams",
}


async def _set_gemini(user):
    await set_user_gemini_key(user["id"], encrypt_api_key("AIza-key"))


async def _set_claude(user):
    await set_user_claude_key(user["id"], encrypt_api_key("sk-ant-key"))


async def _set_deepseek(user):
    await set_user_deepseek_key(user["id"], encrypt_api_key("sk-ds-key"))


# ── default / auto keeps the Gemini behavior ─────────────────────────────────

async def test_qa_default_uses_gemini(client, test_user):
    await _set_gemini(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.answer_question = AsyncMock(return_value="42")
        resp = await client.post("/api/ai/qa", json=QA_BODY)
    assert resp.status_code == 200
    assert resp.json() == {"answer": "42", "provider": "gemini"}


async def test_qa_provider_auto_prefers_gemini_key(client, test_user):
    await _set_gemini(test_user)
    await _set_claude(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.answer_question = AsyncMock(return_value="via gemini")
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "auto"})
    assert resp.status_code == 200
    assert resp.json()["provider"] == "gemini"


async def test_qa_provider_auto_falls_back_to_claude_key(client, test_user):
    """auto with no Gemini key but a Claude key routes to Claude."""
    await _set_claude(test_user)
    with patch("routers.ai.claude_qa", new_callable=AsyncMock, return_value="via claude") as mock:
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "auto"})
    assert resp.status_code == 200
    assert resp.json() == {"answer": "via claude", "provider": "claude"}
    assert mock.await_args.args[0] == "sk-ant-key"


# ── explicit providers ────────────────────────────────────────────────────────

async def test_qa_provider_claude(client, test_user):
    await _set_claude(test_user)
    with patch("routers.ai.claude_qa", new_callable=AsyncMock, return_value="claude says") as mock:
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "claude"})
    assert resp.status_code == 200
    assert resp.json() == {"answer": "claude says", "provider": "claude"}
    assert mock.await_args.args[0] == "sk-ant-key"


async def test_qa_provider_deepseek(client, test_user):
    await _set_deepseek(test_user)
    with patch("routers.ai.deepseek_qa", new_callable=AsyncMock, return_value="ds says") as mock:
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "deepseek"})
    assert resp.status_code == 200
    assert resp.json() == {"answer": "ds says", "provider": "deepseek"}
    assert mock.await_args.args[0] == "sk-ds-key"


async def test_qa_provider_gemini_explicit(client, test_user):
    await _set_gemini(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.answer_question = AsyncMock(return_value="g")
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "gemini"})
    assert resp.status_code == 200
    assert resp.json()["provider"] == "gemini"


# ── missing keys ──────────────────────────────────────────────────────────────

async def test_qa_provider_claude_without_key_returns_400(client, test_user):
    resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "claude"})
    assert resp.status_code == 400
    assert "Claude" in resp.json()["detail"]


async def test_qa_provider_deepseek_without_key_returns_400(client, test_user):
    resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "deepseek"})
    assert resp.status_code == 400
    assert "DeepSeek" in resp.json()["detail"]


async def test_qa_provider_auto_without_any_key_returns_400(client, test_user):
    resp = await client.post("/api/ai/qa", json=QA_BODY)
    assert resp.status_code == 400


async def test_qa_invalid_provider_returns_422(client, test_user):
    resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "openai"})
    assert resp.status_code == 422


# ── provider errors surface as 500, without leaking details ──────────────────

async def test_qa_claude_error_returns_500(client, test_user):
    await _set_claude(test_user)
    with patch("routers.ai.claude_qa", new_callable=AsyncMock, side_effect=RuntimeError("boom")):
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "claude"})
    assert resp.status_code == 500
    assert "boom" not in resp.json()["detail"]
