"""User book upload endpoints."""
import json
import logging

import aiosqlite
import services.db as _db
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from services.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/books", tags=["uploads"])

MAX_BOOKS_PER_USER = 10
MAX_TXT_BYTES = 3 * 1024 * 1024   # 3 MB
MAX_EPUB_BYTES = 15 * 1024 * 1024  # 15 MB


async def _user_upload_count(user_id: int) -> int:
    async with aiosqlite.connect(_db.DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM book_uploads WHERE user_id=?", (user_id,)
        ) as cur:
            row = await cur.fetchone()
            return row[0] if row else 0


async def _save_upload_book(user_id: int, title: str, author: str, filename: str,
                            file_size: int, fmt: str, draft_chapters: list[dict]) -> int:
    """Insert a new uploaded book row (source='upload') and book_uploads row."""
    draft_json = json.dumps({"draft": True, "chapters": draft_chapters})
    async with aiosqlite.connect(_db.DB_PATH) as db:
        await db.execute("BEGIN")
        try:
            cur = await db.execute(
                """INSERT INTO books (title, authors, languages, subjects, download_count,
                                     cover, text, images, source, owner_user_id)
                   VALUES (?, ?, '[]', '[]', 0, '', ?, '[]', 'upload', ?)""",
                (title, json.dumps([author]), draft_json, user_id),
            )
            book_id = cur.lastrowid
            await db.execute(
                """INSERT INTO book_uploads (book_id, user_id, filename, file_size, format)
                   VALUES (?, ?, ?, ?, ?)""",
                (book_id, user_id, filename, file_size, fmt),
            )
            await db.execute("COMMIT")
            return book_id
        except Exception:
            await db.execute("ROLLBACK")
            raise


