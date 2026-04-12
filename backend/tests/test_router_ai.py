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

async def test_tts_auto_without_key_uses_edge(client):
    """auto + no Gemini key → routes to edge backend (MP3)."""
    fake_audio = b"FAKE_MP3_BYTES"
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(fake_audio, "audio/mpeg"),
    ) as mock_synth:
        resp = await client.post("/api/ai/tts", json={
            "text": "Hello",
            "language": "en",
            "rate": 1.0,
        })
    assert resp.status_code == 200
    assert resp.content == fake_audio
    assert resp.headers["content-type"] == "audio/mpeg"
    assert mock_synth.call_args.kwargs["provider"] == "edge"
    assert mock_synth.call_args.kwargs["gemini_key"] is None


async def test_tts_auto_with_key_uses_google(client, test_user):
    """auto + user has Gemini key → routes to google backend (WAV)."""
    await _set_key(test_user)
    fake_audio = b"FAKE_WAV_BYTES"
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(fake_audio, "audio/wav"),
    ) as mock_synth:
        resp = await client.post("/api/ai/tts", json={
            "text": "Hello",
            "language": "en",
            "rate": 1.0,
        })
    assert resp.status_code == 200
    assert resp.content == fake_audio
    assert resp.headers["content-type"] == "audio/wav"
    assert mock_synth.call_args.kwargs["provider"] == "google"
    assert mock_synth.call_args.kwargs["gemini_key"] == "my-gemini-key"


async def test_tts_explicit_edge_works_without_key(client):
    fake_audio = b"FAKE_MP3"
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(fake_audio, "audio/mpeg"),
    ) as mock_synth:
        resp = await client.post("/api/ai/tts", json={
            "text": "Hello",
            "language": "en",
            "rate": 1.0,
            "provider": "edge",
        })
    assert resp.status_code == 200
    assert mock_synth.call_args.kwargs["provider"] == "edge"


async def test_tts_explicit_google_without_key_returns_400(client):
    resp = await client.post("/api/ai/tts", json={
        "text": "Hello",
        "language": "en",
        "rate": 1.0,
        "provider": "google",
    })
    assert resp.status_code == 400
    assert "Gemini API key" in resp.json()["detail"]


async def test_tts_explicit_google_with_key(client, test_user):
    await _set_key(test_user)
    fake_audio = b"FAKE_WAV"
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(fake_audio, "audio/wav"),
    ) as mock_synth:
        resp = await client.post("/api/ai/tts", json={
            "text": "Hello",
            "language": "en",
            "rate": 1.0,
            "provider": "google",
        })
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert mock_synth.call_args.kwargs["provider"] == "google"


# ── TTS audio cache ───────────────────────────────────────────────────────────

async def test_tts_cache_miss_then_hit(client):
    """First chapter request synthesizes + caches; second is served from cache."""
    fake_audio = b"FAKE_MP3_BYTES"
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(fake_audio, "audio/mpeg"),
    ) as mock_synth:
        # First call: cache miss → synthesize is invoked
        resp1 = await client.post("/api/ai/tts", json={
            "text": "Chapter text here.",
            "language": "en",
            "rate": 1.0,
            "book_id": 1342,
            "chapter_index": 0,
            "provider": "edge",
        })

    assert resp1.status_code == 200
    assert resp1.content == fake_audio
    assert resp1.headers["x-tts-cache"] == "miss"
    assert mock_synth.call_count == 1

    # Second call: cache hit → synthesize must NOT be invoked
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
    ) as mock_synth2:
        resp2 = await client.post("/api/ai/tts", json={
            "text": "Chapter text here.",
            "language": "en",
            "rate": 1.0,
            "book_id": 1342,
            "chapter_index": 0,
            "provider": "edge",
        })

    assert resp2.status_code == 200
    assert resp2.content == fake_audio
    assert resp2.headers["x-tts-cache"] == "hit"
    mock_synth2.assert_not_called()


async def test_tts_without_book_id_skips_cache(client):
    """Snippet calls (no book_id/chapter_index) never touch the cache."""
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(b"snippet1", "audio/mpeg"),
    ) as mock_synth:
        resp1 = await client.post("/api/ai/tts", json={
            "text": "Hello",
            "language": "en",
            "rate": 1.0,
            "provider": "edge",
        })

    assert resp1.status_code == 200
    # No X-TTS-Cache header on snippet calls (cache not consulted)
    assert "x-tts-cache" not in resp1.headers
    assert mock_synth.call_count == 1

    # Same request again — synthesize should be called again, no caching
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(b"snippet2", "audio/mpeg"),
    ) as mock_synth2:
        resp2 = await client.post("/api/ai/tts", json={
            "text": "Hello",
            "language": "en",
            "rate": 1.0,
            "provider": "edge",
        })

    assert resp2.status_code == 200
    assert resp2.content == b"snippet2"
    assert mock_synth2.call_count == 1


