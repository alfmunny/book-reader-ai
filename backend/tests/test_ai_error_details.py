"""
Owner report (2026-08-25): failed chat requests surface as a generic
"AI service request failed" (or, for an empty answer, as silence) — the reader
can't tell an invalid key from an exhausted quota from a provider outage.
/ai/qa and /ai/insight now classify provider failures into actionable
messages (no internals leaked) and reject empty answers.
"""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from services.auth import encrypt_api_key
from services.db import set_user_claude_key, set_user_deepseek_key, set_user_gemini_key

QA_BODY = {
    "question": "What is the meaning?",
    "passage": "Some passage",
    "book_title": "Faust",
    "author": "Goethe",
}

INSIGHT_BODY = {
    "chapter_text": "Some chapter text",
    "book_title": "Faust",
    "author": "Goethe",
}


def _http_status_error(status: int) -> httpx.HTTPStatusError:
    req = httpx.Request("POST", "https://api.example.com")
    return httpx.HTTPStatusError(
        "error", request=req, response=httpx.Response(status, request=req)
    )


class _ProviderError(Exception):
    """Stands in for SDK errors that carry a status_code (e.g. anthropic)."""

    def __init__(self, status_code: int):
        super().__init__("provider error")
        self.status_code = status_code


class _CodeError(Exception):
    """Stands in for google-genai APIError, which carries `code`."""

    def __init__(self, code: int):
        super().__init__("provider error")
        self.code = code


async def test_qa_deepseek_402_names_balance(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    with patch("routers.ai.deepseek_qa", new_callable=AsyncMock, side_effect=_http_status_error(402)):
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "deepseek"})
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "DeepSeek" in detail
    assert "balance" in detail.lower()


async def test_qa_claude_401_names_bad_key(client, test_user):
    await set_user_claude_key(test_user["id"], encrypt_api_key("sk-ant"))
    with patch("routers.ai.claude_qa", new_callable=AsyncMock, side_effect=_ProviderError(401)):
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "claude"})
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "Claude" in detail
    assert "key" in detail.lower()


async def test_qa_gemini_429_names_quota(client, test_user):
    await set_user_gemini_key(test_user["id"], encrypt_api_key("AIza"))
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.answer_question = AsyncMock(side_effect=_CodeError(429))
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "gemini"})
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "Gemini" in detail
    assert "quota" in detail.lower() or "rate limit" in detail.lower()


async def test_qa_timeout_names_no_response(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    with patch("routers.ai.deepseek_qa", new_callable=AsyncMock,
               side_effect=httpx.ReadTimeout("timed out")):
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "deepseek"})
    assert resp.status_code == 502
    assert "respond" in resp.json()["detail"].lower()


async def test_qa_generic_error_does_not_leak_internals(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    with patch("routers.ai.deepseek_qa", new_callable=AsyncMock,
               side_effect=RuntimeError("secret internal boom")):
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "deepseek"})
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "boom" not in detail
    assert "DeepSeek" in detail


async def test_qa_empty_answer_is_an_error_not_silence(client, test_user):
    """An empty answer rendered as a blank chat bubble is the 'silent failure'
    the owner reported — it must be a visible, retryable error instead."""
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    with patch("routers.ai.deepseek_qa", new_callable=AsyncMock, return_value="   "):
        resp = await client.post("/api/ai/qa", json={**QA_BODY, "provider": "deepseek"})
    assert resp.status_code == 502
    assert "empty" in resp.json()["detail"].lower()


async def test_insight_error_detail_names_provider(client, test_user):
    await set_user_claude_key(test_user["id"], encrypt_api_key("sk-ant"))
    with patch("routers.ai.claude_insight", new_callable=AsyncMock, side_effect=_ProviderError(429)):
        resp = await client.post("/api/ai/insight", json={**INSIGHT_BODY, "provider": "claude"})
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "Claude" in detail
    assert "quota" in detail.lower() or "rate limit" in detail.lower()
