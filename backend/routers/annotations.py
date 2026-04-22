from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth import get_current_user
from services.db import create_annotation, get_annotations, get_all_annotations, update_annotation, delete_annotation, get_cached_book

router = APIRouter(prefix="/annotations", tags=["annotations"])


AnnotationColor = Literal["yellow", "blue", "green", "pink"]


class AnnotationCreate(BaseModel):
    book_id: int
    chapter_index: int
    sentence_text: str
    note_text: str = ""
    color: AnnotationColor = "yellow"


class AnnotationUpdate(BaseModel):
    note_text: Optional[str] = None
    color: Optional[AnnotationColor] = None


@router.post("")
async def create(req: AnnotationCreate, user: dict = Depends(get_current_user)):
    if not req.sentence_text or not req.sentence_text.strip():
        raise HTTPException(status_code=400, detail="sentence_text cannot be empty")
    if req.chapter_index < 0:
        raise HTTPException(status_code=400, detail="chapter_index must be >= 0")
    if not await get_cached_book(req.book_id):
        raise HTTPException(status_code=404, detail="Book not found")
    return await create_annotation(
        user["id"],
        req.book_id,
        req.chapter_index,
        req.sentence_text,
        req.note_text,
        req.color,
    )


@router.get("/all")
async def list_all_annotations(user: dict = Depends(get_current_user)):
    return await get_all_annotations(user["id"])


@router.get("")
async def list_annotations(book_id: int, user: dict = Depends(get_current_user)):
    return await get_annotations(user["id"], book_id)


@router.patch("/{annotation_id}")
async def update(
    annotation_id: int,
    req: AnnotationUpdate,
    user: dict = Depends(get_current_user),
):
    result = await update_annotation(
        annotation_id, user["id"],
        note_text=req.note_text, color=req.color,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return result


@router.delete("/{annotation_id}")
async def delete(annotation_id: int, user: dict = Depends(get_current_user)):
    deleted = await delete_annotation(annotation_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return {"ok": True}
