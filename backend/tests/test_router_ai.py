"""
Tests for routers/ai.py

All Gemini / TTS calls are mocked.
Focuses on:
  - Translation cache hit (no AI call made, works without a Gemini key)
  - Translation cache miss: 400 without a key, Gemini + cache write with a key
  - Insight / QA / Pronunciation / Videos: require a Gemini key (400 without)
  - TTS: unchanged (uses edge-tts, no key required)
  - Error paths: upstream Gemini failure → 500
"""

import pytest
from unittest.mock import AsyncMock, patch
from services.db import save_translation, get_cached_translation, set_user_gemini_key
from services.auth import encrypt_api_key


CHAPTER_TEXT = "Es war einmal ein König."
TRANSLATED = ["Once upon a time there was a king."]


async def _set_key(test_user):
    await set_user_gemini_key(test_user["id"], encrypt_api_key("my-gemini-key"))


# ── Translation ───────────────────────────────────────────────────────────────

async def test_translate_cache_hit_works_without_key(client):
    """Cache hits return the stored result without hitting Gemini at all."""
    await save_translation(1342, 0, "en", TRANSLATED)

    with patch("routers.ai.gemini") as mock_gemini:
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
    mock_gemini.translate_text.assert_not_called()


async def test_translate_cache_miss_without_key_returns_400(client):
    resp = await client.post("/api/ai/translate", json={
        "text": CHAPTER_TEXT,
        "source_language": "de",
        "target_language": "en",
        "book_id": 1342,
        "chapter_index": 0,
    })
    assert resp.status_code == 400
    assert "Gemini" in resp.json()["detail"]


async def test_translate_cache_miss_with_key_uses_gemini_and_stores(client, test_user):
    await _set_key(test_user)

    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.translate_text = AsyncMock(return_value=TRANSLATED)
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
    mock_gemini.translate_text.assert_called_once()

    # Result should now be in the DB
    cached = await get_cached_translation(1342, 0, "en")
    assert cached == TRANSLATED


