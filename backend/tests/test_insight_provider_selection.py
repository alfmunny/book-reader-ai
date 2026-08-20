"""
Tests for provider selection on POST /ai/insight, mirroring /ai/qa.

The chapter insight uses the same provider dispatch as the chat: "auto"
picks the first provider the user has a key for; explicit providers 400
without a stored key. Requested by the repo owner in-session — a user with
only a Claude key was locked out of the insight box entirely.
"""

from unittest.mock import AsyncMock, patch

import pytest
from services.auth import encrypt_api_key
from services.db import set_user_gemini_key, set_user_claude_key, set_user_deepseek_key

INSIGHT_BODY = {
    "chapter_text": "Call me Ishmael.",
    "book_title": "Moby Dick",
    "author": "Melville",
}


async def test_insight_default_uses_gemini(client, test_user):
    await set_user_gemini_key(test_user["id"], encrypt_api_key("AIza-key"))
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.generate_insight = AsyncMock(return_value="an insight")
        resp = await client.post("/api/ai/insight", json=INSIGHT_BODY)
    assert resp.status_code == 200
    assert resp.json() == {"insight": "an insight", "provider": "gemini"}


async def test_insight_auto_falls_back_to_claude_key(client, test_user):
    await set_user_claude_key(test_user["id"], encrypt_api_key("sk-ant-key"))
    with patch("routers.ai.claude_insight", new_callable=AsyncMock, return_value="claude insight") as mock:
        resp = await client.post("/api/ai/insight", json=INSIGHT_BODY)
    assert resp.status_code == 200
    assert resp.json() == {"insight": "claude insight", "provider": "claude"}
    assert mock.await_args.args[0] == "sk-ant-key"


async def test_insight_provider_deepseek(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds-key"))
    with patch("routers.ai.deepseek_insight", new_callable=AsyncMock, return_value="ds insight") as mock:
        resp = await client.post("/api/ai/insight", json={**INSIGHT_BODY, "provider": "deepseek"})
    assert resp.status_code == 200
    assert resp.json()["provider"] == "deepseek"
    assert mock.await_args.args[0] == "sk-ds-key"


async def test_insight_provider_claude_without_key_returns_400(client, test_user):
    resp = await client.post("/api/ai/insight", json={**INSIGHT_BODY, "provider": "claude"})
    assert resp.status_code == 400
    assert "Claude" in resp.json()["detail"]


async def test_insight_without_any_key_returns_400(client, test_user):
    resp = await client.post("/api/ai/insight", json=INSIGHT_BODY)
    assert resp.status_code == 400
