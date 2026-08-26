"""User book upload endpoints."""
import hashlib
import json
import logging
from datetime import datetime, timezone

import aiosqlite
import services.db as _db
from fastapi import APIRouter, Depends, File, HTTPException, Path, UploadFile
from pydantic import BaseModel, Field
from services.auth import get_current_user
from services.db import get_user_book_chapters, count_draft_user_book_chapters

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
                            file_size: int, fmt: str, draft_chapters: list[dict],
                            max_books: int | None = None) -> int:
    """Insert a new uploaded book row (source='upload') and book_uploads row.

    Chapters are persisted in the user_book_chapters table with is_draft=1.
    The books.text column stays empty for uploads.

    If max_books is provided, the quota is re-checked inside the BEGIN IMMEDIATE
    transaction to prevent TOCTOU races between concurrent uploads.
    """
    async with aiosqlite.connect(_db.DB_PATH) as db:
        # BEGIN IMMEDIATE acquires a write lock immediately so that a second
        # concurrent upload cannot pass the quota check after this connection
        # has already started its insert (#489).
        await db.execute("BEGIN IMMEDIATE")
        try:
            if max_books is not None:
                async with db.execute(
                    "SELECT COUNT(*) FROM book_uploads WHERE user_id=?", (user_id,)
                ) as cur:
                    count = (await cur.fetchone())[0]
                if count >= max_books:
                    raise HTTPException(
                        status_code=429,
                        detail=f"Upload limit reached ({max_books} books). Delete a book to upload more.",
                    )
            # Assign IDs ≥ 1,000,000 for uploaded books so they don't appear
            # visually adjacent to Gutenberg IDs (which reach ~78,000) in URLs.
            async with db.execute(
                "SELECT MAX(id) FROM books WHERE id >= 1000000"
            ) as _cur:
                _row = await _cur.fetchone()
            next_id = (_row[0] if _row and _row[0] is not None else 999999) + 1
            cur = await db.execute(
                """INSERT INTO books (id, title, authors, languages, subjects, download_count,
                                     cover, text, images, source, owner_user_id)
                   VALUES (?, ?, ?, '[]', '[]', 0, '', '', '[]', 'upload', ?)""",
                (next_id, title, json.dumps([author]), user_id),
            )
            book_id = cur.lastrowid
            await db.execute(
                """INSERT INTO book_uploads (book_id, user_id, filename, file_size, format)
                   VALUES (?, ?, ?, ?, ?)""",
                (book_id, user_id, filename, file_size, fmt),
            )
            await db.executemany(
                """INSERT INTO user_book_chapters (book_id, chapter_index, title, text, is_draft)
                   VALUES (?, ?, ?, ?, 1)""",
                [
                    (book_id, i, ch.get("title", "") or "", ch.get("text", "") or "")
                    for i, ch in enumerate(draft_chapters)
                ],
            )
            await db.execute("COMMIT")
            return book_id
        except HTTPException:
            await db.execute("ROLLBACK")
            raise
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

    # Admins are exempt; non-admins have the quota re-checked atomically inside
    # _save_upload_book to prevent TOCTOU races between concurrent uploads (#489).
    max_books = None if user.get("role") == "admin" else MAX_BOOKS_PER_USER

    # Format check
    filename = file.filename or ""
    if len(filename) > 255:
        raise HTTPException(status_code=422, detail="Filename too long (max 255 characters).")
    filename_lower = filename.lower()
    if filename_lower.endswith(".txt"):
        fmt = "txt"
        max_size = MAX_TXT_BYTES
    elif filename_lower.endswith(".epub"):
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
    except Exception:
        logger.exception("Failed to parse uploaded file")
        raise HTTPException(status_code=422, detail="Could not parse uploaded file")

    chapters = parsed["chapters"]
    if not chapters:
        raise HTTPException(
            status_code=422,
            detail="No chapters could be detected. The file appears to be empty or contains no readable text.",
        )
    title = ((parsed["title"] or "").strip() or "Untitled")[:500]
    author = ((parsed["author"] or "").strip() or "Unknown")[:200]
    book_id = await _save_upload_book(
        user_id=user["id"],
        title=title,
        author=author,
        filename=filename,
        file_size=len(file_bytes),
        fmt=fmt,
        draft_chapters=chapters,
        max_books=max_books,
    )

    return {
        "book_id": book_id,
        "title": title,
        "author": author,
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
    """Return the user's upload quota usage. max is null for admins (no limit)."""
    count = await _user_upload_count(user["id"])
    max_books = None if user.get("role") == "admin" else MAX_BOOKS_PER_USER
    return {"used": count, "max": max_books}


@router.get("/{book_id}/chapters/draft")
async def get_draft_chapters(book_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    """Return the draft chapter list for an uploaded book pending confirmation."""
    async with aiosqlite.connect(_db.DB_PATH) as db:
        async with db.execute(
            "SELECT owner_user_id, source FROM books WHERE id=?", (book_id,)
        ) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Book not found")
    if row[1] != "upload":
        raise HTTPException(status_code=400, detail="Not an uploaded book")
    if row[0] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not your book")

    draft_rows = await get_user_book_chapters(book_id, include_drafts=True)
    if not draft_rows or all(r["is_draft"] == 0 for r in draft_rows):
        raise HTTPException(status_code=400, detail="Book already confirmed")

    return {
        "chapters": [
            {
                "index": i,
                "chapter_index": r["chapter_index"],
                "title": r["title"],
                "text": r["text"] or "",
                "preview": (r["text"] or "")[:300].strip(),
                "word_count": len((r["text"] or "").split()),
                "reviewed": bool(r["reviewed"]),
            }
            for i, r in enumerate(draft_rows)
            if r["is_draft"] == 1
        ]
    }


class ConfirmChapterSpec(BaseModel):
    title: str = Field(default="", max_length=500)
    original_index: int | None = Field(default=None, ge=0)
    index: int | None = Field(default=None, ge=0)


class ConfirmChaptersBody(BaseModel):
    chapters: list[ConfirmChapterSpec] = Field(..., max_length=1000)


@router.post("/{book_id}/chapters/confirm")
async def confirm_chapters(
    body: ConfirmChaptersBody,
    book_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    """Confirm chapter splits for an uploaded book. Replaces draft rows with confirmed rows."""
    if not body.chapters:
        raise HTTPException(status_code=400, detail="chapters list cannot be empty")

    async with aiosqlite.connect(_db.DB_PATH) as db:
        # BEGIN IMMEDIATE acquires a write reservation immediately so a second
        # concurrent confirm cannot read is_draft=1 after this connection has
        # written is_draft=0 (#451).
        await db.execute("BEGIN IMMEDIATE")
        async with db.execute(
            "SELECT owner_user_id, source FROM books WHERE id=?", (book_id,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            await db.execute("ROLLBACK")
            raise HTTPException(status_code=404, detail="Book not found")
        if row[1] != "upload":
            await db.execute("ROLLBACK")
            raise HTTPException(status_code=400, detail="Not an uploaded book")
        if row[0] != user["id"] and user.get("role") != "admin":
            await db.execute("ROLLBACK")
            raise HTTPException(status_code=403, detail="Not your book")

        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT chapter_index, title, text, is_draft FROM user_book_chapters "
            "WHERE book_id=? ORDER BY chapter_index",
            (book_id,),
        ) as cur:
            orig_rows = [dict(r) for r in await cur.fetchall()]

        if not any(r["is_draft"] == 1 for r in orig_rows):
            await db.execute("ROLLBACK")
            raise HTTPException(status_code=400, detail="Book already confirmed")

        orig_by_idx = {r["chapter_index"]: r for r in orig_rows}

        final_chapters: list[dict] = []
        for ch_spec in body.chapters:
            orig_idx = ch_spec.original_index if ch_spec.original_index is not None else ch_spec.index
            title = (ch_spec.title or "").strip() or f"Chapter {len(final_chapters) + 1}"
            if orig_idx is not None and orig_idx in orig_by_idx:
                text = orig_by_idx[orig_idx]["text"] or ""
            else:
                text = ""
            final_chapters.append({"title": title, "text": text})

        # Replace the draft rows atomically: delete + reinsert as confirmed.
        await db.execute("DELETE FROM user_book_chapters WHERE book_id=?", (book_id,))
        await db.executemany(
            """INSERT INTO user_book_chapters (book_id, chapter_index, title, text, is_draft)
               VALUES (?, ?, ?, ?, 0)""",
            [(book_id, i, ch["title"], ch["text"]) for i, ch in enumerate(final_chapters)],
        )

        # Fossilize. Annotations anchor to chapter_index, so a split that can still
        # move silently re-anchors them; confirming is the moment the reader says
        # this split is right, which is when to fix it.
        #
        # get_chapters routes any book with a book_freeze row to book_chapters, so
        # the frozen copy has to be written too — a freeze row alone would leave
        # the reader with an empty book.
        await db.execute("DELETE FROM book_chapters WHERE book_id=?", (book_id,))
        await db.executemany(
            "INSERT INTO book_chapters (book_id, chapter_index, title, text) VALUES (?, ?, ?, ?)",
            [(book_id, i, ch["title"], ch["text"]) for i, ch in enumerate(final_chapters)],
        )
        digest = hashlib.sha256(
            "\n\x00".join(f"{ch['title']}\x00{ch['text']}" for ch in final_chapters).encode("utf-8")
        ).hexdigest()
        # published_at stays NULL: an upload is private to its owner for good, and
        # list_audited_books excludes source='upload' anyway (belt and braces).
        await db.execute(
            """INSERT OR REPLACE INTO book_freeze
                   (book_id, splitter, chapter_source, frozen_at, audited_by,
                    content_sha256, published_at)
               VALUES (?, 'user_audit', 'upload', ?, ?, ?, NULL)""",
            (book_id, datetime.now(timezone.utc).isoformat(timespec="seconds"),
             str(user["id"]), digest),
        )
        await db.execute("COMMIT")

    # Invalidate any stale chapter-split cache from draft-state accesses.
    from services.book_chapters import clear_cache as _clear_chapter_cache
    _clear_chapter_cache(book_id)
    return {"ok": True, "chapter_count": len(final_chapters)}


class DraftMetaSpec(BaseModel):
    chapter_index: int = Field(..., ge=0)
    title: str | None = Field(default=None, max_length=500)
    reviewed: bool | None = None


class DraftMetaBody(BaseModel):
    chapters: list[DraftMetaSpec] = Field(..., max_length=2000)


class DraftChapterSpec(BaseModel):
    title: str = Field(default="", max_length=500)
    text: str = Field(default="")
    reviewed: bool = False


class DraftStructureBody(BaseModel):
    chapters: list[DraftChapterSpec] = Field(..., max_length=2000)


async def _owned_draft_book(book_id: int, user: dict) -> None:
    """Raise unless *user* may edit this uploaded book's draft chapters."""
    async with aiosqlite.connect(_db.DB_PATH) as db:
        async with db.execute(
            "SELECT owner_user_id, source FROM books WHERE id=?", (book_id,)
        ) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Book not found")
    if row[1] != "upload":
        raise HTTPException(status_code=400, detail="Not an uploaded book")
    if row[0] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not your book")


@router.patch("/{book_id}/chapters/draft")
async def patch_draft_chapters(
    body: DraftMetaBody,
    book_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    """Save titles and review ticks on a draft.

    The autosave path, fired on a debounce while the reader types, so it never
    carries chapter text — only a split or merge changes what text a chapter
    holds, and that goes through PUT. An unknown chapter_index is ignored rather
    than erroring: a stale tab should not be able to fail the whole save.
    """
    await _owned_draft_book(book_id, user)
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")

    async with aiosqlite.connect(_db.DB_PATH) as db:
        for spec in body.chapters:
            sets, params = [], []
            if spec.title is not None:
                sets.append("title = ?")
                params.append(spec.title.strip())
            if spec.reviewed is not None:
                sets.append("reviewed = ?")
                params.append(1 if spec.reviewed else 0)
            if not sets:
                continue
            sets.append("updated_at = ?")
            params.append(stamp)
            params.extend([book_id, spec.chapter_index])
            await db.execute(
                f"UPDATE user_book_chapters SET {', '.join(sets)}"
                " WHERE book_id = ? AND chapter_index = ? AND is_draft = 1",
                params,
            )
        await db.commit()
    return {"ok": True, "updated_at": stamp}


@router.put("/{book_id}/chapters/draft")
async def put_draft_chapters(
    body: DraftStructureBody,
    book_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    """Replace the whole draft structure, text included.

    Used after a split or merge — the only edits that move text between
    chapters. Rows stay drafts: this is an autosave, not a confirmation.
    """
    if not body.chapters:
        raise HTTPException(status_code=400, detail="chapters list cannot be empty")
    await _owned_draft_book(book_id, user)
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")

    async with aiosqlite.connect(_db.DB_PATH) as db:
        # BEGIN IMMEDIATE for the same reason confirm_chapters uses it (#451):
        # a concurrent writer must not interleave with the delete + reinsert.
        await db.execute("BEGIN IMMEDIATE")
        await db.execute(
            "DELETE FROM user_book_chapters WHERE book_id=? AND is_draft=1", (book_id,)
        )
        await db.executemany(
            """INSERT INTO user_book_chapters
                   (book_id, chapter_index, title, text, is_draft, reviewed, updated_at)
               VALUES (?, ?, ?, ?, 1, ?, ?)""",
            [
                (book_id, i, c.title.strip(), c.text, 1 if c.reviewed else 0, stamp)
                for i, c in enumerate(body.chapters)
            ],
        )
        await db.execute("COMMIT")

    from services.book_chapters import clear_cache as _clear_chapter_cache
    _clear_chapter_cache(book_id)
    return {"ok": True, "chapter_count": len(body.chapters), "updated_at": stamp}


@router.get("/uploads/mine")
async def list_my_uploads(user: dict = Depends(get_current_user)):
    """Ids of books this reader uploaded themselves.

    The shelf is built from localStorage, so it cannot tell whose book is whose —
    entries saved before `source` was recorded have no marker at all. Asking the
    server is reliable for every entry, old or new.
    """
    async with aiosqlite.connect(_db.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, title FROM books WHERE source = 'upload' AND owner_user_id = ?",
            (user["id"],),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.get("/uploads/drafts")
async def list_draft_audits(user: dict = Depends(get_current_user)):
    """Books this reader has started auditing but not yet finished.

    Feeds the "In progress" section of the bookshelf: how far in they got, and
    when they last touched it, most recent first.
    """
    async with aiosqlite.connect(_db.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT b.id AS book_id, b.title, b.authors,
                      COUNT(*) AS chapter_count,
                      SUM(c.reviewed) AS reviewed_count,
                      MAX(c.updated_at) AS updated_at
                 FROM user_book_chapters c
                 JOIN books b ON b.id = c.book_id
                WHERE c.is_draft = 1 AND b.owner_user_id = ?
             GROUP BY b.id
             ORDER BY MAX(c.updated_at) IS NULL, MAX(c.updated_at) DESC, b.id DESC""",
            (user["id"],),
        ) as cur:
            rows = await cur.fetchall()

    out = []
    for r in rows:
        d = dict(r)
        d["reviewed_count"] = int(d["reviewed_count"] or 0)
        try:
            d["authors"] = json.loads(d["authors"]) if isinstance(d["authors"], str) else (d["authors"] or [])
        except (ValueError, TypeError):
            d["authors"] = []
        out.append(d)
    return out


@router.delete("/upload/{book_id}")
async def delete_uploaded_book(book_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
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

        # translations.book_id and audio_cache.book_id carry declared FKs
        # (migration 033, #754 PR 3/4), so the DELETE FROM books below
        # cascades them automatically.
        await db.execute(
            "DELETE FROM translation_queue WHERE book_id=? AND status != 'running'",
            (book_id,),
        )
        await db.execute("DELETE FROM word_occurrences WHERE book_id=?", (book_id,))
        # Prune flashcard_reviews for vocabulary entries about to be orphaned,
        # then prune those vocabulary entries. FK enforcement is off so this
        # must be done manually before the vocabulary delete.
        await db.execute(
            "DELETE FROM flashcard_reviews WHERE vocabulary_id NOT IN "
            "(SELECT DISTINCT vocabulary_id FROM word_occurrences)"
        )
        await db.execute(
            "DELETE FROM vocabulary WHERE id NOT IN (SELECT DISTINCT vocabulary_id FROM word_occurrences)"
        )
        await db.execute("DELETE FROM annotations WHERE book_id=?", (book_id,))
        # book_insights.book_id and chapter_summaries.book_id carry declared
        # FKs (migration 032, #754 PR 2/4). The DELETE FROM books at the end
        # of this block cascades both tables automatically.
        await db.execute("DELETE FROM reading_history WHERE book_id=?", (book_id,))
        await db.execute("DELETE FROM user_reading_progress WHERE book_id=?", (book_id,))
        await db.execute("DELETE FROM user_book_chapters WHERE book_id=?", (book_id,))
        await db.execute("DELETE FROM book_uploads WHERE book_id=?", (book_id,))
        await db.execute("DELETE FROM books WHERE id=?", (book_id,))
        await db.commit()
    from services.book_chapters import clear_cache as _clear_chapter_cache
    _clear_chapter_cache(book_id)
    return {"ok": True}
