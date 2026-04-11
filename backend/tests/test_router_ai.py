"""
Tests for routers/ai.py

All Claude / Gemini / TTS calls are mocked.
Focuses on:
  - Translation cache hit (no AI call made)
  - Translation cache miss (AI called, result stored)
  - Gemini key path vs Claude fallback path
  - Insight, QA, TTS, pronunciation endpoints
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.db import save_translation, get_cached_translation


CHAPTER_TEXT = "Es war einmal ein König."
TRANSLATED = ["Once upon a time there was a king."]


# ── Translation ───────────────────────────────────────────────────────────────

async def test_translate_cache_hit_skips_ai(client):
    await save_translation(1342, 0, "en", TRANSLATED)

    with patch("routers.ai.claude_translate") as mock_claude, \
         patch("routers.ai.gemini") as mock_gemini:
        resp = await client.post("/api/ai/translate", json={
            "text": CHAPTER_TEXT,
            "source_language": "de",
            "target_language": "en",
            "book_id": 1342,
            "chapter_index": 0,
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["cached"] is True
    assert data["paragraphs"] == TRANSLATED
    mock_claude.assert_not_called()
    mock_gemini.translate_text.assert_not_called()


async def test_translate_cache_miss_calls_claude_and_stores(client):
    with patch("routers.ai.claude_translate", new_callable=AsyncMock, return_value=TRANSLATED):
        resp = await client.post("/api/ai/translate", json={
            "text": CHAPTER_TEXT,
            "source_language": "de",
            "target_language": "en",
            "book_id": 1342,
            "chapter_index": 0,
        })

    assert resp.status_code == 200
    assert resp.json()["cached"] is False
    assert resp.json()["paragraphs"] == TRANSLATED

    # Result should now be in the DB
    cached = await get_cached_translation(1342, 0, "en")
    assert cached == TRANSLATED


async def test_translate_uses_gemini_when_user_has_key(client, test_user):
    from services.db import set_user_gemini_key
    from services.auth import encrypt_api_key
    await set_user_gemini_key(test_user["id"], encrypt_api_key("my-gemini-key"))

    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.translate_text = AsyncMock(return_value=TRANSLATED)
        resp = await client.post("/api/ai/translate", json={
            "text": CHAPTER_TEXT,
            "source_language": "de",
            "target_language": "en",
        })

    assert resp.status_code == 200
    mock_gemini.translate_text.assert_called_once()


async def test_translate_without_book_id_skips_cache(client):
    with patch("routers.ai.claude_translate", new_callable=AsyncMock, return_value=TRANSLATED):
        resp = await client.post("/api/ai/translate", json={
            "text": CHAPTER_TEXT,
            "source_language": "de",
            "target_language": "en",
        })
    assert resp.status_code == 200
    assert resp.json()["cached"] is False


# ── Insight ───────────────────────────────────────────────────────────────────

async def test_insight_returns_text(client):
    with patch("routers.ai.claude_insight", new_callable=AsyncMock, return_value="A deep insight."):
        resp = await client.post("/api/ai/insight", json={
            "chapter_text": "Some text",
            "book_title": "Faust",
            "author": "Goethe",
        })
    assert resp.status_code == 200
    assert resp.json()["insight"] == "A deep insight."


async def test_insight_uses_gemini_when_user_has_key(client, test_user):
    from services.db import set_user_gemini_key
    from services.auth import encrypt_api_key
    await set_user_gemini_key(test_user["id"], encrypt_api_key("my-gemini-key"))

    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.generate_insight = AsyncMock(return_value="Gemini insight.")
        resp = await client.post("/api/ai/insight", json={
            "chapter_text": "Some text",
            "book_title": "Faust",
            "author": "Goethe",
        })

    assert resp.status_code == 200
    mock_gemini.generate_insight.assert_called_once()


# ── QA ────────────────────────────────────────────────────────────────────────

async def test_qa_returns_answer(client):
    with patch("routers.ai.claude_qa", new_callable=AsyncMock, return_value="42"):
        resp = await client.post("/api/ai/qa", json={
            "question": "What is the meaning?",
            "passage": "Some passage",
            "book_title": "Hitchhiker",
            "author": "Adams",
        })
    assert resp.status_code == 200
    assert resp.json()["answer"] == "42"


# ── Pronunciation ─────────────────────────────────────────────────────────────

async def test_pronunciation_returns_feedback(client):
    with patch("routers.ai.claude_pronunciation", new_callable=AsyncMock, return_value="Good job!"):
        resp = await client.post("/api/ai/pronunciation", json={
            "original_text": "Hello world",
            "spoken_text": "Helo world",
            "language": "en",
        })
    assert resp.status_code == 200
    assert resp.json()["feedback"] == "Good job!"


# ── TTS ───────────────────────────────────────────────────────────────────────

async def test_tts_returns_audio_bytes(client):
    fake_audio = b"FAKE_MP3_BYTES"
    with patch("routers.ai.synthesize", new_callable=AsyncMock, return_value=fake_audio):
        resp = await client.post("/api/ai/tts", json={
            "text": "Hello",
            "language": "en",
            "rate": 1.0,
        })
    assert resp.status_code == 200
    assert resp.content == fake_audio
    assert resp.headers["content-type"] == "audio/mpeg"
