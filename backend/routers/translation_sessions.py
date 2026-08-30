"""Per-user translation sessions (design: docs/design/user-translations.md).

Named, book-scoped sessions translated with the user's own provider key.
All endpoints operate only on the caller's sessions — foreign ids are 404s.
"""

import asyncio
import logging
from typing import Literal

import aiosqlite

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field, field_validator

from services.auth import get_current_user, decrypt_api_key, check_book_access
from services.db import (
    get_cached_book,
    create_translation_session,
    list_translation_sessions,
    get_translation_session,
    update_translation_session,
    delete_translation_session,
    get_session_paragraphs,
    upsert_session_paragraph,
    delete_session_paragraph,
    get_posted_paragraph_indexes,
    create_story,
)
from services import user_translate
# Shared error vocabulary with the insight chat (#2683): actionable,
# provider-naming messages without leaking internals.
from routers.ai import _provider_error_detail

router = APIRouter(prefix="/translation-sessions", tags=["translation-sessions"])
logger = logging.getLogger(__name__)

# Active chapter-translation runs, keyed (session_id, chapter_index).
# In-process only — sufficient for single-process deployment (same pattern
# as the summary locks in routers/ai.py). A run survives page reloads: the
# client polls the chapter endpoint, which reports {active, done, total,
# error}; finished runs are reported once more, then cleared.
_chapter_runs: dict[tuple[int, int], dict] = {}

_KEY_COLUMNS = {"deepseek": "deepseek_key", "claude": "claude_key"}
_LABELS = {"deepseek": "DeepSeek", "claude": "Claude"}

# Same split the editorial pipeline uses (services/translate.py) — keeps
# paragraph_index aligned with the reader's translations[] contract.
def _chapter_paragraphs(text: str) -> list[str]:
    return [p for p in text.split("\n\n") if p.strip()]


def _require_key(user: dict, provider: str) -> str:
    raw = user.get(_KEY_COLUMNS[provider])
    label = _LABELS[provider]
    if not raw:
        raise HTTPException(
            status_code=400,
            detail=f"{label} API key required. Please add it in your profile.",
        )
    try:
        return decrypt_api_key(raw)
    except HTTPException:
        raise HTTPException(
            status_code=400,
            detail=f"Your {label} API key could not be decrypted. Please remove it and add it again in your profile.",
        )


async def _require_session(session_id: int, user: dict) -> dict:
    session = await get_translation_session(session_id, user["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Version not found")
    return session


async def _chapter_text(book_id: int, chapter_index: int, user: dict) -> tuple[str, str]:
    """Return (chapter text, source language) after access + range checks."""
    book = await get_cached_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)
    from services.book_chapters import get_chapters
    chapters = await get_chapters(book_id)
    if chapter_index >= len(chapters):
        raise HTTPException(
            status_code=400,
            detail=f"Chapter index out of range (book has {len(chapters)} chapter(s)).",
        )
    source_language = (book.get("languages") or ["en"])[0] if isinstance(book.get("languages"), list) else "en"
    return chapters[chapter_index].text, source_language


# ── Request models ────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    book_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=100)
    target_language: str = Field(..., min_length=1, max_length=20)
    provider: Literal["deepseek", "claude"]
    style_prompt: str | None = Field(default=None, max_length=2000)
    status: Literal["private", "public"] = "public"

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name cannot be blank")
        return v.strip()

    @field_validator("target_language")
    @classmethod
    def lang_normalized(cls, v: str) -> str:
        s = v.strip().lower().split("-")[0]
        if not s:
            raise ValueError("target_language cannot be blank")
        return s


class SessionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    style_prompt: str | None = Field(default=None, max_length=2000)
    provider: Literal["deepseek", "claude"] | None = None
    # Changeable mid-version (owner decision, 2026-08-27): paragraphs already
    # translated to the old language simply stay — not strict on purpose.
    target_language: str | None = Field(default=None, min_length=1, max_length=20)
    status: Literal["private", "public"] | None = None

    @field_validator("target_language")
    @classmethod
    def lang_normalized(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip().lower().split("-")[0]
        if not s:
            raise ValueError("target_language cannot be blank")
        return s


class TranslateRequest(BaseModel):
    chapter_index: int = Field(..., ge=0)
    # "chapter" translates every untranslated/machine paragraph; an integer
    # translates exactly that paragraph (v1 granularity, owner-approved).
    scope: Literal["chapter"] | int = Field(...)
    provider: Literal["deepseek", "claude"] | None = None  # one-off override
    force: bool = False  # chapter scope: retranslate machine paragraphs (edited ones are always kept)

    @field_validator("scope")
    @classmethod
    def scope_valid(cls, v):
        if isinstance(v, int) and v < 0:
            raise ValueError("paragraph index must be >= 0")
        return v


class ParagraphEdit(BaseModel):
    text: str = Field(..., min_length=1, max_length=20000)

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text cannot be blank")
        return v


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_sessions(book_id: int, user: dict = Depends(get_current_user)):
    return await list_translation_sessions(user["id"], book_id)


@router.post("", status_code=201)
async def create_session(req: SessionCreate, user: dict = Depends(get_current_user)):
    book = await get_cached_book(req.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)
    created = await create_translation_session(
        user["id"], req.book_id, req.name, req.target_language, req.provider, req.style_prompt,
        status=req.status,
    )
    if created is None:
        raise HTTPException(status_code=409, detail=f'You already have a version named "{req.name}" for this book.')
    created["coverage"] = {}
    return created


@router.patch("/{session_id}")
async def update_session(
    req: SessionUpdate,
    session_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    await _require_session(session_id, user)
    fields = req.model_dump(exclude_none=True)
    if "name" in fields and not fields["name"].strip():
        raise HTTPException(status_code=400, detail="name cannot be blank")
    try:
        updated = await update_translation_session(session_id, user["id"], fields)
    except aiosqlite.IntegrityError:
        raise HTTPException(status_code=409, detail="You already have a version with that name for this book.")
    if updated is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return updated


@router.delete("/{session_id}")
async def delete_session(session_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    deleted = await delete_translation_session(session_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Version not found")
    return {"ok": True}


@router.get("/{session_id}/chapters/{chapter_index}")
async def chapter_paragraphs(
    session_id: int = Path(..., ge=1),
    chapter_index: int = Path(..., ge=0),
    user: dict = Depends(get_current_user),
):
    session = await _require_session(session_id, user)
    text, _ = await _chapter_text(session["book_id"], chapter_index, user)
    paragraphs = await get_session_paragraphs(session_id, chapter_index)
    run = _chapter_runs.get((session_id, chapter_index))
    run_status = None
    if run is not None:
        run_status = {"active": not run["finished"], "done": run["done"], "total": run["total"], "error": run["error"]}
        if run["finished"]:
            _chapter_runs.pop((session_id, chapter_index), None)
    return {
        "session_id": session_id,
        "chapter_index": chapter_index,
        "paragraph_count": len(_chapter_paragraphs(text)),
        "paragraphs": paragraphs,
        "run": run_status,
    }


@router.post("/{session_id}/translate")
async def translate(
    req: TranslateRequest,
    session_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    session = await _require_session(session_id, user)
    provider = req.provider or session["provider"]
    api_key = _require_key(user, provider)
    text, source_language = await _chapter_text(session["book_id"], req.chapter_index, user)
    paragraphs = _chapter_paragraphs(text)
    run_key = (session_id, req.chapter_index)
    active_run = _chapter_runs.get(run_key)
    if active_run is not None and not active_run["finished"]:
        raise HTTPException(status_code=409, detail="This chapter is already being translated — watch the progress bar.")

    async def _translate_one(i: int, sem: asyncio.Semaphore):
        async with sem:
            translated, model = await user_translate.translate_paragraph(
                provider, api_key, paragraphs[i],
                source_language, session["target_language"], session["style_prompt"],
            )
        await upsert_session_paragraph(
            session_id, req.chapter_index, i, translated, provider, model
        )
        # A PUBLIC session shares as it goes (owner, 2026-08-28): ensure a
        # post exists for the fresh rendering.
        if session.get("status") == "public":
            posted = await get_posted_paragraph_indexes(session_id, req.chapter_index)
            if i not in posted:
                await create_story(user["id"], {
                    "kind": "translation", "book_id": session["book_id"],
                    "chapter_index": req.chapter_index, "session_id": session_id,
                    "paragraph_start": i, "paragraph_end": i,
                })

    if isinstance(req.scope, int):
        if active_run is not None and not active_run["finished"]:
            raise HTTPException(status_code=409, detail="This chapter is already being translated — wait for the run to finish.")
        if req.scope >= len(paragraphs):
            raise HTTPException(
                status_code=400,
                detail=f"Paragraph index out of range (chapter has {len(paragraphs)} paragraph(s)).",
            )
        if req.scope in await get_posted_paragraph_indexes(session_id, req.chapter_index):
            raise HTTPException(
                status_code=409,
                detail="This paragraph is posted — make it private before retranslating.",
            )
        try:
            await _translate_one(req.scope, asyncio.Semaphore(1))
        except Exception as exc:
            logger.exception(
                "translation session %s paragraph translate failed for user %s: %s",
                session_id, user.get("id"), exc,
            )
            raise HTTPException(status_code=502, detail=_provider_error_detail(provider, exc))
        updated = await get_session_paragraphs(session_id, req.chapter_index)
        return {
            "session_id": session_id,
            "chapter_index": req.chapter_index,
            "paragraph_count": len(paragraphs),
            "paragraphs": updated,
            "run": None,
        }

    # scope == "chapter": background run + polling (owner feedback,
    # 2026-08-27 — one long request rendered nothing until reload).
    existing = await get_session_paragraphs(session_id, req.chapter_index)
    if req.force:
        # Explicit retranslate: redo everything machine-made; manual edits
        # AND posted paragraphs are kept — a public post must never be
        # silently rewritten by a machine pass (owner, 2026-08-31).
        posted = await get_posted_paragraph_indexes(session_id, req.chapter_index)
        targets = [
            i for i in range(len(paragraphs))
            if not existing.get(i, {}).get("edited_by_user") and i not in posted
        ]
    else:
        # Default fill run: only paragraphs with no translation yet — a
        # second click never silently re-burns tokens (owner, 2026-08-27).
        targets = [i for i in range(len(paragraphs)) if i not in existing]
    run = {"done": 0, "total": len(targets), "error": None, "finished": len(targets) == 0}
    _chapter_runs[run_key] = run

    async def _run_chapter():
        sem = asyncio.Semaphore(3)

        async def _tracked(i: int):
            await _translate_one(i, sem)
            run["done"] += 1

        try:
            await asyncio.gather(*[_tracked(i) for i in targets])
        except Exception as exc:
            logger.exception(
                "translation session %s chapter run failed for user %s: %s",
                session_id, user.get("id"), exc,
            )
            run["error"] = _provider_error_detail(provider, exc)
        finally:
            run["finished"] = True

    if targets:
        asyncio.create_task(_run_chapter())
    return {
        "session_id": session_id,
        "chapter_index": req.chapter_index,
        "paragraph_count": len(paragraphs),
        "paragraphs": existing,
        "run": {"active": not run["finished"], "done": run["done"], "total": run["total"], "error": run["error"]},
    }


@router.patch("/{session_id}/chapters/{chapter_index}/paragraphs/{paragraph_index}")
async def edit_paragraph(
    req: ParagraphEdit,
    session_id: int = Path(..., ge=1),
    chapter_index: int = Path(..., ge=0),
    paragraph_index: int = Path(..., ge=0),
    user: dict = Depends(get_current_user),
):
    session = await _require_session(session_id, user)
    # A manual edit keeps the original model tag when one exists (the chip
    # shows "model + edited"); a from-scratch manual paragraph tags "manual".
    existing = (await get_session_paragraphs(session_id, chapter_index)).get(paragraph_index)
    await upsert_session_paragraph(
        session_id, chapter_index, paragraph_index,
        req.text,
        existing["provider"] if existing else session["provider"],
        existing["model"] if existing else "manual",
        edited_by_user=True,
    )
    paragraphs = await get_session_paragraphs(session_id, chapter_index)
    return paragraphs[paragraph_index]


@router.delete("/{session_id}/chapters/{chapter_index}/paragraphs/{paragraph_index}")
async def remove_paragraph(
    session_id: int = Path(..., ge=1),
    chapter_index: int = Path(..., ge=0),
    paragraph_index: int = Path(..., ge=0),
    user: dict = Depends(get_current_user),
):
    await _require_session(session_id, user)
    deleted = await delete_session_paragraph(session_id, chapter_index, paragraph_index)
    if not deleted:
        raise HTTPException(status_code=404, detail="Paragraph not found")
    return {"ok": True}
