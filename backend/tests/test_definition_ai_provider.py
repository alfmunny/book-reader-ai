"""
Tests for the AI dictionary fallback's provider selection (owner request,
2026-08-25): author-invented German compounds like "Himmelslichts" have no
Wiktionary entry, and the AI fallback was Gemini-only — users with a DeepSeek
or Claude key got nothing. The fallback now uses the first configured provider
in the chat's auto order: deepseek → gemini → claude.
"""

from unittest.mock import AsyncMock, patch

import pytest
from services.auth import encrypt_api_key
from services.db import (
    set_user_gemini_key,
    set_user_claude_key,
    set_user_deepseek_key,
)
from services import wiktionary

EMPTY_WIKT = {
    "lemma": "Himmelslichts", "language": "de", "definitions": [],
    "form_of": None, "url": "https://en.wiktionary.org/wiki/Himmelslichts",
}
AI_JSON = (
    '{"lemma":"Himmelslicht","definitions":['
    '{"pos":"compound","text":"Himmel (heaven) + Licht (light): light of heaven"},'
    '{"pos":"noun","text":"heavenly light, poetic"}]}'
)


# ── router: provider order deepseek → gemini → claude ────────────────────────

async def test_definition_fallback_uses_deepseek_key(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds-key"))
    with patch("services.wiktionary.lookup", new=AsyncMock(return_value=EMPTY_WIKT)), \
         patch("services.deepseek._chat", new=AsyncMock(return_value=AI_JSON)) as mock:
        resp = await client.get("/api/vocabulary/definition/Himmelslichts?lang=de")
    assert resp.status_code == 200
    data = resp.json()
    assert data["lemma"] == "Himmelslicht"
    assert data["definitions"][0]["pos"] == "compound"
    assert mock.await_args.args[0] == "sk-ds-key"


async def test_definition_fallback_prefers_deepseek_over_gemini(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds-key"))
    await set_user_gemini_key(test_user["id"], encrypt_api_key("AIza-key"))
    gemini = AsyncMock()
    with patch("services.wiktionary.lookup", new=AsyncMock(return_value=EMPTY_WIKT)), \
         patch("services.deepseek._chat", new=AsyncMock(return_value=AI_JSON)), \
         patch("services.gemini._generate", gemini):
        resp = await client.get("/api/vocabulary/definition/Himmelslichts?lang=de")
    assert resp.status_code == 200
    assert resp.json()["lemma"] == "Himmelslicht"
    gemini.assert_not_called()


async def test_definition_fallback_uses_claude_key_when_only_one(client, test_user):
    await set_user_claude_key(test_user["id"], encrypt_api_key("sk-ant-key"))
    with patch("services.wiktionary.lookup", new=AsyncMock(return_value=EMPTY_WIKT)), \
         patch("services.claude.dictionary_lookup_with_key",
               new=AsyncMock(return_value=AI_JSON)) as mock:
        resp = await client.get("/api/vocabulary/definition/Himmelslichts?lang=de")
    assert resp.status_code == 200
    assert resp.json()["lemma"] == "Himmelslicht"
    assert mock.await_args.args[0] == "sk-ant-key"


async def test_definition_gemini_key_still_works(client, test_user):
    await set_user_gemini_key(test_user["id"], encrypt_api_key("AIza-key"))
    with patch("services.wiktionary.lookup", new=AsyncMock(return_value=EMPTY_WIKT)), \
         patch("services.gemini._generate", new=AsyncMock(return_value=AI_JSON)):
        resp = await client.get("/api/vocabulary/definition/Himmelslichts?lang=de")
    assert resp.status_code == 200
    assert resp.json()["lemma"] == "Himmelslicht"


async def test_definition_corrupted_deepseek_key_falls_through_to_next(client, test_user):
    """A key that fails to decrypt is skipped, not fatal — the next provider runs."""
    import aiosqlite
    import services.db as db_module
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "UPDATE users SET deepseek_key=? WHERE id=?",
            ("not-a-valid-fernet-token", test_user["id"]),
        )
        await db.commit()
    await set_user_claude_key(test_user["id"], encrypt_api_key("sk-ant-key"))
    with patch("services.wiktionary.lookup", new=AsyncMock(return_value=EMPTY_WIKT)), \
         patch("services.claude.dictionary_lookup_with_key",
               new=AsyncMock(return_value=AI_JSON)):
        resp = await client.get("/api/vocabulary/definition/Himmelslichts?lang=de")
    assert resp.status_code == 200
    assert resp.json()["lemma"] == "Himmelslicht"


# ── ai_lookup provider dispatch ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ai_lookup_dispatches_to_deepseek():
    with patch("services.deepseek._chat", new=AsyncMock(return_value=AI_JSON)) as mock:
        result = await wiktionary.ai_lookup("Himmelslichts", "de", "sk-ds", provider="deepseek")
    assert result["lemma"] == "Himmelslicht"
    assert mock.await_args.args[1] == wiktionary._AI_SYSTEM


@pytest.mark.asyncio
async def test_ai_lookup_dispatches_to_claude():
    with patch("services.claude.dictionary_lookup_with_key",
               new=AsyncMock(return_value=AI_JSON)) as mock:
        result = await wiktionary.ai_lookup("Himmelslichts", "de", "sk-ant", provider="claude")
    assert result["lemma"] == "Himmelslicht"
    assert mock.await_args.args[1] == wiktionary._AI_SYSTEM


@pytest.mark.asyncio
async def test_ai_lookup_default_provider_stays_gemini():
    with patch("services.gemini._generate", new=AsyncMock(return_value=AI_JSON)) as mock:
        result = await wiktionary.ai_lookup("Himmelslichts", "de", "AIza")
    assert result["lemma"] == "Himmelslicht"
    mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_ai_lookup_provider_error_returns_empty():
    with patch("services.deepseek._chat", new=AsyncMock(side_effect=Exception("api down"))):
        result = await wiktionary.ai_lookup("word", "de", "sk-ds", provider="deepseek")
    assert result["definitions"] == []
    assert result["lemma"] == "word"


# ── the prompt understands compounds ─────────────────────────────────────────

def test_ai_system_prompt_covers_compound_words():
    """Author-invented compounds (Himmelslichts) must be decomposed, not
    shrugged at — the prompt instructs a parts-first definition."""
    prompt = wiktionary._AI_SYSTEM.lower()
    assert "compound" in prompt
    assert "invented" in prompt or "rare" in prompt
