from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.librivox import search_audiobooks
from services.db import get_audiobook, save_audiobook, delete_audiobook

router = APIRouter(prefix="/audiobooks", tags=["audiobooks"])


class SaveRequest(BaseModel):
    # Full audiobook object returned by the search endpoint
    id: str
    title: str
    authors: list[str] = []
    url_librivox: str = ""
    url_rss: str = ""
    sections: list[dict] = []


@router.get("/{book_id}")
async def get(book_id: int):
    """Return the saved audiobook for a Gutenberg book, or null if none.

    We return 200+null (rather than 404) so the frontend can fetch this on
    every reader page load without producing red 404s in the browser console
    — "no audiobook linked" is a perfectly normal state, not an error.
    """
    return await get_audiobook(book_id)


@router.get("/{book_id}/search")
async def search(book_id: int, title: str = "", author: str = ""):
    """Search LibriVox for audiobooks matching title/author."""
    try:
        results = await search_audiobooks(title, author)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{book_id}")
async def save(book_id: int, body: SaveRequest):
    """Save (link) an audiobook to a Gutenberg book."""
    try:
        await save_audiobook(book_id, body.model_dump())
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{book_id}")
async def remove(book_id: int):
    """Unlink an audiobook from a Gutenberg book."""
    await delete_audiobook(book_id)
    return {"ok": True}
