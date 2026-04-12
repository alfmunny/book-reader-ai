from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from services.auth import get_current_user, decrypt_api_key
from services.db import (
    get_cached_translation,
    save_translation,
    get_cached_audio,
    save_audio,
    delete_chapter_audio_cache,
)
from services import gemini
from services.youtube import search_videos
from services.tts import synthesize, resolve_voice, chunk_text

router = APIRouter(prefix="/ai", tags=["ai"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_gemini_key(user: dict) -> str:
    """Return the decrypted Gemini API key or raise 400 if the user has none."""
    raw = user.get("gemini_key")
    if not raw:
        raise HTTPException(
            status_code=400,
            detail="Gemini API key required. Please add it in your profile.",
        )
    return decrypt_api_key(raw)


# ── Request models ────────────────────────────────────────────────────────────

class InsightRequest(BaseModel):
    chapter_text: str
    book_title: str
    author: str
    response_language: str = "en"


class QARequest(BaseModel):
    question: str
    passage: str
    book_title: str
    author: str
    response_language: str = "en"


class PronunciationRequest(BaseModel):
    original_text: str
    spoken_text: str
    language: str = "en"


class VideoRequest(BaseModel):
    passage: str
    book_title: str
    author: str


class TranslateRequest(BaseModel):
    text: str
    source_language: str = "de"
    target_language: str = "en"
    book_id: int | None = None
    chapter_index: int | None = None


class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    rate: float = 1.0
    # "auto" → resolves to "google" when the user has a Gemini key,
    #          otherwise falls back to "edge".
    provider: Literal["auto", "edge", "google"] = "auto"
    # Optional cache keys. When book_id + chapter_index are present, the
    # response is served from / written to the persistent audio cache.
    # Snippet calls (sentence clicks, ad-hoc TTS) omit them and bypass.
    # chunk_index defaults to 0 — chunked clients pass it explicitly.
    book_id: int | None = None
    chapter_index: int | None = None
    chunk_index: int = 0


class ChunkTextRequest(BaseModel):
    text: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/insight")
async def insight(req: InsightRequest, user: dict = Depends(get_current_user)):
    key = _require_gemini_key(user)
    try:
        result = await gemini.generate_insight(
            key, req.chapter_text, req.book_title, req.author, req.response_language
        )
        return {"insight": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/qa")
async def qa(req: QARequest, user: dict = Depends(get_current_user)):
    key = _require_gemini_key(user)
    try:
        result = await gemini.answer_question(
            key, req.question, req.passage, req.book_title, req.author, req.response_language
        )
        return {"answer": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pronunciation")
async def pronunciation(req: PronunciationRequest, user: dict = Depends(get_current_user)):
    key = _require_gemini_key(user)
    try:
        result = await gemini.check_pronunciation(
            key, req.original_text, req.spoken_text, req.language
        )
        return {"feedback": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/videos")
async def videos(req: VideoRequest, user: dict = Depends(get_current_user)):
    key = _require_gemini_key(user)
    try:
        query = await gemini.suggest_youtube_query(
            key, req.passage, req.book_title, req.author
        )
        results = await search_videos(query)
        return {"query": query, "videos": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate")
async def translate(req: TranslateRequest, user: dict = Depends(get_current_user)):
    try:
        # Check shared DB cache first — cache hits don't need a Gemini key
        if req.book_id is not None and req.chapter_index is not None:
            cached = await get_cached_translation(req.book_id, req.chapter_index, req.target_language)
            if cached:
                return {"paragraphs": cached, "cached": True}

        key = _require_gemini_key(user)
        paragraphs = await gemini.translate_text(
            key, req.text, req.source_language, req.target_language
        )

        # Save to shared cache
        if req.book_id is not None and req.chapter_index is not None:
            await save_translation(req.book_id, req.chapter_index, req.target_language, paragraphs)

        return {"paragraphs": paragraphs, "cached": False}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tts")
async def tts(req: TTSRequest, user: dict = Depends(get_current_user)):
    """
    Synthesize text to speech.

    The chosen provider is one of:
      - "edge"   Microsoft Edge TTS — free, no API key, MP3 output
      - "google" Google Gemini TTS — uses the user's Gemini key, WAV output
      - "auto"   (default) → google if the user has a Gemini key, else edge

    When `book_id` and `chapter_index` are both provided, the response is
    served from / written to a persistent audio cache keyed by
    (book, chapter, provider, voice). Without those fields the call is
    treated as a one-off snippet and never touches the cache (used for
    sentence-click playback).
    """
    # Resolve "auto" to a concrete backend
    raw_key = user.get("gemini_key")
    decrypted_key: str | None = decrypt_api_key(raw_key) if raw_key else None

    if req.provider == "auto":
        chosen = "google" if decrypted_key else "edge"
    else:
        chosen = req.provider

    if chosen == "google" and not decrypted_key:
        raise HTTPException(
            status_code=400,
            detail="Google TTS requires a Gemini API key. Please add one in your profile.",
        )

    # Cache lookup — only when this is a real chapter request, not a snippet.
    cache_eligible = req.book_id is not None and req.chapter_index is not None
    voice = resolve_voice(chosen, req.language)

    if cache_eligible:
        cached = await get_cached_audio(
            req.book_id, req.chapter_index, chosen, voice, req.chunk_index
        )
        if cached is not None:
            audio, content_type = cached
            return Response(
                content=audio,
                media_type=content_type,
                headers={"X-TTS-Cache": "hit"},
            )

    try:
        audio, content_type = await synthesize(
            req.text,
            req.language,
            req.rate,
            provider=chosen,
            gemini_key=decrypted_key,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Persist on cache miss so the next request (and the next page reload,
    # and the next session, and the next device) returns instantly.
    if cache_eligible:
        await save_audio(
            req.book_id, req.chapter_index, chosen, voice, audio, content_type, req.chunk_index
        )

    return Response(
        content=audio,
        media_type=content_type,
        headers={"X-TTS-Cache": "miss"} if cache_eligible else {},
    )


@router.delete("/tts/cache")
async def delete_tts_cache(
    book_id: int,
    chapter_index: int,
    _user: dict = Depends(get_current_user),
):
    """Delete all cached audio chunks for a chapter (any provider/voice).

    Used by the Regenerate button — the next call to /api/ai/tts will be a
    cache miss and will hit the TTS provider fresh.
    """
    deleted = await delete_chapter_audio_cache(book_id, chapter_index)
    return {"deleted": deleted}


@router.post("/tts/chunks")
async def tts_chunks(req: ChunkTextRequest, _user: dict = Depends(get_current_user)):
    """Return the chunk list the backend would feed to the TTS provider.

    The frontend calls this once per chapter before fetching audio, so it
    can drive a per-chunk progress UI and key the audio cache by chunk_index.
    Single source of truth — the frontend never has to replicate the
    chunking algorithm in TypeScript.
    """
    chunks = chunk_text(req.text)
    return {"chunks": chunks}
