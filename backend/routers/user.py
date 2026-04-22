from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth import get_current_user, encrypt_api_key, decrypt_api_key, check_book_access
from services.db import (
    set_user_gemini_key, get_user_by_id, get_reading_progress,
    get_obsidian_settings, update_obsidian_settings, get_cached_book,
    upsert_progress_and_log_event, get_user_stats,
)

router = APIRouter(prefix="/user", tags=["user"])


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user["picture"],
        "hasGeminiKey": bool(user.get("gemini_key")),
        "role": user.get("role", "user"),
        "approved": bool(user.get("approved", 0)),
        "plan": user.get("plan", "free"),
    }


class GeminiKeyRequest(BaseModel):
    api_key: str


@router.post("/gemini-key")
async def save_gemini_key(
    req: GeminiKeyRequest,
    user: dict = Depends(get_current_user),
):
    if not req.api_key.strip():
        raise HTTPException(status_code=400, detail="API key cannot be empty")
    encrypted = encrypt_api_key(req.api_key.strip())
    await set_user_gemini_key(user["id"], encrypted)
    return {"ok": True}


@router.delete("/gemini-key")
async def delete_gemini_key(user: dict = Depends(get_current_user)):
    await set_user_gemini_key(user["id"], None)
    return {"ok": True}


@router.get("/reading-progress")
async def reading_progress(user: dict = Depends(get_current_user)):
    entries = await get_reading_progress(user["id"])
    return {"entries": entries}


class ProgressUpdate(BaseModel):
    chapter_index: int


@router.put("/reading-progress/{book_id}")
async def update_reading_progress(
    book_id: int,
    req: ProgressUpdate,
    user: dict = Depends(get_current_user),
):
    book = await get_cached_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)
    from services.book_chapters import split_with_html_preference
    _chapters = await split_with_html_preference(book_id, book.get("text") or "")
    if req.chapter_index < 0 or req.chapter_index >= len(_chapters):
        raise HTTPException(
            status_code=400,
            detail=f"Chapter index out of range (book has {len(_chapters)} chapter(s)).",
        )
    await upsert_progress_and_log_event(user["id"], book_id, req.chapter_index)
    return {"ok": True}


@router.get("/stats")
async def user_stats(user: dict = Depends(get_current_user)):
    """Return aggregated reading statistics: totals, streak, activity heatmap."""
    return await get_user_stats(user["id"])


@router.get("/obsidian-settings")
async def get_obsidian(user: dict = Depends(get_current_user)):
    settings = await get_obsidian_settings(user["id"])
    return {
        "obsidian_repo": settings.get("obsidian_repo") or "",
        "obsidian_path": settings.get("obsidian_path") or "",
        "has_github_token": bool(settings.get("github_token")),
    }


class ObsidianSettingsUpdate(BaseModel):
    github_token: Optional[str] = None
    obsidian_repo: str = ""
    obsidian_path: str = ""


@router.patch("/obsidian-settings")
async def patch_obsidian(
    req: ObsidianSettingsUpdate,
    user: dict = Depends(get_current_user),
):
    # None = not supplied → skip the column entirely (avoids a stale-read race).
    # "" = explicit clear → set NULL.  non-empty = encrypt and store.
    if req.github_token is None:
        await update_obsidian_settings(
            user["id"],
            github_token_encrypted=None,
            repo=req.obsidian_repo.strip() or None,
            path=req.obsidian_path.strip() or None,
            token_explicitly_set=False,
        )
    else:
        token_enc = encrypt_api_key(req.github_token.strip()) if req.github_token.strip() else None
        await update_obsidian_settings(
            user["id"],
            github_token_encrypted=token_enc,
            repo=req.obsidian_repo.strip() or None,
            path=req.obsidian_path.strip() or None,
        )
    return {"ok": True}
