from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from services.auth import get_current_user, check_book_access
from services.db import save_insight, get_insights, get_all_insights, delete_insight, get_cached_book

router = APIRouter(prefix="/insights", tags=["insights"])


class InsightCreate(BaseModel):
    book_id: int = Field(..., ge=1)
    chapter_index: int | None = Field(default=None, ge=0)
    question: str = Field(..., max_length=2000)
    answer: str = Field(..., max_length=20000)
    context_text: str | None = Field(default=None, max_length=5000)


@router.post("")
async def create(req: InsightCreate, user: dict = Depends(get_current_user)):
    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="question cannot be empty")
    if not req.answer or not req.answer.strip():
        raise HTTPException(status_code=400, detail="answer cannot be empty")
    if req.chapter_index is not None and req.chapter_index < 0:
        raise HTTPException(status_code=400, detail="chapter_index must be >= 0")
    book = await get_cached_book(req.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)
    if req.chapter_index is not None:
        from services.book_chapters import split_with_html_preference as _split
        _chapters = await _split(req.book_id, book.get("text") or "")
        if req.chapter_index >= len(_chapters):
            raise HTTPException(
                status_code=400,
                detail=f"Chapter index out of range (book has {len(_chapters)} chapter(s)).",
            )
    return await save_insight(
        user["id"],
        req.book_id,
        req.chapter_index,
        req.question,
        req.answer,
        req.context_text,
    )


@router.get("/all")
async def list_all_insights(user: dict = Depends(get_current_user)):
    return await get_all_insights(user["id"])


@router.get("")
async def list_insights(book_id: int = Query(..., ge=1), user: dict = Depends(get_current_user)):
    book = await get_cached_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)
    return await get_insights(user["id"], book_id)


@router.delete("/{insight_id}")
async def delete(insight_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    deleted = await delete_insight(insight_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Insight not found")
    return {"ok": True}
