from fastapi import APIRouter, HTTPException, Query
from services.gutenberg import search_books, get_book_meta, get_book_text
from services.db import get_cached_book, save_book, list_cached_books
from services.splitter import build_chapters

router = APIRouter(prefix="/books", tags=["books"])


@router.get("/search")
async def search(
    q: str = Query(..., description="Search query"),
    language: str = Query("", description="Language code e.g. en, de, fr"),
    page: int = Query(1, ge=1),
):
    return await search_books(q, language, page)


@router.get("/cached")
async def cached_books():
    """List books already stored in the local database."""
    return await list_cached_books()


@router.get("/{book_id}")
async def book_meta(book_id: int):
    cached = await get_cached_book(book_id)
    if cached:
        return {k: v for k, v in cached.items() if k not in ("text", "cached_at")}
    try:
        return await get_book_meta(book_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{book_id}/chapters")
async def book_chapters(book_id: int):
    """
    Return book split into chapters.
    Serves from local DB if cached, otherwise fetches from Gutenberg and caches.
    """
    cached = await get_cached_book(book_id)

    if cached and cached.get("text"):
        text = cached["text"]
        meta = {k: v for k, v in cached.items() if k not in ("text", "cached_at")}
    else:
        try:
            meta, text = await _fetch_and_cache(book_id)
        except Exception as e:
            msg = str(e) or type(e).__name__
            raise HTTPException(status_code=404, detail=msg)

    chapters = build_chapters(text)
    return {
        "book_id": book_id,
        "meta": meta,
        "chapters": [{"title": c.title, "text": c.text} for c in chapters],
    }


async def _fetch_and_cache(book_id: int) -> tuple[dict, str]:
    meta = await get_book_meta(book_id)
    text = await get_book_text(book_id)
    await save_book(book_id, meta, text)
    return meta, text