@router.post("/upload")
async def upload_book(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload a .txt or .epub file. Returns book_id + detected chapters for editing."""
    from services.book_parser import parse_txt, parse_epub

    # Quota check
    count = await _user_upload_count(user["id"])
    if count >= MAX_BOOKS_PER_USER:
        raise HTTPException(
            status_code=429,
            detail=f"Upload limit reached ({MAX_BOOKS_PER_USER} books). Delete a book to upload more.",
        )

    # Format check
    filename = file.filename or ""
    if filename.endswith(".txt"):
        fmt = "txt"
        max_size = MAX_TXT_BYTES
    elif filename.endswith(".epub"):
        fmt = "epub"
        max_size = MAX_EPUB_BYTES
    else:
        raise HTTPException(status_code=400, detail="Only .txt and .epub files are supported.")

    file_bytes = await file.read()
    if len(file_bytes) > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File too large. Limit for .{fmt} is {limit_mb} MB.")

    # Parse
    try:
        if fmt == "txt":
            parsed = parse_txt(file_bytes.decode("utf-8", errors="replace"))
        else:
            parsed = parse_epub(file_bytes)
    except Exception as exc:
        logger.exception("Failed to parse uploaded file")
        raise HTTPException(status_code=422, detail=f"Could not parse file: {exc}")

    chapters = parsed["chapters"]
    book_id = await _save_upload_book(
        user_id=user["id"],
        title=parsed["title"],
        author=parsed["author"],
        filename=filename,
        file_size=len(file_bytes),
        fmt=fmt,
        draft_chapters=chapters,
    )

    return {
        "book_id": book_id,
        "title": parsed["title"],
        "author": parsed["author"],
        "format": fmt,
        "detected_chapters": [
            {
                "index": i,
                "title": ch["title"],
                "preview": ch["text"][:120].strip(),
                "word_count": len(ch["text"].split()),
            }
            for i, ch in enumerate(chapters)
        ],
    }


@router.get("/upload/quota")
async def upload_quota(user: dict = Depends(get_current_user)):
    """Return the user's upload quota usage."""
    count = await _user_upload_count(user["id"])
    return {"used": count, "max": MAX_BOOKS_PER_USER}


@router.get("/{book_id}/chapters/draft")
async def get_draft_chapters(book_id: int, user: dict = Depends(get_current_user)):
    """Return the draft chapter list for an uploaded book pending confirmation."""
    async with aiosqlite.connect(_db.DB_PATH) as db:
        async with db.execute(
            "SELECT text, owner_user_id, source FROM books WHERE id=?", (book_id,)
        ) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Book not found")
    if row[2] != "upload":
        raise HTTPException(status_code=400, detail="Not an uploaded book")
    if row[1] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not your book")

    try:
        data = json.loads(row[0])
    except Exception:
        raise HTTPException(status_code=500, detail="Draft data corrupted")

    if not data.get("draft"):
        raise HTTPException(status_code=400, detail="Book already confirmed")

    chapters = data.get("chapters", [])
    return {
        "chapters": [
            {
                "index": i,
                "title": ch["title"],
                "preview": ch["text"][:300].strip(),
                "word_count": len(ch["text"].split()),
            }
            for i, ch in enumerate(chapters)
        ]
    }


class ConfirmChaptersBody(BaseModel):
    chapters: list[dict]  # [{title: str, index: int}] — reordered/renamed list


@router.post("/{book_id}/chapters/confirm")
async def confirm_chapters(
    book_id: int,
    body: ConfirmChaptersBody,
    user: dict = Depends(get_current_user),
):
    """Confirm chapter splits for an uploaded book. Writes chapters to DB and makes book readable."""
    async with aiosqlite.connect(_db.DB_PATH) as db:
        async with db.execute(
            "SELECT text, owner_user_id, source FROM books WHERE id=?", (book_id,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Book not found")
        if row[2] != "upload":
            raise HTTPException(status_code=400, detail="Not an uploaded book")
        if row[1] != user["id"] and user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Not your book")

        try:
            data = json.loads(row[0])
        except Exception:
            raise HTTPException(status_code=500, detail="Draft data corrupted")

        if not data.get("draft"):
            raise HTTPException(status_code=400, detail="Book already confirmed")

        orig_chapters = data.get("chapters", [])

        # Build final chapters: body.chapters provides the ordering/titles;
        # original text comes from orig_chapters by matching original index
        final_chapters = []
        for ch_spec in body.chapters:
            orig_idx = ch_spec.get("original_index", ch_spec.get("index"))
            title = ch_spec.get("title", f"Chapter {len(final_chapters) + 1}")
            if orig_idx is not None and 0 <= orig_idx < len(orig_chapters):
                text = orig_chapters[orig_idx]["text"]
            else:
                text = ""
            final_chapters.append({"title": title, "text": text})

        confirmed_json = json.dumps({"draft": False, "chapters": final_chapters})
        await db.execute(
            "UPDATE books SET text=? WHERE id=?", (confirmed_json, book_id)
        )
        await db.commit()

    return {"ok": True, "chapter_count": len(final_chapters)}


@router.delete("/upload/{book_id}")
async def delete_uploaded_book(book_id: int, user: dict = Depends(get_current_user)):
    """Delete an uploaded book and all associated data."""
    async with aiosqlite.connect(_db.DB_PATH) as db:
        async with db.execute(
            "SELECT owner_user_id, source FROM books WHERE id=?", (book_id,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Book not found")
        if row[1] != "upload":
            raise HTTPException(status_code=400, detail="Cannot delete Gutenberg books via this endpoint")
        if row[0] != user["id"] and user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Not your book")

        async with db.execute(
            "SELECT chapter_index, target_language FROM translation_queue "
            "WHERE book_id=? AND status='running' LIMIT 1",
            (book_id,),
        ) as cur:
            running = await cur.fetchone()
        if running:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"A translation job is currently running for this book "
                    f"(chapter {running[0]}, language '{running[1]}'). "
                    "Wait for it to finish before deleting."
                ),
            )

        await db.execute("DELETE FROM translations WHERE book_id=?", (book_id,))
        await db.execute("DELETE FROM audio_cache WHERE book_id=?", (book_id,))
        await db.execute(
            "DELETE FROM translation_queue WHERE book_id=? AND status != 'running'",
            (book_id,),
        )
        await db.execute("DELETE FROM word_occurrences WHERE book_id=?", (book_id,))
        await db.execute(
            "DELETE FROM vocabulary WHERE id NOT IN (SELECT DISTINCT vocabulary_id FROM word_occurrences)"
        )
        await db.execute("DELETE FROM annotations WHERE book_id=?", (book_id,))
        await db.execute("DELETE FROM book_insights WHERE book_id=?", (book_id,))
        await db.execute("DELETE FROM chapter_summaries WHERE book_id=?", (book_id,))
        await db.execute("DELETE FROM reading_history WHERE book_id=?", (book_id,))
        await db.execute("DELETE FROM user_reading_progress WHERE book_id=?", (book_id,))
        await db.execute("DELETE FROM book_uploads WHERE book_id=?", (book_id,))
        await db.execute("DELETE FROM books WHERE id=?", (book_id,))
        await db.commit()
    from services.book_chapters import clear_cache as _clear_chapter_cache
    _clear_chapter_cache(book_id)
    return {"ok": True}
