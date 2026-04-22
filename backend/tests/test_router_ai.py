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


async def test_translate_cache_miss_without_key_uses_google_free(client):
    """Without a Gemini key, translation falls back to Google Translate (free)."""
    with patch("services.translate._google_translate", new_callable=AsyncMock, return_value=TRANSLATED):
        resp = await client.post("/api/ai/translate", json={
            "text": CHAPTER_TEXT,
            "source_language": "de",
            "target_language": "en",
            "book_id": 1342,
            "chapter_index": 0,
        })
    assert resp.status_code == 200
    assert resp.json()["provider"] == "google"
    assert resp.json()["paragraphs"] == TRANSLATED


async def test_translate_cache_miss_with_key_uses_gemini(client, test_user):
    await _set_key(test_user)

    with patch("services.translate._gemini_translate", new_callable=AsyncMock, return_value=TRANSLATED):
        resp = await client.post("/api/ai/translate", json={
            "text": CHAPTER_TEXT,
            "source_language": "de",
            "target_language": "en",
            "book_id": 1342,
            "chapter_index": 0,
        })

    assert resp.status_code == 200
    assert resp.json()["cached"] is False
    assert resp.json()["provider"] == "gemini"
    assert resp.json()["paragraphs"] == TRANSLATED

    cached = await get_cached_translation(1342, 0, "en")
    assert cached == TRANSLATED


async def test_translate_without_book_id_skips_cache(client, test_user):
    await _set_key(test_user)
    with patch("services.translate._gemini_translate", new_callable=AsyncMock, return_value=TRANSLATED):
        resp = await client.post("/api/ai/translate", json={
            "text": CHAPTER_TEXT,
            "source_language": "de",
            "target_language": "en",
        })
    assert resp.status_code == 200
    assert resp.json()["cached"] is False


async def test_translate_same_language_returns_400(client, test_user):
    """Translating into the same language is rejected."""
    await _set_key(test_user)
    resp = await client.post("/api/ai/translate", json={
        "text": CHAPTER_TEXT,
        "source_language": "de",
        "target_language": "de",
    })
    assert resp.status_code == 400
    assert "same" in resp.json()["detail"].lower()


async def test_translate_same_language_base_code_returns_400(client, test_user):
    """de-DE and de are treated as the same language."""
    await _set_key(test_user)
    resp = await client.post("/api/ai/translate", json={
        "text": CHAPTER_TEXT,
        "source_language": "de-DE",
        "target_language": "de",
    })
    assert resp.status_code == 400


# ── Translation cache endpoints ───────────────────────────────────────────────

async def test_translate_cache_get_returns_cached(client):
    """GET /translate/cache returns cached translation."""
    await save_translation(1, 0, "en", TRANSLATED)
    resp = await client.get("/api/ai/translate/cache?book_id=1&chapter_index=0&target_language=en")
    assert resp.status_code == 200
    assert resp.json()["paragraphs"] == TRANSLATED
    assert resp.json()["cached"] is True


async def test_translate_cache_get_returns_404_when_missing(client):
    resp = await client.get("/api/ai/translate/cache?book_id=999&chapter_index=0&target_language=en")
    assert resp.status_code == 404


async def test_translate_cache_put_saves(client):
    """PUT /translate/cache saves paragraphs for later retrieval."""
    resp = await client.put("/api/ai/translate/cache", json={
        "book_id": 2, "chapter_index": 1, "target_language": "fr",
        "paragraphs": ["Bonjour"],
    })
    assert resp.status_code == 200
    cached = await get_cached_translation(2, 1, "fr")
    assert cached == ["Bonjour"]


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


# ── TTS (Edge, free, no auth) ─────────────────────────────────────────────────

async def test_tts_returns_audio(client):
    """Basic TTS request returns MP3 audio."""
    fake_audio = b"FAKE_MP3_BYTES"
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(fake_audio, "audio/mpeg", []),
    ):
        resp = await client.post("/api/ai/tts", json={
            "text": "Hello world",
            "language": "en",
            "rate": 1.0,
        })
    assert resp.status_code == 200
    assert resp.content == fake_audio
    assert resp.headers["content-type"] == "audio/mpeg"


async def test_tts_no_auth_required(client):
    """TTS uses Edge (free) — no login needed."""
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(b"mp3", "audio/mpeg", []),
    ):
        resp = await client.post("/api/ai/tts", json={"text": "x", "language": "en", "rate": 1.0})
    assert resp.status_code == 200


async def test_tts_defaults_to_female_gender(client):
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(b"mp3", "audio/mpeg", []),
    ) as mock_synth:
        await client.post("/api/ai/tts", json={"text": "x", "language": "en", "rate": 1.0})
    assert mock_synth.call_args.kwargs["gender"] == "female"


async def test_tts_accepts_male_gender(client):
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(b"mp3", "audio/mpeg", []),
    ) as mock_synth:
        await client.post("/api/ai/tts", json={"text": "x", "language": "en", "rate": 1.0, "gender": "male"})
    assert mock_synth.call_args.kwargs["gender"] == "male"


