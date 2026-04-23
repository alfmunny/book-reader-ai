import asyncio
from collections import defaultdict
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from services.auth import get_current_user, decrypt_api_key, check_book_access
from services.db import (
    get_cached_translation,
    save_translation,
    get_chapter_summary,
    save_chapter_summary,
    get_cached_book,
)
from services import gemini
from services.tts import synthesize, chunk_text

router = APIRouter(prefix="/ai", tags=["ai"])

# One lock per (book_id, chapter_index) — serializes concurrent summary requests
# so the second waiter hits the cache written by the first, not Gemini again.
# Note: in-process only; sufficient for single-process deployment.
_summary_locks: dict[tuple, asyncio.Lock] = defaultdict(asyncio.Lock)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_gemini_key(user: dict) -> str:
    """Return the decrypted Gemini API key or raise 400 if the user has none."""
    raw = user.get("gemini_key")
    if not raw:
        raise HTTPException(
            status_code=400,
            detail="Gemini API key required. Please add it in your profile.",
        )
    try:
        return decrypt_api_key(raw)
    except HTTPException:
        raise HTTPException(
            status_code=400,
            detail="Your Gemini API key could not be decrypted. Please remove it and add it again in your profile.",
        )


# ── Request models ────────────────────────────────────────────────────────────

class InsightRequest(BaseModel):
    chapter_text: str = Field(..., max_length=50_000)
    book_title: str = Field(..., max_length=500)
    author: str = Field(..., max_length=500)
    response_language: str = Field(default="en", max_length=20)


class QARequest(BaseModel):
    question: str = Field(..., max_length=2_000)
    passage: str = Field(..., max_length=50_000)
    book_title: str = Field(..., max_length=500)
    author: str = Field(..., max_length=500)
    response_language: str = Field(default="en", max_length=20)


class ReferencesRequest(BaseModel):
    book_title: str = Field(..., max_length=500)
    author: str = Field(..., max_length=500)
    chapter_title: str = Field(default="", max_length=500)
    chapter_excerpt: str = Field(default="", max_length=10_000)
    response_language: str = Field(default="en", max_length=20)


class SummaryRequest(BaseModel):
    book_id: int
    chapter_index: int
    chapter_text: str = Field(..., max_length=50_000)
    book_title: str = Field(..., max_length=500)
    author: str = Field(..., max_length=500)
    chapter_title: str = Field(default="", max_length=500)


class TranslateRequest(BaseModel):
    text: str = Field(..., max_length=50_000)
    source_language: str = Field(default="de", max_length=20)
    target_language: str = Field(default="en", max_length=20)
    book_id: int | None = None
    chapter_index: int | None = None
    # "auto" → Gemini if user has a key, else Google Translate (free).
    provider: Literal["auto", "gemini", "google"] = "auto"


class TTSRequest(BaseModel):
    text: str = Field(..., max_length=50_000)
    language: str = Field(default="en", max_length=20)
    rate: float = Field(default=1.0, ge=0.25, le=4.0)
    gender: Literal["female", "male"] = "female"


class ChunkTextRequest(BaseModel):
    text: str = Field(..., max_length=50_000)


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