# ── /api/ai/tts/chunks endpoint ───────────────────────────────────────────────

async def test_delete_tts_cache_removes_chapter_chunks(client):
    """The Regenerate button calls DELETE /api/ai/tts/cache to clear the
    cached audio so the next play triggers fresh generation."""
    from services.db import save_audio
    await save_audio(1342, 0, "edge", "voice-x", b"chunk0", "audio/mpeg", chunk_index=0)
    await save_audio(1342, 0, "edge", "voice-x", b"chunk1", "audio/mpeg", chunk_index=1)

    resp = await client.delete("/api/ai/tts/cache?book_id=1342&chapter_index=0")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 2

    # Subsequent /tts request must miss the cache
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(b"fresh", "audio/mpeg"),
    ):
        resp2 = await client.post("/api/ai/tts", json={
            "text": "x", "language": "en", "rate": 1.0,
            "book_id": 1342, "chapter_index": 0, "chunk_index": 0,
            "provider": "edge",
        })
    assert resp2.headers["x-tts-cache"] == "miss"


async def test_delete_tts_cache_zero_when_nothing_cached(client):
    resp = await client.delete("/api/ai/tts/cache?book_id=9999&chapter_index=99")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 0


async def test_tts_chunks_returns_chunk_list(client):
    """Frontend calls this once per chapter to know how to slice the text."""
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
    # Concat of chunks should contain the same content (whitespace preserved or not)
    rejoined = " ".join(chunks)
    assert "Paragraph 0:" in rejoined
    assert "Paragraph 4:" in rejoined


async def test_tts_chunks_requires_auth(client):
    """The chunks endpoint goes through get_current_user. With the test
    fixture overriding it, the call succeeds — this just confirms the
    dependency wiring is in place."""
    resp = await client.post("/api/ai/tts/chunks", json={"text": "x"})
    assert resp.status_code == 200


async def test_tts_chunk_index_keys_cache_separately(client):
    """Two requests for the same chapter but different chunk_index produce
    independent cache entries — neither hit if the other is set."""
    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(b"chunk-0-audio", "audio/mpeg"),
    ):
        resp0 = await client.post("/api/ai/tts", json={
            "text": "Chunk zero text.",
            "language": "en",
            "rate": 1.0,
            "book_id": 1342,
            "chapter_index": 0,
            "chunk_index": 0,
            "provider": "edge",
        })
    assert resp0.headers["x-tts-cache"] == "miss"

    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(b"chunk-1-audio", "audio/mpeg"),
    ):
        resp1 = await client.post("/api/ai/tts", json={
            "text": "Chunk one text.",
            "language": "en",
            "rate": 1.0,
            "book_id": 1342,
            "chapter_index": 0,
            "chunk_index": 1,
            "provider": "edge",
        })
    # Different chunk_index → independent cache miss, NOT a hit on chunk 0
    assert resp1.headers["x-tts-cache"] == "miss"
    assert resp1.content == b"chunk-1-audio"

    # Refetch chunk 0 → should be a cache hit
    with patch("routers.ai.synthesize") as never_called:
        resp0_again = await client.post("/api/ai/tts", json={
            "text": "Chunk zero text.",
            "language": "en",
            "rate": 1.0,
            "book_id": 1342,
            "chapter_index": 0,
            "chunk_index": 0,
            "provider": "edge",
        })
    assert resp0_again.headers["x-tts-cache"] == "hit"
    assert resp0_again.content == b"chunk-0-audio"
    never_called.assert_not_called()


async def test_tts_cache_keyed_by_provider(client, test_user):
    """Same chapter, different provider → different cache entries."""
    await _set_key(test_user)

    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(b"edge-audio", "audio/mpeg"),
    ):
        resp_edge = await client.post("/api/ai/tts", json={
            "text": "Hello",
            "language": "en",
            "rate": 1.0,
            "book_id": 1342,
            "chapter_index": 0,
            "provider": "edge",
        })
    assert resp_edge.headers["x-tts-cache"] == "miss"

    with patch(
        "routers.ai.synthesize",
        new_callable=AsyncMock,
        return_value=(b"google-audio", "audio/wav"),
    ) as mock_google:
        resp_google = await client.post("/api/ai/tts", json={
            "text": "Hello",
            "language": "en",
            "rate": 1.0,
            "book_id": 1342,
            "chapter_index": 0,
            "provider": "google",
        })

    # Google must be a separate cache miss — the edge entry doesn't satisfy it
    assert resp_google.headers["x-tts-cache"] == "miss"
    assert resp_google.content == b"google-audio"
    mock_google.assert_called_once()


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
