from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from services.auth import get_current_user, decrypt_api_key
from services.db import get_cached_translation, save_translation
from services.claude import (
    generate_insight as claude_insight,
    answer_question as claude_qa,
    check_pronunciation as claude_pronunciation,
    suggest_youtube_query as claude_youtube,
    translate_text as claude_translate,
)
from services import gemini
from services.youtube import search_videos
from services.tts import synthesize

router = APIRouter(prefix="/ai", tags=["ai"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _gemini_key(user: dict) -> str | None:
    """Return decrypted Gemini API key if the user has one, else None."""
    raw = user.get("gemini_key")
    if not raw:
        return None
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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/insight")
async def insight(req: InsightRequest, user: dict = Depends(get_current_user)):
    try:
        key = _gemini_key(user)
        if key:
            result = await gemini.generate_insight(
                key, req.chapter_text, req.book_title, req.author, req.response_language
            )
        else:
            result = await claude_insight(
                req.chapter_text, req.book_title, req.author, req.response_language
            )
        return {"insight": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/qa")
async def qa(req: QARequest, user: dict = Depends(get_current_user)):
    try:
        key = _gemini_key(user)
        if key:
            result = await gemini.answer_question(
                key, req.question, req.passage, req.book_title, req.author, req.response_language
            )
        else:
            result = await claude_qa(
                req.question, req.passage, req.book_title, req.author, req.response_language
            )
        return {"answer": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pronunciation")
async def pronunciation(req: PronunciationRequest, user: dict = Depends(get_current_user)):
    try:
        key = _gemini_key(user)
        if key:
            result = await gemini.check_pronunciation(
                key, req.original_text, req.spoken_text, req.language
            )
        else:
            result = await claude_pronunciation(
                req.original_text, req.spoken_text, req.language
            )
        return {"feedback": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/videos")
async def videos(req: VideoRequest, user: dict = Depends(get_current_user)):
    try:
        key = _gemini_key(user)
        if key:
            query = await gemini.suggest_youtube_query(
                key, req.passage, req.book_title, req.author
            )
        else:
            query = await claude_youtube(req.passage, req.book_title, req.author)
        results = await search_videos(query)
        return {"query": query, "videos": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate")
async def translate(req: TranslateRequest, user: dict = Depends(get_current_user)):
    try:
        # Check shared DB cache first
        if req.book_id is not None and req.chapter_index is not None:
            cached = await get_cached_translation(req.book_id, req.chapter_index, req.target_language)
            if cached:
                return {"paragraphs": cached, "cached": True}

        key = _gemini_key(user)
        if key:
            paragraphs = await gemini.translate_text(
                key, req.text, req.source_language, req.target_language
            )
        else:
            paragraphs = await claude_translate(
                req.text, req.source_language, req.target_language
            )

        # Save to shared cache
        if req.book_id is not None and req.chapter_index is not None:
            await save_translation(req.book_id, req.chapter_index, req.target_language, paragraphs)

        return {"paragraphs": paragraphs, "cached": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tts")
async def tts(req: TTSRequest, user: dict = Depends(get_current_user)):
    """Synthesize text to MP3 using Microsoft Edge neural TTS."""
    try:
        audio = await synthesize(req.text, req.language, req.rate)
        return Response(content=audio, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