# ── /api/ai/tts/chunks endpoint ───────────────────────────────────────────────

async def test_tts_chunks_returns_chunk_list(client):
    resp = await client.post("/api/ai/tts/chunks", json={"text": "Just one short paragraph."})
    assert resp.status_code == 200
    data = resp.json()
    assert "chunks" in data
    assert data["chunks"] == ["Just one short paragraph."]


async def test_tts_chunks_splits_long_text(client):
    long_text = "\n\n".join([f"Paragraph {i}: " + ("x" * 200) for i in range(5)])
    resp = await client.post("/api/ai/tts/chunks", json={"text": long_text})
    assert resp.status_code == 200
    chunks = resp.json()["chunks"]
    assert len(chunks) > 1
    rejoined = " ".join(chunks)
    assert "Paragraph 0:" in rejoined
    assert "Paragraph 4:" in rejoined


async def test_tts_chunks_no_auth_required(client):
    resp = await client.post("/api/ai/tts/chunks", json={"text": "x"})
    assert resp.status_code == 200


# ── Videos ────────────────────────────────────────────────────────────────────

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


async def test_translate_gemini_error_falls_back_to_google(client, test_user):
    """When Gemini fails, translation falls back to Google Translate (free)."""
    await _set_key(test_user)
    with patch("services.translate._gemini_translate", new_callable=AsyncMock, side_effect=RuntimeError("quota exhausted")), \
         patch("services.translate._google_translate", new_callable=AsyncMock, return_value=TRANSLATED):
        resp = await client.post("/api/ai/translate", json={
            "text": "text", "source_language": "de", "target_language": "en",
        })
    assert resp.status_code == 200
    assert resp.json()["provider"] == "google"
    assert resp.json()["fallback"] is True


async def test_tts_error_returns_500(client):
    with patch("routers.ai.synthesize", new_callable=AsyncMock, side_effect=RuntimeError("TTS fail")):
        resp = await client.post("/api/ai/tts", json={"text": "Hello", "language": "en", "rate": 1.0})
    assert resp.status_code == 500


# ── References ────────────────────────────────────────────────────────────────

async def test_references_without_key_returns_400(client):
    resp = await client.post("/api/ai/references", json={
        "book_title": "Faust", "author": "Goethe",
    })
    assert resp.status_code == 400
    assert "Gemini" in resp.json()["detail"]


async def test_references_with_key_returns_references(client, test_user):
    await _set_key(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.answer_question = AsyncMock(return_value="- *Faust* commentary by X")
        resp = await client.post("/api/ai/references", json={
            "book_title": "Faust",
            "author": "Goethe",
            "chapter_title": "Part I",
            "chapter_excerpt": "Habe nun, ach!",
        })
    assert resp.status_code == 200
    assert "references" in resp.json()
    assert "Faust" in resp.json()["references"]


async def test_references_error_returns_500(client, test_user):
    await _set_key(test_user)
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.answer_question = AsyncMock(side_effect=RuntimeError("AI down"))
        resp = await client.post("/api/ai/references", json={
            "book_title": "Faust", "author": "Goethe",
        })
    assert resp.status_code == 500


# ── Corrupted Gemini key ──────────────────────────────────────────────────────

_CORRUPT_KEY = "not-a-valid-fernet-token"


async def test_translate_with_corrupted_key_falls_back_to_google(client, test_user):
    """A corrupted (un-decryptable) Gemini key must not crash with 500 — auto
    provider should silently fall back to Google Translate."""
    await set_user_gemini_key(test_user["id"], _CORRUPT_KEY)
    with patch("services.translate._google_translate", new_callable=AsyncMock, return_value=TRANSLATED):
        resp = await client.post("/api/ai/translate", json={
            "text": CHAPTER_TEXT,
            "source_language": "de",
            "target_language": "en",
        })
    assert resp.status_code == 200
    assert resp.json()["provider"] == "google"


async def test_translate_with_corrupted_key_explicit_gemini_returns_400(client, test_user):
    """Explicitly requesting Gemini with a corrupted key returns 400, not 500."""
    await set_user_gemini_key(test_user["id"], _CORRUPT_KEY)
    resp = await client.post("/api/ai/translate", json={
        "text": CHAPTER_TEXT,
        "source_language": "de",
        "target_language": "en",
        "provider": "gemini",
    })
    assert resp.status_code == 400


async def test_insight_with_corrupted_key_returns_400(client, test_user):
    """Corrupted Gemini key on insight endpoint returns 400 not 500."""
    await set_user_gemini_key(test_user["id"], _CORRUPT_KEY)
    resp = await client.post("/api/ai/insight", json={
        "chapter_text": "Some text",
        "book_title": "Faust",
        "author": "Goethe",
    })
    assert resp.status_code == 400

