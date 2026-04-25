"""InsightChat message-history endpoints (issue #907).

Persists the running InsightChat conversation server-side so threads
carry across browsers / devices / cache clears. See the design doc
`docs/design/insightchat-history-persistence.md`.
"""

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field, field_validator

from services.auth import get_current_user, check_book_access
from services.db import (
    CHAT_MESSAGE_MAX_BYTES,
    append_chat_message,
    clear_chat_messages,
    get_cached_book,
    get_chat_messages,
)

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessageCreate(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    # Upper bound is intentionally generous at the pydantic level; we enforce
    # the 8 KB byte cap below so reject-with-413 is distinguishable from
    # reject-with-422 (schema violation).
    content: str = Field(..., min_length=1, max_length=64000)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("content cannot be blank")
        return v


@router.get("/{book_id}/messages")
async def list_messages(
    book_id: int = Path(..., ge=1),
    limit: int = Query(50, ge=1, le=200),
    before_id: int | None = Query(None, ge=1),
    user: dict = Depends(get_current_user),
):
    """Return messages for (authenticated user, book), newest first.

    Reverse-pagination: pass the oldest id from the last page as
    `before_id` to fetch the next older page. Response includes
    `has_more` so the client knows when to stop.
    """
    book = await get_cached_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)
    rows = await get_chat_messages(
        user["id"], book_id, limit=limit + 1, before_id=before_id
    )
    has_more = len(rows) > limit
    messages = rows[:limit]
    return {"messages": messages, "has_more": has_more}


@router.post("/{book_id}/messages")
async def post_message(
    req: ChatMessageCreate,
    book_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    """Append one message. Returns the inserted row so the client can
    pick up the id + created_at without a re-fetch."""
    book = await get_cached_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)

    # 8 KB byte cap — prevents a client from filling disk with large
    # individual messages. Size checked on UTF-8-encoded bytes, not
    # pydantic character count, because character vs byte cost differs.
    if len(req.content.encode("utf-8")) > CHAT_MESSAGE_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Message exceeds {CHAT_MESSAGE_MAX_BYTES // 1024} KB limit",
        )

    row = await append_chat_message(
        user["id"], book_id, req.role, req.content
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to persist message")
    return row


@router.delete("/{book_id}/messages")
async def clear_messages(
    book_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    """Clear the full thread for (user, book). Returns deleted count."""
    book = await get_cached_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)
    deleted = await clear_chat_messages(user["id"], book_id)
    return {"deleted": deleted}
