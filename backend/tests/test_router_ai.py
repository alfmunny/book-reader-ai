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

import asyncio
import json
import pytest
import aiosqlite
from unittest.mock import AsyncMock, patch
import services.db as db_module
from services.db import save_book, save_translation, get_cached_translation, set_user_gemini_key, set_setting, get_or_create_user
from services.auth import encrypt_api_key


CHAPTER_TEXT = "Es war einmal ein König."
TRANSLATED = ["Once upon a time there was a king."]
_BOOK_META = {"title": "Faust", "authors": ["Goethe"], "languages": ["de"],
              "subjects": [], "download_count": 0, "cover": ""}


async def _set_key(test_user):
    await set_user_gemini_key(test_user["id"], encrypt_api_key("my-gemini-key"))


# ── Translation ───────────────────────────────────────────────────────────────

async def test_translate_normalizes_language_codes(client):
    """target_language must be normalized before cache lookup and save.

    Translation stored under 'zh' must be a cache hit when the client
    sends 'ZH' or 'zh-CN'.  Without normalization, 'tgt' is computed but
    discarded — the raw req.target_language hits the DB and misses."""
    await save_book(1342, _BOOK_META, "text")
    await save_translation(1342, 0, "zh", TRANSLATED)

    with patch("routers.ai.gemini") as mock_gemini:
        resp = await client.post("/api/ai/translate", json={
            "text": CHAPTER_TEXT,
            "source_language": "de",
            "target_language": "ZH",  # uppercase — must normalize to "zh"
            "book_id": 1342,
            "chapter_index": 0,
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["cached"] is True, "uppercase 'ZH' must hit cache stored as 'zh'"
    mock_gemini.translate_text.assert_not_called()


async def test_translate_cache_hit_works_without_key(client):
    """Cache hits return the stored result without hitting Gemini at all."""
    await save_book(1342, _BOOK_META, "text")
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
    await save_book(1342, _BOOK_META, "text")
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
    await save_book(1342, _BOOK_META, "text")

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
    _m = {"title": "T", "authors": [], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
    await save_book(1, _m, "text")
    await save_translation(1, 0, "en", TRANSLATED)
    resp = await client.get("/api/ai/translate/cache?book_id=1&chapter_index=0&target_language=en")
    assert resp.status_code == 200
    assert resp.json()["paragraphs"] == TRANSLATED
    assert resp.json()["cached"] is True


async def test_translate_cache_get_returns_404_when_missing(client):
    resp = await client.get("/api/ai/translate/cache?book_id=999&chapter_index=0&target_language=en")
    assert resp.status_code == 404


async def test_translate_cache_get_normalizes_language(client):
    """GET /translate/cache?target_language=ZH must hit a 'zh' row.

    Without normalization the lookup uses 'ZH' as-is and misses 'zh'."""
    _m = {"title": "T", "authors": [], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
    await save_book(5, _m, "text")
    await save_translation(5, 0, "zh", ["翻译"])
    resp = await client.get("/api/ai/translate/cache?book_id=5&chapter_index=0&target_language=ZH")
    assert resp.status_code == 200
    assert resp.json()["paragraphs"] == ["翻译"]


async def test_translate_cache_put_normalizes_language(client, test_user):
    """PUT /translate/cache with 'ZH-CN' must save under 'zh'.

    Without normalization, a later GET with 'zh' would miss the entry."""
    from services.db import save_book as _save_book, get_cached_translation
    _META = {"title": "T", "authors": [], "languages": ["de"], "subjects": [],
              "download_count": 0, "cover": ""}
    await _save_book(7, _META, "text")
    resp = await client.put("/api/ai/translate/cache", json={
        "book_id": 7, "chapter_index": 0, "target_language": "ZH-CN",
        "paragraphs": ["翻译"],
    })
    assert resp.status_code == 200
    cached = await get_cached_translation(7, 0, "zh")
    assert cached == ["翻译"], "PUT with 'ZH-CN' must be stored under normalized 'zh'"


async def test_translate_cache_put_rejects_nonexistent_book(client, test_user):
    """PUT /translate/cache for a non-existent book must return 404.

    Without this check a user can save an orphaned translation row that
    references a book_id not in the books table (SQLite FK OFF)."""
    resp = await client.put("/api/ai/translate/cache", json={
        "book_id": 77777, "chapter_index": 0, "target_language": "fr",
        "paragraphs": ["Bonjour"],
    })
    assert resp.status_code == 404


async def test_translate_cache_put_rejects_empty_paragraphs(client, test_user):
    """Regression #331: PUT /translate/cache must reject empty paragraphs.

    An empty list overwrites a good cached translation; request_chapter_translation
    then returns status='ready' with no paragraphs, leaving the reader with a
    blank page and no way to trigger re-translation.
    """
    from services.db import save_book, save_translation, get_cached_translation
    _BOOK_META = {"title": "Faust", "authors": ["Goethe"], "languages": ["de"],
                  "subjects": [], "download_count": 0, "cover": ""}
    await save_book(50, _BOOK_META, "text")
    # Seed a valid cached translation to verify it is NOT overwritten
    await save_translation(50, 0, "zh", ["existing paragraph"])

    resp = await client.put("/api/ai/translate/cache", json={
        "book_id": 50, "chapter_index": 0, "target_language": "zh",
        "paragraphs": [],
    })
    assert resp.status_code == 400

    # Existing translation must still be intact
    cached = await get_cached_translation(50, 0, "zh")
    assert cached == ["existing paragraph"]


async def test_translate_cache_put_saves(client, test_user):
    """PUT /translate/cache saves paragraphs for later retrieval."""
    from services.db import save_book
    _BOOK_META = {"title": "Faust", "authors": ["Goethe"], "languages": ["de"],
                  "subjects": [], "download_count": 0, "cover": ""}
    from services.book_chapters import clear_cache as _clear
    await save_book(2, _BOOK_META, "text")
    _clear()
    resp = await client.put("/api/ai/translate/cache", json={
        "book_id": 2, "chapter_index": 0, "target_language": "fr",
        "paragraphs": ["Bonjour"],
    })
    assert resp.status_code == 200
    cached = await get_cached_translation(2, 0, "fr")
    assert cached == ["Bonjour"]


async def test_translate_cache_put_rejects_409_when_running(client, test_user, tmp_db):
    """Regression #341: PUT /translate/cache must return 409 when a queue worker
    is actively translating the same chapter — the worker would overwrite the
    saved translation via save_translation INSERT OR REPLACE when it finishes."""
    import aiosqlite
    from services.db import save_book, save_translation, get_cached_translation
    from services.translation_queue import enqueue
    _BOOK_META_LOCAL = {"title": "Faust", "authors": ["Goethe"], "languages": ["de"],
                        "subjects": [], "download_count": 0, "cover": ""}
    await save_book(60, _BOOK_META_LOCAL, "text")
    await save_translation(60, 0, "zh", ["existing paragraph"])
    await enqueue(60, 0, "zh")
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "UPDATE translation_queue SET status='running' WHERE book_id=60 AND chapter_index=0 AND target_language='zh'"
        )
        await db.commit()

    resp = await client.put("/api/ai/translate/cache", json={
        "book_id": 60, "chapter_index": 0, "target_language": "zh",
        "paragraphs": ["new paragraph"],
    })
    assert resp.status_code == 409

    # Existing translation must be untouched
    cached = await get_cached_translation(60, 0, "zh")
    assert cached == ["existing paragraph"]


async def test_translate_post_rejects_409_when_running(client, test_user, tmp_db):
    """Regression #393: POST /ai/translate must return 409 when a queue worker is
    actively translating the same chapter and we're about to save a new result.

    The guard must fire BEFORE save_translation, not before the cache lookup:
    a cache HIT returns early without saving (no race), but a cache MISS where
    we just finished translating must be blocked so the worker's INSERT OR REPLACE
    doesn't silently overwrite the freshly-saved result."""
    from services.db import save_book, get_cached_translation, set_user_gemini_key
    from services.translation_queue import enqueue
    from services.auth import encrypt_api_key as _enc
    _BM = {"title": "Faust", "authors": ["Goethe"], "languages": ["de"],
            "subjects": [], "download_count": 0, "cover": ""}
    await save_book(61, _BM, "text")
    await set_user_gemini_key(test_user["id"], _enc("my-key"))
    # No pre-seeded cached translation — we need the AI call path to reach the save
    await enqueue(61, 0, "zh")
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "UPDATE translation_queue SET status='running' "
            "WHERE book_id=61 AND chapter_index=0 AND target_language='zh'"
        )
        await db.commit()

    with patch("services.translate._gemini_translate", new_callable=AsyncMock, return_value=["new paragraph"]):
        resp = await client.post("/api/ai/translate", json={
            "text": "Es war einmal.",
            "source_language": "de",
            "target_language": "zh",
            "book_id": 61,
            "chapter_index": 0,
        })
    assert resp.status_code == 409, (
        f"Expected 409 when worker is running and about to save, got {resp.status_code}: {resp.text}"
    )

    # Nothing must have been written to the translation cache
    cached = await get_cached_translation(61, 0, "zh")
    assert cached is None, (
        "No translation must be saved when 409 guard fires for running worker"
    )


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


async def test_translate_rejects_nonexistent_book(client, test_user):
    """POST /ai/translate with a non-existent book_id must return 404.

    Without this check, the translation is saved as an orphaned row referencing
    a non-existent book (SQLite FK enforcement is OFF)."""
    resp = await client.post("/api/ai/translate", json={
        "text": CHAPTER_TEXT,
        "source_language": "de",
        "target_language": "en",
        "book_id": 999999,
        "chapter_index": 0,
    })
    assert resp.status_code == 404


async def test_translate_rejects_negative_chapter_index(client, test_user):
    """POST /ai/translate with chapter_index < 0 must return 422 (Pydantic ge=0).

    A negative chapter_index is not a valid position — rejected at validation layer."""
    from services.db import save_book
    _META = {"title": "T", "authors": [], "languages": ["de"], "subjects": [],
              "download_count": 0, "cover": ""}
    await save_book(88, _META, "text")
    resp = await client.post("/api/ai/translate", json={
        "text": CHAPTER_TEXT,
        "source_language": "de",
        "target_language": "en",
        "book_id": 88,
        "chapter_index": -1,
    })
    assert resp.status_code == 422


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
    detail = resp.json()["detail"]
    assert "AI down" not in detail
    assert ":" not in detail


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


async def test_translate_total_failure_returns_500_without_detail_leak(client, test_user):
    await _set_key(test_user)
    with patch("services.translate._gemini_translate", new_callable=AsyncMock, side_effect=RuntimeError("internal error")), \
         patch("services.translate._google_translate", new_callable=AsyncMock, side_effect=RuntimeError("google down")):
        resp = await client.post("/api/ai/translate", json={
            "text": "text", "source_language": "de", "target_language": "en",
        })
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert "internal error" not in detail
    assert "google down" not in detail
    assert ":" not in detail


async def test_tts_error_returns_500(client):
    with patch("routers.ai.synthesize", new_callable=AsyncMock, side_effect=RuntimeError("TTS fail")):
        resp = await client.post("/api/ai/tts", json={"text": "Hello", "language": "en", "rate": 1.0})
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert "TTS fail" not in detail
    assert ":" not in detail


# ── TTS rate bounds validation (Issue #482) ───────────────────────────────────

@pytest.mark.parametrize("rate,expected", [
    (9999, 422),    # absurdly fast → malformed Edge TTS percentage string
    (-100, 422),    # negative → malformed string
    (0.1, 422),     # below 0.25 minimum → invalid
    (5.0, 422),     # above 4.0 maximum → invalid
    (0.25, 200),    # lower boundary → valid
    (4.0, 200),     # upper boundary → valid
    (1.5, 200),     # normal value → valid
])
async def test_tts_rate_bounds(client, rate, expected):
    """Regression #482: TTS rate must be validated to prevent malformed Edge TTS strings."""
    with patch("routers.ai.synthesize", new_callable=AsyncMock, return_value=(b"\xff\xfb", "audio/mpeg", [])):
        resp = await client.post("/api/ai/tts", json={"text": "hi", "language": "en", "rate": rate})
    assert resp.status_code == expected, (
        f"rate={rate}: expected {expected}, got {resp.status_code}: {resp.text}"
    )


# ── TTS text max_length validation (Issue #488) ───────────────────────────────

async def test_tts_oversized_text_returns_422(client):
    """Regression #488: TTS text over 50,000 characters must be rejected with 422.

    Without a limit, a user could POST megabytes of text, causing Edge TTS
    to exhaust server memory or run for minutes.
    """
    oversized_text = "x" * 50_001
    resp = await client.post("/api/ai/tts", json={"text": oversized_text, "language": "en"})
    assert resp.status_code == 422, (
        f"Expected 422 for oversized text ({len(oversized_text)} chars), "
        f"got {resp.status_code}: {resp.text[:200]}"
    )


async def test_tts_max_length_boundary_accepted(client):
    """Exactly 50,000 characters must be accepted."""
    with patch("routers.ai.synthesize", new_callable=AsyncMock, return_value=(b"\xff\xfb", "audio/mpeg", [])):
        resp = await client.post("/api/ai/tts", json={"text": "x" * 50_000, "language": "en"})
    assert resp.status_code == 200, (
        f"Expected 200 for 50,000 char text, got {resp.status_code}: {resp.text[:200]}"
    )


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
    detail = resp.json()["detail"]
    assert "AI down" not in detail
    assert ":" not in detail


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


# ── Chapter summary empty text validation (Issue #492) ───────────────────────

async def test_summary_empty_chapter_text_returns_422(client, test_user):
    """Regression #492/#813: empty chapter_text must return 422 (Pydantic min_length=1)."""
    resp = await client.post("/api/ai/summary", json={
        "book_id": 7771, "chapter_index": 0,
        "chapter_text": "", "book_title": "Test Book", "author": "Author",
    })
    assert resp.status_code == 422, f"Expected 422 for empty chapter_text, got {resp.status_code}: {resp.text}"


@pytest.mark.parametrize("chapter_text", ["   ", "\n\t\n"])
async def test_summary_whitespace_chapter_text_returns_422(client, test_user, chapter_text):
    """Regression #492/#1411: whitespace-only chapter_text must return 422 (Pydantic validator)."""
    resp = await client.post("/api/ai/summary", json={
        "book_id": 7771,
        "chapter_index": 0,
        "chapter_text": chapter_text,
        "book_title": "Test Book",
        "author": "Author",
        "chapter_title": "Ch 1",
    })
    assert resp.status_code == 422, (
        f"Expected 422 for whitespace-only chapter_text={repr(chapter_text)}, "
        f"got {resp.status_code}: {resp.text}"
    )


@pytest.mark.parametrize("field,value", [
    ("book_title", "   "),
    ("author", "\t\n"),
])
async def test_summary_whitespace_only_book_title_author_returns_422(client, test_user, field, value):
    """Regression #1411: whitespace-only book_title or author must return 422.

    SummaryRequest was missing _not_blank validators for these fields unlike
    all sibling request models (InsightRequest, QARequest, etc.)."""
    payload = {
        "book_id": 7771,
        "chapter_index": 0,
        "chapter_text": "Some real chapter text.",
        "book_title": "Test Book",
        "author": "Author",
    }
    payload[field] = value
    resp = await client.post("/api/ai/summary", json=payload)
    assert resp.status_code == 422, (
        f"Expected 422 for whitespace-only {field}={repr(value)}, "
        f"got {resp.status_code}: {resp.text}"
    )


# ── Chapter summary concurrent generation ────────────────────────────────────

async def test_summary_concurrent_requests_call_gemini_once(client, test_user, tmp_db):
    """Regression #298: two concurrent requests for the same uncached chapter
    must trigger only one Gemini call; the second waits and hits the cache.

    Without the per-key asyncio.Lock in routers/ai.py, both requests race
    past the cache-miss check and both call generate_chapter_summary().
    """
    from services.auth import encrypt_api_key as _enc
    await save_book(8888, _BOOK_META, "text")
    await set_setting("queue_api_key", _enc("test-gemini-key"))

    call_count = 0

    async def _fake_generate(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.01)  # simulate latency so both requests overlap
        return "A generated summary."

    payload = {
        "book_id": 8888,
        "chapter_index": 0,
        "chapter_text": "Some text here.",
        "book_title": "Faust",
        "author": "Goethe",
        "chapter_title": "Chapter 1",
    }

    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.generate_chapter_summary = _fake_generate
        mock_gemini.MODEL = "gemini-pro"
        results = await asyncio.gather(
            client.post("/api/ai/summary", json=payload),
            client.post("/api/ai/summary", json=payload),
        )

    assert all(r.status_code == 200 for r in results)
    assert call_count == 1, (
        f"Expected 1 Gemini call for concurrent requests to the same chapter, "
        f"got {call_count}. Missing per-key asyncio.Lock in the summary endpoint."
    )


# ── Summary Gemini failure (issue #752) ──────────────────────────────────────

async def test_summary_gemini_error_returns_500_without_detail_leak(client, test_user, tmp_db):
    from services.auth import encrypt_api_key as _enc
    await save_book(9871, _BOOK_META, "word " * 300)
    await set_setting("queue_api_key", _enc("test-gemini-key"))
    with patch("routers.ai.gemini") as mock_gemini:
        mock_gemini.generate_chapter_summary = AsyncMock(
            side_effect=RuntimeError("API quota exceeded for project xyz-secret-123")
        )
        mock_gemini.MODEL = "gemini-2.0"
        resp = await client.post("/api/ai/summary", json={
            "book_id": 9871,
            "chapter_index": 0,
            "chapter_text": "Chapter text here.",
            "book_title": "Test Book",
            "author": "Author",
            "chapter_title": "Ch 1",
        })
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert "xyz-secret-123" not in detail
    assert "quota" not in detail.lower()
    assert ":" not in detail


# ── Access control for private uploaded books ────────────────────────────────


async def test_translate_cache_get_blocked_for_non_owner(client, test_user, tmp_db, insert_private_book):
    """GET /ai/translate/cache for a private uploaded book returns 403 for non-owners.

    Without check_book_access the endpoint returns cached translation paragraphs
    to any authenticated user who knows the book_id (sequential integer)."""
    from services.db import set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("ai-owner-gid1", "ai-owner1@ex.com", "AIOwner1", "")
    await insert_private_book(8901, owner["id"])
    await save_translation(8901, 0, "en", ["Private translation content."])
    resp = await client.get(
        "/api/ai/translate/cache?book_id=8901&chapter_index=0&target_language=en"
    )
    assert resp.status_code == 403, (
        f"Expected 403 for non-owner reading cached translation of private book, "
        f"got {resp.status_code}: {resp.text}"
    )


async def test_translate_post_cache_hit_blocked_for_non_owner(client, test_user, tmp_db, insert_private_book):
    """POST /ai/translate with book_id of a private uploaded book returns 403 for non-owners.

    Without check_book_access the endpoint returns the cached translated chapter
    content to any authenticated user — the access check must precede the cache lookup."""
    from services.db import set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("ai-owner-gid2", "ai-owner2@ex.com", "AIOwner2", "")
    await insert_private_book(8902, owner["id"])
    await save_translation(8902, 0, "en", ["Private translated paragraph."])
    resp = await client.post("/api/ai/translate", json={
        "text": "Es war einmal.",
        "source_language": "de",
        "target_language": "en",
        "book_id": 8902,
        "chapter_index": 0,
    })
    assert resp.status_code == 403, (
        f"Expected 403 for non-owner accessing cached translation of private book via POST /ai/translate, "
        f"got {resp.status_code}: {resp.text}"
    )


# ── chapter_index bounds checks on translation endpoints ─────────────────────

_BOUNDS_META = {"title": "Bounds Test", "authors": [], "languages": ["de"],
                "subjects": [], "download_count": 0, "cover": ""}
_BOUNDS_TEXT = "CHAPTER I\n\n" + "word " * 200 + "\n\nCHAPTER II\n\n" + "word " * 200


async def test_put_translate_cache_out_of_bounds_chapter_returns_400(client, test_user, tmp_db):
    """Regression #462: PUT /ai/translate/cache with chapter_index beyond chapter count
    must return 400 instead of storing a translation at a non-existent chapter."""
    from services.book_chapters import clear_cache as _clear
    await save_book(9886, {**_BOUNDS_META, "id": 9886}, _BOUNDS_TEXT)
    _clear()

    resp = await client.put("/api/ai/translate/cache", json={
        "book_id": 9886,
        "chapter_index": 999,
        "target_language": "en",
        "paragraphs": ["test"],
    })
    assert resp.status_code == 400, (
        f"Expected 400 for out-of-bounds chapter_index=999 on PUT /ai/translate/cache, "
        f"got {resp.status_code}: {resp.text}"
    )
    assert "out of range" in resp.json()["detail"].lower()


async def test_get_translate_cache_out_of_bounds_chapter_returns_400(client, test_user, tmp_db):
    """Regression #462: GET /ai/translate/cache with chapter_index beyond chapter count
    must return 400 instead of a misleading 404."""
    from services.book_chapters import clear_cache as _clear
    await save_book(9887, {**_BOUNDS_META, "id": 9887}, _BOUNDS_TEXT)
    _clear()

    resp = await client.get(
        "/api/ai/translate/cache?book_id=9887&chapter_index=999&target_language=en"
    )
    assert resp.status_code == 400, (
        f"Expected 400 for out-of-bounds chapter_index=999 on GET /ai/translate/cache, "
        f"got {resp.status_code}: {resp.text}"
    )
    assert "out of range" in resp.json()["detail"].lower()


async def test_post_ai_translate_out_of_bounds_chapter_returns_400(client, test_user, tmp_db):
    """Regression #462: POST /ai/translate with chapter_index beyond chapter count
    must return 400 (only lower bound was checked before this fix)."""
    from services.book_chapters import clear_cache as _clear
    await save_book(9888, {**_BOUNDS_META, "id": 9888}, _BOUNDS_TEXT)
    _clear()

    resp = await client.post("/api/ai/translate", json={
        "book_id": 9888,
        "chapter_index": 999,
        "text": "Some text.",
        "source_language": "de",
        "target_language": "en",
    })
    assert resp.status_code == 400, (
        f"Expected 400 for out-of-bounds chapter_index=999 on POST /ai/translate, "
        f"got {resp.status_code}: {resp.text}"
    )
    assert "out of range" in resp.json()["detail"].lower()


async def test_get_chapter_translation_out_of_bounds_returns_400(client, test_user, tmp_db):
    """Regression #462: GET /books/{id}/chapters/{idx}/translation with out-of-bounds
    chapter_index must return 400 instead of a misleading 404."""
    from services.book_chapters import clear_cache as _clear
    await save_book(9889, {**_BOUNDS_META, "id": 9889}, _BOUNDS_TEXT)
    _clear()

    resp = await client.get(
        "/api/books/9889/chapters/999/translation?target_language=en"
    )
    assert resp.status_code == 400, (
        f"Expected 400 for out-of-bounds chapter_index=999 on GET /books/{{}}/chapters/999/translation, "
        f"got {resp.status_code}: {resp.text}"
    )
    assert "out of range" in resp.json()["detail"].lower()


# ── chapter_index bounds checks on /ai/summary ───────────────────────────────

async def test_ai_summary_out_of_bounds_chapter_returns_400(client, test_user, tmp_db):
    """Regression #448: POST /ai/summary with chapter_index beyond chapter count
    must return 400, not silently attempt to generate a summary for a non-existent chapter.
    """
    from services.book_chapters import clear_cache as _clear

    text = "CHAPTER I\n\n" + "word " * 200 + "\n\nCHAPTER II\n\n" + "word " * 200
    await save_book(9881, {"id": 9881, "title": "T", "authors": [], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""}, text)
    _clear()

    resp = await client.post("/api/ai/summary", json={
        "book_id": 9881,
        "chapter_index": 999,
        "chapter_text": "some text",
        "book_title": "T",
        "author": "Unknown",
    })
    assert resp.status_code == 400, (
        f"Expected 400 for out-of-bounds chapter_index=999, got {resp.status_code}: {resp.text}"
    )


# ── DELETE /ai/summary bounds checks (Issue #464) ────────────────────────────

async def test_delete_summary_nonexistent_book_returns_404(client, test_user, tmp_db):
    """Regression #464: DELETE /ai/summary must return 404 when the book does not exist."""
    resp = await client.delete("/api/ai/summary", params={"book_id": 99999, "chapter_index": 0})
    assert resp.status_code == 404, (
        f"Expected 404 for non-existent book, got {resp.status_code}: {resp.text}"
    )


async def test_delete_summary_out_of_bounds_chapter_returns_400(client, test_user, tmp_db):
    """Regression #464: DELETE /ai/summary must return 400 when chapter_index is out of range."""
    from services.book_chapters import clear_cache as _clear

    text = "CHAPTER I\n\n" + "word " * 200 + "\n\nCHAPTER II\n\n" + "word " * 200
    await save_book(9882, {"id": 9882, "title": "T", "authors": [], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""}, text)
    _clear()

    resp = await client.delete("/api/ai/summary", params={"book_id": 9882, "chapter_index": 999})
    assert resp.status_code == 400, (
        f"Expected 400 for out-of-bounds chapter_index=999, got {resp.status_code}: {resp.text}"
    )



# ── Issue #500: AI endpoint input bounds ──────────────────────────────────────

async def test_translate_oversized_text_returns_422(client, test_user):
    """POST /ai/translate rejects text longer than 50,000 chars (issue #500)."""
    resp = await client.post(
        "/api/ai/translate",
        json={"text": "x" * 50_001, "source_language": "de", "target_language": "en"},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized text, got {resp.status_code}"


async def test_insight_oversized_chapter_text_returns_422(client, test_user, monkeypatch):
    """POST /ai/insight rejects chapter_text longer than 50,000 chars (issue #500)."""
    resp = await client.post(
        "/api/ai/insight",
        json={"chapter_text": "x" * 50_001, "book_title": "T", "author": "A"},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized chapter_text, got {resp.status_code}"


async def test_qa_oversized_question_returns_422(client, test_user, monkeypatch):
    """POST /ai/qa rejects question longer than 2,000 chars (issue #500)."""
    resp = await client.post(
        "/api/ai/qa",
        json={"question": "q" * 2001, "passage": "Some passage.", "book_title": "T", "author": "A"},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized question, got {resp.status_code}"


async def test_qa_oversized_passage_returns_422(client, test_user, monkeypatch):
    """POST /ai/qa rejects passage longer than 50,000 chars (issue #500)."""
    resp = await client.post(
        "/api/ai/qa",
        json={"question": "Q?", "passage": "p" * 50_001, "book_title": "T", "author": "A"},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized passage, got {resp.status_code}"


async def test_tts_chunks_oversized_text_returns_422(client, test_user):
    """POST /ai/tts/chunks rejects text longer than 50,000 chars (issue #500)."""
    resp = await client.post(
        "/api/ai/tts/chunks",
        json={"text": "x" * 50_001},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized text, got {resp.status_code}"


async def test_summary_oversized_chapter_text_returns_422(client, test_user, tmp_db):
    """POST /ai/summary rejects chapter_text longer than 50,000 chars (issue #505)."""
    from services.db import save_book
    from services.book_chapters import clear_cache as _clear
    _BOOK_META = {"id": 9896, "title": "T", "authors": [], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""}
    text = "CHAPTER I\n\n" + "word " * 200
    await save_book(9896, _BOOK_META, text)
    _clear()
    resp = await client.post(
        "/api/ai/summary",
        json={"book_id": 9896, "chapter_index": 0, "chapter_text": "x" * 50_001, "book_title": "T", "author": "A"},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized chapter_text, got {resp.status_code}"


async def test_references_oversized_chapter_excerpt_returns_422(client, test_user):
    """POST /ai/references rejects chapter_excerpt longer than max_length (issue #505)."""
    resp = await client.post(
        "/api/ai/references",
        json={"book_title": "T", "author": "A", "chapter_excerpt": "x" * 10_001},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized chapter_excerpt, got {resp.status_code}"


# ── Issue #507: AI metadata field max_length ──────────────────────────────────

async def test_summary_oversized_book_title_returns_422(client, test_user, tmp_db):
    """POST /ai/summary rejects book_title longer than 500 chars (issue #507)."""
    await save_book(9897, {"title": "T", "authors": [], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""}, "text")
    resp = await client.post(
        "/api/ai/summary",
        json={"book_id": 9897, "chapter_index": 0, "chapter_text": "some text", "book_title": "t" * 501, "author": "A"},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized book_title, got {resp.status_code}"


async def test_insight_oversized_author_returns_422(client, test_user):
    """POST /ai/insight rejects author longer than 500 chars (issue #507)."""
    resp = await client.post(
        "/api/ai/insight",
        json={"chapter_text": "some text", "book_title": "T", "author": "a" * 501},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized author, got {resp.status_code}"


async def test_qa_oversized_book_title_returns_422(client, test_user):
    """POST /ai/qa rejects book_title longer than 500 chars (issue #507)."""
    resp = await client.post(
        "/api/ai/qa",
        json={"question": "Q?", "passage": "text", "book_title": "t" * 501, "author": "A"},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized book_title in QA, got {resp.status_code}"


async def test_references_oversized_author_returns_422(client, test_user):
    """POST /ai/references rejects author longer than 500 chars (issue #507)."""
    resp = await client.post(
        "/api/ai/references",
        json={"book_title": "T", "author": "a" * 501},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized author in references, got {resp.status_code}"


async def test_tts_oversized_language_returns_422(client):
    """POST /ai/tts rejects language longer than 20 chars (issue #507)."""
    resp = await client.post(
        "/api/ai/tts",
        json={"text": "hello", "language": "x" * 21},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized language in TTS, got {resp.status_code}"


async def test_translate_oversized_source_language_returns_422(client, test_user):
    """POST /ai/translate rejects source_language longer than 20 chars (issue #507)."""
    resp = await client.post(
        "/api/ai/translate",
        json={"text": "hello", "source_language": "x" * 21, "target_language": "en"},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized source_language, got {resp.status_code}"


# ── Issue #516: SaveTranslationRequest max_length ────────────────────────────


async def test_translate_cache_put_oversized_target_language_returns_422(client, test_user):
    """Regression #516: PUT /ai/translate/cache with target_language > 20 chars
    must return 422, not store a huge string in translations table."""
    await save_book(9821, {"title": "T", "authors": [], "languages": ["de"],
                           "subjects": [], "download_count": 0, "cover": ""}, "text")
    resp = await client.put(
        "/api/ai/translate/cache",
        json={"book_id": 9821, "chapter_index": 0, "target_language": "x" * 21,
              "paragraphs": ["hello"]},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for oversized target_language in PUT /translate/cache, "
        f"got {resp.status_code}: {resp.text}"
    )


async def test_translate_cache_put_oversized_provider_returns_422(client, test_user):
    """Regression #516: PUT /ai/translate/cache with provider > 100 chars must return 422."""
    await save_book(9822, {"title": "T", "authors": [], "languages": ["de"],
                           "subjects": [], "download_count": 0, "cover": ""}, "text")
    resp = await client.put(
        "/api/ai/translate/cache",
        json={"book_id": 9822, "chapter_index": 0, "target_language": "fr",
              "paragraphs": ["hello"], "provider": "x" * 101},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for oversized provider in PUT /translate/cache, "
        f"got {resp.status_code}: {resp.text}"
    )


async def test_translate_cache_put_oversized_model_returns_422(client, test_user):
    """Regression #516: PUT /ai/translate/cache with model > 200 chars must return 422."""
    await save_book(9823, {"title": "T", "authors": [], "languages": ["de"],
                           "subjects": [], "download_count": 0, "cover": ""}, "text")
    resp = await client.put(
        "/api/ai/translate/cache",
        json={"book_id": 9823, "chapter_index": 0, "target_language": "fr",
              "paragraphs": ["hello"], "model": "m" * 201},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for oversized model in PUT /translate/cache, "
        f"got {resp.status_code}: {resp.text}"
    )


# ── Issue #520: SaveTranslationRequest.paragraphs list bounds ─────────────────


async def test_translate_cache_put_too_many_paragraphs_returns_422(client, test_user):
    """Regression #520: PUT /ai/translate/cache with > 2000 paragraphs must return 422."""
    await save_book(9824, {"title": "T", "authors": [], "languages": ["de"],
                           "subjects": [], "download_count": 0, "cover": ""}, "text")
    resp = await client.put(
        "/api/ai/translate/cache",
        json={"book_id": 9824, "chapter_index": 0, "target_language": "fr",
              "paragraphs": ["p"] * 2001},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for too many paragraphs in PUT /translate/cache, "
        f"got {resp.status_code}: {resp.text}"
    )


async def test_translate_cache_put_oversized_paragraph_item_returns_422(client, test_user):
    """Regression #520: PUT /ai/translate/cache with a paragraph > 50000 chars must return 422."""
    await save_book(9825, {"title": "T", "authors": [], "languages": ["de"],
                           "subjects": [], "download_count": 0, "cover": ""}, "text")
    resp = await client.put(
        "/api/ai/translate/cache",
        json={"book_id": 9825, "chapter_index": 0, "target_language": "fr",
              "paragraphs": ["x" * 50001]},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for oversized paragraph item in PUT /translate/cache, "
        f"got {resp.status_code}: {resp.text}"
    )


async def test_translate_cache_put_empty_paragraph_item_returns_422(client, test_user):
    """Regression #906: PUT /ai/translate/cache with an empty string paragraph must return 422."""
    await save_book(9826, {"title": "T", "authors": [], "languages": ["de"],
                           "subjects": [], "download_count": 0, "cover": ""}, "text")
    resp = await client.put(
        "/api/ai/translate/cache",
        json={"book_id": 9826, "chapter_index": 0, "target_language": "fr",
              "paragraphs": [""]},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for empty paragraph item in PUT /translate/cache, "
        f"got {resp.status_code}: {resp.text}"
    )


# ── Oversized query param bounds checks (regression for #576) ─────────────────

async def test_translate_cache_get_oversized_target_language_returns_422(client, test_user):
    """Regression #576: GET /ai/translate/cache target_language was unbounded."""
    resp = await client.get(
        f"/api/ai/translate/cache?book_id=1&chapter_index=0&target_language={'x' * 21}"
    )
    assert resp.status_code == 422


# ── chapter_index ge=0 bounds (#717) ─────────────────────────────────────────

async def test_summary_request_negative_chapter_index_returns_422(client, test_user):
    """Regression #717: POST /ai/summary with chapter_index < 0 must return 422."""
    resp = await client.post("/api/ai/summary", json={
        "book_id": 1, "chapter_index": -1,
        "chapter_text": "text", "book_title": "T", "author": "A",
    })
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_translate_request_negative_chapter_index_returns_422(client, test_user):
    """Regression #717: POST /ai/translate with chapter_index < 0 must return 422."""
    resp = await client.post("/api/ai/translate", json={
        "text": "hello", "source_language": "de", "target_language": "en",
        "book_id": 1, "chapter_index": -1,
    })
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_translate_cache_get_negative_chapter_index_returns_422(client, test_user):
    """Regression #717: GET /ai/translate/cache with chapter_index < 0 must return 422."""
    resp = await client.get(
        "/api/ai/translate/cache?book_id=1&chapter_index=-1&target_language=en"
    )
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_delete_summary_negative_chapter_index_returns_422(client, test_user):
    """Regression #717: DELETE /ai/summary with chapter_index < 0 must return 422."""
    resp = await client.delete("/api/ai/summary?book_id=1&chapter_index=-1")
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_save_translation_negative_chapter_index_returns_422(client, test_user):
    """Regression #719: PUT /ai/translate/cache with chapter_index < 0 must return 422."""
    resp = await client.put("/api/ai/translate/cache", json={
        "book_id": 1, "chapter_index": -1, "target_language": "en",
        "paragraphs": ["Hello."],
    })
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


# ── Issue #729: ge=1 bounds on book_id in ai body models ─────────────────────


async def test_summary_negative_book_id_returns_422(client, test_user):
    """Regression #729: POST /ai/summary with book_id < 1 must return 422."""
    resp = await client.post("/api/ai/summary", json={
        "book_id": -1, "chapter_index": 0,
        "chapter_text": "text", "book_title": "T", "author": "A",
    })
    assert resp.status_code == 422, f"Expected 422 for book_id=-1 in summary, got {resp.status_code}: {resp.text}"


async def test_save_translation_negative_book_id_returns_422(client, test_user):
    """Regression #729: PUT /ai/translate/cache with book_id < 1 must return 422."""
    resp = await client.put("/api/ai/translate/cache", json={
        "book_id": -1, "chapter_index": 0, "target_language": "en",
        "paragraphs": ["Hello."],
    })
    assert resp.status_code == 422, f"Expected 422 for book_id=-1 in save_translation, got {resp.status_code}: {resp.text}"


# ── Issue #772: min_length=1 on target/source language fields ─────────────────


async def test_translate_empty_target_language_returns_422(client, test_user):
    """Regression #772: POST /ai/translate with target_language="" must return 422."""
    resp = await client.post("/api/ai/translate", json={
        "text": "Hallo Welt",
        "target_language": "",
    })
    assert resp.status_code == 422, f"Expected 422 for empty target_language, got {resp.status_code}: {resp.text}"


async def test_translate_empty_source_language_returns_422(client, test_user):
    """Regression #772: POST /ai/translate with source_language="" must return 422."""
    resp = await client.post("/api/ai/translate", json={
        "text": "Hello World",
        "source_language": "",
    })
    assert resp.status_code == 422, f"Expected 422 for empty source_language, got {resp.status_code}: {resp.text}"


async def test_save_translation_empty_target_language_returns_422(client, test_user):
    """Regression #772: PUT /ai/translate/cache with target_language="" must return 422."""
    resp = await client.put("/api/ai/translate/cache", json={
        "book_id": 1, "chapter_index": 0, "target_language": "",
        "paragraphs": ["Hello."],
    })
    assert resp.status_code == 422, f"Expected 422 for empty target_language in save_translation, got {resp.status_code}: {resp.text}"


# ── Issue #792: min_length=1 on GET /ai/translate/cache target_language ───────


async def test_get_translate_cache_empty_target_language_returns_422(client, test_user):
    """Regression #792: GET /ai/translate/cache?target_language="" must return 422."""
    resp = await client.get("/api/ai/translate/cache?book_id=1&chapter_index=0&target_language=")
    assert resp.status_code == 422, (
        f"Expected 422 for empty target_language in GET /ai/translate/cache, got {resp.status_code}: {resp.text}"
    )


# ── Issue #813: min_length=1 on AI endpoint text/content fields ───────────────


async def test_insight_empty_chapter_text_returns_422(client, test_user):
    """Regression #813: POST /ai/insight with chapter_text="" must return 422."""
    resp = await client.post("/api/ai/insight", json={
        "chapter_text": "", "book_title": "Faust", "author": "Goethe",
    })
    assert resp.status_code == 422, f"Expected 422 for empty chapter_text, got {resp.status_code}: {resp.text}"


async def test_qa_empty_question_returns_422(client, test_user):
    """Regression #813: POST /ai/qa with question="" must return 422."""
    resp = await client.post("/api/ai/qa", json={
        "question": "", "passage": "Some text.", "book_title": "Faust", "author": "Goethe",
    })
    assert resp.status_code == 422, f"Expected 422 for empty question in /ai/qa, got {resp.status_code}: {resp.text}"


async def test_qa_empty_passage_returns_422(client, test_user):
    """Regression #813: POST /ai/qa with passage="" must return 422."""
    resp = await client.post("/api/ai/qa", json={
        "question": "What happens?", "passage": "", "book_title": "Faust", "author": "Goethe",
    })
    assert resp.status_code == 422, f"Expected 422 for empty passage in /ai/qa, got {resp.status_code}: {resp.text}"


async def test_translate_empty_text_returns_422(client, test_user):
    """Regression #813: POST /ai/translate with text="" must return 422."""
    resp = await client.post("/api/ai/translate", json={"text": ""})
    assert resp.status_code == 422, f"Expected 422 for empty text in /ai/translate, got {resp.status_code}: {resp.text}"


async def test_tts_empty_text_returns_422(client, test_user):
    """Regression #813: POST /ai/tts with text="" must return 422."""
    resp = await client.post("/api/ai/tts", json={"text": ""})
    assert resp.status_code == 422, f"Expected 422 for empty text in /ai/tts, got {resp.status_code}: {resp.text}"


# ── Issue #1054: whitespace-only response_language / language ─────────────────


async def test_insight_whitespace_response_language_returns_422(client, test_user):
    """Regression #1054: POST /ai/insight with response_language="   " must return 422."""
    resp = await client.post("/api/ai/insight", json={
        "chapter_text": "Some text.", "book_title": "Faust", "author": "Goethe",
        "response_language": "   ",
    })
    assert resp.status_code == 422, (
        f"Expected 422 for whitespace response_language in /ai/insight, got {resp.status_code}: {resp.text}"
    )


async def test_qa_whitespace_response_language_returns_422(client, test_user):
    """Regression #1054: POST /ai/qa with response_language=" " must return 422."""
    resp = await client.post("/api/ai/qa", json={
        "question": "What?", "passage": "Some text.", "book_title": "Faust", "author": "Goethe",
        "response_language": " ",
    })
    assert resp.status_code == 422, (
        f"Expected 422 for whitespace response_language in /ai/qa, got {resp.status_code}: {resp.text}"
    )


async def test_references_whitespace_response_language_returns_422(client, test_user):
    """Regression #1054: POST /ai/references with response_language="\t" must return 422."""
    resp = await client.post("/api/ai/references", json={
        "book_title": "Faust", "author": "Goethe",
        "response_language": "\t",
    })
    assert resp.status_code == 422, (
        f"Expected 422 for whitespace response_language in /ai/references, got {resp.status_code}: {resp.text}"
    )


async def test_tts_whitespace_language_returns_422(client, test_user):
    """Regression #1054: POST /ai/tts with language=" " must return 422."""
    resp = await client.post("/api/ai/tts", json={
        "text": "Hello world",
        "language": " ",
    })
    assert resp.status_code == 422, (
        f"Expected 422 for whitespace language in /ai/tts, got {resp.status_code}: {resp.text}"
    )


async def test_translate_unexpected_error_logs_and_returns_500(client, test_user, caplog):
    """Regression #1078: POST /ai/translate unexpected errors must be logged."""
    import logging
    # do_translate is imported inside the function body, so patch at source module.
    with patch("services.translate.translate_text", new_callable=AsyncMock, side_effect=RuntimeError("service exploded")):
        with caplog.at_level(logging.ERROR, logger="routers.ai"):
            resp = await client.post("/api/ai/translate", json={
                "text": "Hallo", "source_language": "de", "target_language": "en",
            })
    assert resp.status_code == 500
    assert any("translate" in r.message.lower() for r in caplog.records), \
        f"Expected error log for translate 500 but got: {[r.message for r in caplog.records]}"


async def test_tts_unexpected_error_logs_and_returns_500(client, caplog):
    """Regression #1078: POST /ai/tts unexpected errors must be logged."""
    import logging
    with patch("routers.ai.synthesize", new_callable=AsyncMock, side_effect=RuntimeError("TTS crashed")):
        with caplog.at_level(logging.ERROR, logger="routers.ai"):
            resp = await client.post("/api/ai/tts", json={
                "text": "Hello world", "language": "en", "rate": 1.0,
            })
    assert resp.status_code == 500
    assert any("tts" in r.message.lower() or "500" in r.message for r in caplog.records), \
        f"Expected error log for tts 500 but got: {[r.message for r in caplog.records]}"


# ── Issue #1127: whitespace-only content bypasses min_length=1 on AI endpoints ──


@pytest.mark.parametrize("bad", ["   ", "\t\n  "])
async def test_insight_rejects_whitespace_chapter_text(client, test_user, bad):
    resp = await client.post("/api/ai/insight", json={
        "chapter_text": bad,
        "book_title": "War and Peace",
        "author": "Tolstoy",
    })
    assert resp.status_code == 422, f"Expected 422 for whitespace chapter_text, got {resp.status_code}"


@pytest.mark.parametrize("bad", ["   ", "\t"])
async def test_insight_rejects_whitespace_book_title(client, test_user, bad):
    resp = await client.post("/api/ai/insight", json={
        "chapter_text": "Some chapter text",
        "book_title": bad,
        "author": "Tolstoy",
    })
    assert resp.status_code == 422, f"Expected 422 for whitespace book_title, got {resp.status_code}"


async def test_qa_rejects_whitespace_question(client, test_user):
    resp = await client.post("/api/ai/qa", json={
        "question": "   ",
        "passage": "Some passage.",
        "book_title": "Book",
        "author": "Author",
    })
    assert resp.status_code == 422, f"Expected 422 for whitespace question, got {resp.status_code}"


async def test_qa_rejects_whitespace_passage(client, test_user):
    resp = await client.post("/api/ai/qa", json={
        "question": "What happens next?",
        "passage": "\t\n",
        "book_title": "Book",
        "author": "Author",
    })
    assert resp.status_code == 422, f"Expected 422 for whitespace passage, got {resp.status_code}"


async def test_references_rejects_whitespace_book_title(client, test_user):
    resp = await client.post("/api/ai/references", json={
        "book_title": "   ",
        "author": "Author",
    })
    assert resp.status_code == 422, f"Expected 422 for whitespace book_title in references, got {resp.status_code}"


async def test_translate_rejects_whitespace_text(client, test_user):
    resp = await client.post("/api/ai/translate", json={
        "text": "   ",
        "source_language": "de",
        "target_language": "en",
    })
    assert resp.status_code == 422, f"Expected 422 for whitespace text in translate, got {resp.status_code}"


# ── Issue #1132: whitespace-only text on /tts and /tts/chunks ───────────────


async def test_tts_rejects_whitespace_text(anon_client):
    resp = await anon_client.post("/api/ai/tts", json={
        "text": "   ",
        "language": "en",
        "rate": 1.0,
    })
    assert resp.status_code == 422, f"Expected 422 for whitespace text in /ai/tts, got {resp.status_code}"


async def test_tts_chunks_rejects_whitespace_text(anon_client):
    resp = await anon_client.post("/api/ai/tts/chunks", json={"text": "\t\n  "})
    assert resp.status_code == 422, f"Expected 422 for whitespace text in /ai/tts/chunks, got {resp.status_code}"