async def test_translate_without_book_id_skips_cache(client, test_user):
    await _set_key(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.translate_text = AsyncMock(return_value=TRANSLATED)
        resp = await client.post("/api/ai/translate", json={
            "text": CHAPTER_TEXT,
            "source_language": "de",
            "target_language": "en",
        })
    assert resp.status_code == 200
    assert resp.json()["cached"] is False


# ── Insight ───────────────────────────────────────────────────────────────────

async def test_insight_without_key_returns_400(client):
    resp = await client.post("/api/ai/insight", json={
        "chapter_text": "Some text",
        "book_title": "Faust",
        "author": "Goethe",
    })
    assert resp.status_code == 400
    assert "Gemini" in resp.json()["detail"]


async def test_insight_with_key_returns_text(client, test_user):
    await _set_key(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.generate_insight = AsyncMock(return_value="Gemini insight.")
        resp = await client.post("/api/ai/insight", json={
            "chapter_text": "Some text",
            "book_title": "Faust",
            "author": "Goethe",
        })
    assert resp.status_code == 200
    assert resp.json()["insight"] == "Gemini insight."
    mock_gemini.generate_insight.assert_called_once()


# ── QA ────────────────────────────────────────────────────────────────────────

async def test_qa_without_key_returns_400(client):
    resp = await client.post("/api/ai/qa", json={
        "question": "?", "passage": "text", "book_title": "Book", "author": "Author",
    })
    assert resp.status_code == 400


async def test_qa_with_key_returns_answer(client, test_user):
    await _set_key(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.answer_question = AsyncMock(return_value="42")
        resp = await client.post("/api/ai/qa", json={
            "question": "What is the meaning?",
            "passage": "Some passage",
            "book_title": "Hitchhiker",
            "author": "Adams",
        })
    assert resp.status_code == 200
    assert resp.json()["answer"] == "42"


# ── Pronunciation ─────────────────────────────────────────────────────────────

async def test_pronunciation_without_key_returns_400(client):
    resp = await client.post("/api/ai/pronunciation", json={
        "original_text": "Hello world",
        "spoken_text": "Helo world",
    })
    assert resp.status_code == 400


async def test_pronunciation_with_key_returns_feedback(client, test_user):
    await _set_key(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.check_pronunciation = AsyncMock(return_value="Good job!")
        resp = await client.post("/api/ai/pronunciation", json={
            "original_text": "Hello world",
            "spoken_text": "Helo world",
            "language": "en",
        })
    assert resp.status_code == 200
    assert resp.json()["feedback"] == "Good job!"


# ── TTS ───────────────────────────────────────────────────────────────────────

async def test_tts_returns_audio_bytes(client):
    """TTS uses edge-tts and does not require a Gemini key."""
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


# ── Videos ────────────────────────────────────────────────────────────────────

async def test_videos_without_key_returns_400(client):
    resp = await client.post("/api/ai/videos", json={
        "passage": "Faust sells his soul.",
        "book_title": "Faust",
        "author": "Goethe",
    })
    assert resp.status_code == 400


async def test_videos_with_key_returns_results(client, test_user):
    await _set_key(test_user)
    fake_videos = [{"id": "abc", "title": "Faust Film", "url": "https://youtube.com/watch?v=abc"}]
    with patch("routers.ai.gemini") as mock_gemini, \
         patch("routers.ai.search_videos", new_callable=AsyncMock, return_value=fake_videos):
        mock_gemini.suggest_youtube_query = AsyncMock(return_value="Faust opera film")
        resp = await client.post("/api/ai/videos", json={
            "passage": "Faust sells his soul.",
            "book_title": "Faust",
            "author": "Goethe",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["query"] == "Faust opera film"
    assert len(data["videos"]) == 1


# ── Error paths (upstream Gemini failure → 500) ───────────────────────────────

async def test_insight_gemini_error_returns_500(client, test_user):
    await _set_key(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.generate_insight = AsyncMock(side_effect=RuntimeError("AI down"))
        resp = await client.post("/api/ai/insight", json={
            "chapter_text": "text", "book_title": "Book", "author": "Author",
        })
    assert resp.status_code == 500
    assert "AI down" in resp.json()["detail"]


async def test_qa_gemini_error_returns_500(client, test_user):
    await _set_key(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.answer_question = AsyncMock(side_effect=RuntimeError("fail"))
        resp = await client.post("/api/ai/qa", json={
            "question": "?", "passage": "text", "book_title": "Book", "author": "Author",
        })
    assert resp.status_code == 500


async def test_pronunciation_gemini_error_returns_500(client, test_user):
    await _set_key(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.check_pronunciation = AsyncMock(side_effect=RuntimeError("fail"))
        resp = await client.post("/api/ai/pronunciation", json={
            "original_text": "Hello", "spoken_text": "Helo",
        })
    assert resp.status_code == 500


async def test_translate_gemini_error_returns_500(client, test_user):
    await _set_key(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.translate_text = AsyncMock(side_effect=RuntimeError("fail"))
        resp = await client.post("/api/ai/translate", json={
            "text": "text", "source_language": "de", "target_language": "en",
        })
    assert resp.status_code == 500


async def test_tts_error_returns_500(client):
    with patch("routers.ai.synthesize", new_callable=AsyncMock, side_effect=RuntimeError("TTS fail")):
        resp = await client.post("/api/ai/tts", json={"text": "Hello", "language": "en", "rate": 1.0})
    assert resp.status_code == 500


async def test_videos_gemini_error_returns_500(client, test_user):
    await _set_key(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.suggest_youtube_query = AsyncMock(side_effect=RuntimeError("fail"))
        resp = await client.post("/api/ai/videos", json={
            "passage": "text", "book_title": "Book", "author": "Author",
        })
    assert resp.status_code == 500
