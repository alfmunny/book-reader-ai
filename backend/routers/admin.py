"""
Admin-only endpoints for user management, book cache, and audio cache stats.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth import get_current_user
from services.db import (
    list_users,
    set_user_approved,
    set_user_role,
    delete_user,
    list_cached_books,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency: require the user to be an approved admin."""
    if user.get("role") != "admin" or not user.get("approved"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def get_users(_admin: dict = Depends(_require_admin)):
    """List all users with their role and approval status."""
    return await list_users()


class ApproveRequest(BaseModel):
    approved: bool


@router.put("/users/{user_id}/approve")
async def approve_user(
    user_id: int,
    req: ApproveRequest,
    _admin: dict = Depends(_require_admin),
):
    """Approve or un-approve a user."""
    await set_user_approved(user_id, req.approved)
    return {"ok": True}


class RoleRequest(BaseModel):
    role: str  # "admin" or "user"


@router.put("/users/{user_id}/role")
async def change_role(
    user_id: int,
    req: RoleRequest,
    admin: dict = Depends(_require_admin),
):
    """Change a user's role. Cannot demote yourself."""
    if req.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
    if user_id == admin["id"] and req.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    await set_user_role(user_id, req.role)
    return {"ok": True}


@router.delete("/users/{user_id}")
async def remove_user(
    user_id: int,
    admin: dict = Depends(_require_admin),
):
    """Delete a user. Cannot delete yourself."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await delete_user(user_id)
    return {"ok": True}


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def stats(_admin: dict = Depends(_require_admin)):
    """High-level stats for the admin dashboard."""
    users = await list_users()
    books = await list_cached_books()

    import aiosqlite
    from services.db import DB_PATH

    audio_count = 0
    audio_bytes = 0
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            async with db.execute("SELECT COUNT(*), COALESCE(SUM(LENGTH(audio)),0) FROM audio_cache") as cur:
                row = await cur.fetchone()
                audio_count = row[0]
                audio_bytes = row[1]
        except Exception:
            pass

    return {
        "users_total": len(users),
        "users_approved": sum(1 for u in users if u.get("approved")),
        "users_pending": sum(1 for u in users if not u.get("approved")),
        "books_cached": len(books),
        "audio_chunks_cached": audio_count,
        "audio_cache_mb": round(audio_bytes / (1024 * 1024), 1),
    }
