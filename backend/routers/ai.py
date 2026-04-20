from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from services.auth import get_current_user, decrypt_api_key
from services.db import (
    get_cached_translation,
    save_translation,
)
from services import gemini
from services.tts import synthesize, chunk_text

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


class ReferencesRequest(BaseModel):
    book_title: str
    author: str
    chapter_title: str = ""
    chapter_excerpt: str = ""
    response_language: str = "en"


class TranslateRequest(BaseModel):
    text: str
    source_language: str = "de"
    target_language: str = "en"
    book_id: int | None = None
    chapter_index: int | None = None
    # "auto" → Gemini if user has a key, else Google Translate (free).
    provider: Literal["auto", "gemini", "google"] = "auto"


class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    rate: float = 1.0
    gender: Literal["female", "male"] = "female"


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


@router.post("/references")
async def references(req: ReferencesRequest, user: dict = Depends(get_current_user)):
    """Generate AI-curated references, related readings, and video links for a book."""
    key = _require_gemini_key(user)
    try:
        excerpt = req.chapter_excerpt[:800] if req.chapter_excerpt else ""
        prompt = (
            f'Book: "{req.book_title}" by {req.author}\n'
            + (f'Chapter: {req.chapter_title}\nExcerpt:\n---\n{excerpt}\n---\n\n' if excerpt else "\n")
            + "Suggest 5-8 curated references for someone reading this book. Include:\n"
            "- Related books or essays worth reading\n"
            "- Notable film or theater adaptations (with year)\n"
            "- YouTube videos or lectures about this work\n"
            "- Historical or cultural context articles\n"
            "- Academic analyses or literary criticism\n\n"
            "Format as a markdown list with brief descriptions. Include links where you're confident they exist."
        )
        result = await gemini.answer_question(
            key, prompt, excerpt or "N/A", req.book_title, req.author, req.response_language
        )
        return {"references": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/translate/cache")
async def translate_cache(
    book_id: int,
    chapter_index: int,
    target_language: str,
    _user: dict = Depends(get_current_user),
):
    """Check if a translation is cached. Returns paragraphs + provider/model if yes, 404 if not."""
    from services.db import get_cached_translation_with_meta
    cached = await get_cached_translation_with_meta(book_id, chapter_index, target_language)
    if cached:
        return {
            "paragraphs": cached["paragraphs"],
            "provider": cached["provider"],
            "model": cached["model"],
            "cached": True,
        }
    raise HTTPException(status_code=404, detail="Not cached")


class SaveTranslationRequest(BaseModel):
    book_id: int
    chapter_index: int
    target_language: str
    paragraphs: list[str]
    provider: str | None = None
    model: str | None = None


@router.put("/translate/cache")
async def save_translate_cache(req: SaveTranslationRequest, _user: dict = Depends(get_current_user)):
    """Save a completed progressive translation to the backend cache."""
    await save_translation(
        req.book_id, req.chapter_index, req.target_language, req.paragraphs,
        provider=req.provider, model=req.model,
    )
    return {"ok": True}


@router.post("/translate")
async def translate(req: TranslateRequest, user: dict = Depends(get_current_user)):
    """Translate text with auto-fallback: Gemini if key available, else Google Translate (free)."""
    src = req.source_language.lower().split("-")[0]
    tgt = req.target_language.lower().split("-")[0]
    if src == tgt:
        raise HTTPException(status_code=400, detail="Source and target language are the same.")
    try:
        # Check shared DB cache first — cache hits don't need any key
        if req.book_id is not None and req.chapter_index is not None:
            cached = await get_cached_translation(req.book_id, req.chapter_index, req.target_language)
            if cached:
                return {"paragraphs": cached, "cached": True}

        # Resolve "auto" to a concrete provider
        raw_key = user.get("gemini_key")
        decrypted_key: str | None = decrypt_api_key(raw_key) if raw_key else None

        if req.provider == "auto":
            chosen = "gemini" if decrypted_key else "google"
        else:
            chosen = req.provider

        if chosen == "gemini" and not decrypted_key:
            raise HTTPException(
                status_code=400,
                detail="Gemini translation requires a Gemini API key. Please add one in your profile, or use Google Translate (free).",
            )

        from services.translate import translate_text as do_translate
        fallback = False

        try:
            paragraphs = await do_translate(
                req.text,
                req.source_language,
                req.target_language,
                provider=chosen,
                gemini_key=decrypted_key,
            )
        except Exception:
            # Gemini failed (quota exhausted, rate limited, network error).
            # Fall back to Google Translate if we were using Gemini.
            if chosen == "gemini":
                paragraphs = await do_translate(
                    req.text,
                    req.source_language,
                    req.target_language,
                    provider="google",
                )
                chosen = "google"
                fallback = True
            else:
                raise

        # Save to shared cache, tagged with provider so the reader can show origin
        if req.book_id is not None and req.chapter_index is not None:
            await save_translation(
                req.book_id, req.chapter_index, req.target_language, paragraphs,
                provider=chosen,
            )

        return {
            "paragraphs": paragraphs,
            "cached": False,
            "provider": chosen,
            **({"fallback": True} if fallback else {}),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tts")
async def tts(req: TTSRequest):
    """Synthesize text with Edge TTS (free, no login required)."""
    import json as _json
    try:
        audio, content_type, boundaries = await synthesize(
            req.text, req.language, req.rate, gender=req.gender
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    headers: dict = {}
    if boundaries:
        timings_json = _json.dumps(boundaries, separators=(",", ":"))
        if len(timings_json) <= 8000:
            headers["X-TTS-Timings"] = timings_json
    return Response(content=audio, media_type=content_type, headers=headers)


@router.post("/tts/chunks")
async def tts_chunks(req: ChunkTextRequest):
    """Return the chunk list for a text. Used by the frontend to drive per-chunk progress."""
    chunks = chunk_text(req.text)
    return {"chunks": chunks}
