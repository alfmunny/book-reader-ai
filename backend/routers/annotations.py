from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from services.auth import get_current_user, check_book_access
from services.db import create_annotation, get_annotations, get_all_annotations, update_annotation, delete_annotation, get_cached_book

router = APIRouter(prefix="/annotations", tags=["annotations"])


AnnotationColor = Literal["yellow", "blue", "green", "pink"]


class AnnotationCreate(BaseModel):
    book_id: int = Field(..., ge=1)
    chapter_index: int = Field(..., ge=0)
    sentence_text: str = Field(..., min_length=1, max_length=5000)
    note_text: str = Field(default="", max_length=10000)
    color: AnnotationColor = "yellow"


class AnnotationUpdate(BaseModel):
    note_text: Optional[str] = Field(default=None, max_length=10000)
    color: Optional[AnnotationColor] = None


@router.post("")
async def create(req: AnnotationCreate, user: dict = Depends(get_current_user)):
    if not req.sentence_text.strip():
        raise HTTPException(status_code=400, detail="sentence_text cannot be blank")
    note_text = req.note_text.strip() if req.note_text else ""
    if req.chapter_index < 0:
        raise HTTPException(status_code=400, detail="chapter_index must be >= 0")
    book = await get_cached_book(req.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)
    from services.book_chapters import split_with_html_preference as _split
    _chapters = await _split(req.book_id, book.get("text") or "")
    if req.chapter_index >= len(_chapters):
        raise HTTPException(
            status_code=400,
            detail=f"Chapter index out of range (book has {len(_chapters)} chapter(s)).",
        )
    return await create_annotation(
        user["id"],
        req.book_id,
        req.chapter_index,
        req.sentence_text,
        note_text,
        req.color,
    )


@router.get("/all")
async def list_all_annotations(user: dict = Depends(get_current_user)):
    return await get_all_annotations(user["id"])


@router.get("")
async def list_annotations(book_id: int = Query(..., ge=1), user: dict = Depends(get_current_user)):
    book = await get_cached_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)
    return await get_annotations(user["id"], book_id)


@router.patch("/{annotation_id}")
async def update(
    req: AnnotationUpdate,
    annotation_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    note_text = req.note_text.strip() if req.note_text is not None else None
    result = await update_annotation(
        annotation_id, user["id"],
        note_text=note_text, color=req.color,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return result


@router.delete("/{annotation_id}")
async def delete(annotation_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    deleted = await delete_annotation(annotation_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return {"ok": True}