@router.post("/summary")
async def summary(req: SummaryRequest, _user: dict = Depends(get_current_user)):
    """Return a cached chapter summary or generate one with the queue Gemini key.

    Summaries are shared across all users — the first reader pays the Gemini cost,
    subsequent requests return the cached result instantly.
    """
    book = await get_cached_book(req.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, _user)

    from services.book_chapters import split_with_html_preference as _split
    _chapters = await _split(req.book_id, book.get("text") or "")
    if req.chapter_index < 0 or req.chapter_index >= len(_chapters):
        raise HTTPException(
            status_code=400,
            detail=f"Chapter index out of range (book has {len(_chapters)} chapter(s)).",
        )

    if not req.chapter_text.strip():
        raise HTTPException(status_code=400, detail="chapter_text cannot be empty")

    cached = await get_chapter_summary(req.book_id, req.chapter_index)
    if cached:
        return {"summary": cached["content"], "cached": True, "model": cached["model"]}

    async with _summary_locks[(req.book_id, req.chapter_index)]:
        # Double-check: a concurrent request may have written the summary while
        # we were waiting for the lock.
        cached = await get_chapter_summary(req.book_id, req.chapter_index)
        if cached:
            return {"summary": cached["content"], "cached": True, "model": cached["model"]}

        # Use the queue API key so no personal key is required.
        from services.db import get_setting
        from services.auth import decrypt_api_key as _decrypt
        raw = await get_setting("queue_api_key")
        if not raw:
            raise HTTPException(
                status_code=503,
                detail="Chapter summaries are not available yet — the admin has not configured a Gemini API key.",
            )
        try:
            api_key = _decrypt(raw)
        except Exception:
            raise HTTPException(status_code=503, detail="Summary service configuration error.")

        try:
            content = await gemini.generate_chapter_summary(
                api_key, req.chapter_text, req.book_title, req.author, req.chapter_title
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        await save_chapter_summary(req.book_id, req.chapter_index, content, model=gemini.MODEL)
        return {"summary": content, "cached": False, "model": gemini.MODEL}


@router.delete("/summary")
async def delete_summary(book_id: int, chapter_index: int, user: dict = Depends(get_current_user)):
    """Admin-only: delete a cached summary so it will be regenerated on next request."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    book = await get_cached_book(book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")
    from services.book_chapters import split_with_html_preference as _split
    _chapters = await _split(book_id, book.get("text") or "")
    if chapter_index < 0 or chapter_index >= len(_chapters):
        raise HTTPException(
            status_code=400,
            detail=f"Chapter index out of range (book has {len(_chapters)} chapter(s)).",
        )
    from services.db import DB_PATH
    import aiosqlite
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM chapter_summaries WHERE book_id=? AND chapter_index=?",
            (book_id, chapter_index),
        )
        await db.commit()
    return {"ok": True}


@router.get("/translate/cache")
async def translate_cache(
    book_id: int,
    chapter_index: int,
    target_language: str,
    _user: dict = Depends(get_current_user),
):
    """Check if a translation is cached. Returns paragraphs + provider/model if yes, 404 if not."""
    book = await get_cached_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, _user)
    target_language = target_language.lower().split("-")[0]
    from services.book_chapters import split_with_html_preference as _split
    _chapters = await _split(book_id, book.get("text") or "")
    if chapter_index < 0 or chapter_index >= len(_chapters):
        raise HTTPException(
            status_code=400,
            detail=f"Chapter index out of range (book has {len(_chapters)} chapter(s)).",
        )
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
    target_language: str = Field(..., max_length=20)
    paragraphs: list[str]
    provider: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=200)


@router.put("/translate/cache")
async def save_translate_cache(req: SaveTranslationRequest, _user: dict = Depends(get_current_user)):
    """Save a completed progressive translation to the backend cache."""
    if not req.paragraphs:
        raise HTTPException(status_code=400, detail="paragraphs must not be empty")
    book = await get_cached_book(req.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, _user)
    target_language = req.target_language.lower().split("-")[0]
    from services.book_chapters import split_with_html_preference as _split
    _chapters = await _split(req.book_id, book.get("text") or "")
    if req.chapter_index < 0 or req.chapter_index >= len(_chapters):
        raise HTTPException(
            status_code=400,
            detail=f"Chapter index out of range (book has {len(_chapters)} chapter(s)).",
        )
    # Reject if a queue worker is actively translating this chapter — the
    # worker's save_translation (INSERT OR REPLACE) would overwrite whatever
    # we write here when it finishes. (#341)
    from services.translation_queue import queue_status_for_chapter
    status = await queue_status_for_chapter(req.book_id, req.chapter_index, target_language)
    if status["status"] == "running":
        raise HTTPException(
            status_code=409,
            detail=(
                f"A translation job is currently running for chapter {req.chapter_index}. "
                "Wait for it to finish before saving."
            ),
        )
    await save_translation(
        req.book_id, req.chapter_index, target_language, req.paragraphs,
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
        # Validate book existence and access BEFORE cache lookup — checking the
        # cache first would leak cached translation content of private uploaded
        # books to any authenticated user who knows the book_id.
        if req.book_id is not None:
            _book = await get_cached_book(req.book_id)
            if not _book:
                raise HTTPException(status_code=404, detail="Book not found")
            check_book_access(_book, user)
        if req.chapter_index is not None and req.chapter_index < 0:
            raise HTTPException(status_code=400, detail="chapter_index must be >= 0")
        if req.book_id is not None and req.chapter_index is not None and _book is not None:
            from services.book_chapters import split_with_html_preference as _split
            _chapters = await _split(req.book_id, _book.get("text") or "")
            if req.chapter_index >= len(_chapters):
                raise HTTPException(
                    status_code=400,
                    detail=f"Chapter index out of range (book has {len(_chapters)} chapter(s)).",
                )

        # Check shared DB cache first — cache hits don't need any key.
        # Use normalized codes so "ZH" and "zh-CN" both hit a "zh" cache entry.
        if req.book_id is not None and req.chapter_index is not None:
            cached = await get_cached_translation(req.book_id, req.chapter_index, tgt)
            if cached:
                return {"paragraphs": cached, "cached": True}

        # Resolve "auto" to a concrete provider
        raw_key = user.get("gemini_key")
        try:
            decrypted_key: str | None = decrypt_api_key(raw_key) if raw_key else None
        except HTTPException:
            # Key is present but corrupted; treat as no key so auto falls back to Google.
            decrypted_key = None

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
                src,
                tgt,
                provider=chosen,
                gemini_key=decrypted_key,
            )
        except Exception:
            # Gemini failed (quota exhausted, rate limited, network error).
            # Fall back to Google Translate if we were using Gemini.
            if chosen == "gemini":
                paragraphs = await do_translate(
                    req.text,
                    src,
                    tgt,
                    provider="google",
                )
                chosen = "google"
                fallback = True
            else:
                raise

        # Save to shared cache with normalized language codes so any casing variant hits it.
        # Guard: reject if the queue worker is currently translating this chapter (#393).
        # The worker uses INSERT OR REPLACE — it would overwrite whatever we save here.
        # Same pattern as save_translate_cache (PUT /translate/cache, PR #341).
        if req.book_id is not None and req.chapter_index is not None:
            from services.translation_queue import queue_status_for_chapter
            _qstatus = await queue_status_for_chapter(req.book_id, req.chapter_index, tgt)
            if _qstatus["status"] == "running":
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"A translation job is currently running for chapter {req.chapter_index}. "
                        "Wait for it to finish before saving."
                    ),
                )
            await save_translation(
                req.book_id, req.chapter_index, tgt, paragraphs,
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
