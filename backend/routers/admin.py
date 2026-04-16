"""
Admin-only endpoints for managing users, books, audio cache, and translations.
Full CRUD where applicable.
"""

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth import get_current_user, decrypt_api_key
from services.bulk_translate import manager as bulk_manager, plan_work, group_chapters_for_batch
from services.db import (
    DB_PATH,
    list_users,
    set_user_approved,
    set_user_role,
    delete_user,
    list_cached_books,
    get_cached_book,
    save_book,
    save_translation,
    delete_chapter_audio_cache,
)
from services.gutenberg import get_book_meta, get_book_text
from services.splitter import build_chapters
from services.translate import translate_text as do_translate

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency: require the user to be an approved admin."""
    if user.get("role") != "admin" or not user.get("approved"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ══════════════════════════════════════════════════════════════════════════════
# USERS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/users")
async def get_users(_admin: dict = Depends(_require_admin)):
    return await list_users()


class ApproveRequest(BaseModel):
    approved: bool


@router.put("/users/{user_id}/approve")
async def approve_user(user_id: int, req: ApproveRequest, _admin: dict = Depends(_require_admin)):
    await set_user_approved(user_id, req.approved)
    return {"ok": True}


class RoleRequest(BaseModel):
    role: str


@router.put("/users/{user_id}/role")
async def change_role(user_id: int, req: RoleRequest, admin: dict = Depends(_require_admin)):
    if req.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
    if user_id == admin["id"] and req.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    await set_user_role(user_id, req.role)
    return {"ok": True}


@router.delete("/users/{user_id}")
async def remove_user(user_id: int, admin: dict = Depends(_require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await delete_user(user_id)
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# BOOKS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/books")
async def get_books(_admin: dict = Depends(_require_admin)):
    """List all cached books with metadata + text length."""
    books = await list_cached_books()
    # Enrich with text size
    result = []
    for b in books:
        full = await get_cached_book(b["id"])
        text_len = len(full["text"]) if full and full.get("text") else 0
        result.append({
            **b,
            "text_length": text_len,
        })
    return result


class ImportBookRequest(BaseModel):
    book_id: int


@router.post("/books/import")
async def import_book(req: ImportBookRequest, _admin: dict = Depends(_require_admin)):
    """Import a book from Project Gutenberg by its ID. Downloads metadata + full text."""
    # Check if already cached
    existing = await get_cached_book(req.book_id)
    if existing and existing.get("text"):
        return {"ok": True, "status": "already_cached", "title": existing.get("title", "")}

    try:
        meta = await get_book_meta(req.book_id)
        text = await get_book_text(req.book_id)
        await save_book(req.book_id, meta, text)
        return {"ok": True, "status": "imported", "title": meta.get("title", ""), "text_length": len(text)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to import book {req.book_id}: {e}")


@router.delete("/books/{book_id}")
async def delete_book(book_id: int, _admin: dict = Depends(_require_admin)):
    """Delete a cached book and all its associated audio + translation cache."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM books WHERE id = ?", (book_id,))
        await db.execute("DELETE FROM translations WHERE book_id = ?", (book_id,))
        await db.execute("DELETE FROM audio_cache WHERE book_id = ?", (book_id,))
        await db.commit()
    return {"ok": True}


@router.get("/books/seed-popular-stream")
async def seed_popular_stream(_admin: dict = Depends(_require_admin)):
    """Download every book listed in popular_books.json into the DB.

    Streams progress via Server-Sent Events so the admin can see live status
    (which book is currently downloading, how many done vs total). Idempotent:
    books already in the DB are skipped. Safe to run on Railway — no API
    rate limits to worry about (Gutenberg is permissive).
    """
    import asyncio
    import json as _json
    import logging
    import os as _os
    from fastapi.responses import StreamingResponse

    log = logging.getLogger(__name__)

    manifest_path = _os.path.join(
        _os.path.dirname(__file__), "..", "popular_books.json",
    )
    if not _os.path.isfile(manifest_path):
        raise HTTPException(status_code=404, detail="popular_books.json not found")

    with open(manifest_path, encoding="utf-8") as f:
        manifest: list[dict] = _json.load(f)

    def _sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {_json.dumps(data)}\n\n"

    async def generator():
        try:
            # Compute which books still need fetching
            todo: list[dict] = []
            already = 0
            for book in manifest:
                existing = await get_cached_book(book["id"])
                if existing and existing.get("text"):
                    already += 1
                else:
                    todo.append(book)

            yield _sse("start", {
                "total": len(manifest),
                "to_download": len(todo),
                "already_cached": already,
            })

            downloaded = 0
            failed = 0

            for i, book in enumerate(todo, 1):
                yield _sse("progress", {
                    "current": i,
                    "total": len(todo),
                    "book_id": book["id"],
                    "title": book.get("title", ""),
                    "status": "downloading",
                })
                try:
                    meta = await get_book_meta(book["id"])
                    text = await get_book_text(book["id"])
                    await save_book(book["id"], meta, text)
                    downloaded += 1
                    yield _sse("progress", {
                        "current": i,
                        "total": len(todo),
                        "book_id": book["id"],
                        "title": meta.get("title", book.get("title", "")),
                        "status": "done",
                        "chars": len(text),
                    })
                except Exception as e:
                    failed += 1
                    log.exception("Seed failed for book %s", book["id"])
                    yield _sse("progress", {
                        "current": i,
                        "total": len(todo),
                        "book_id": book["id"],
                        "title": book.get("title", ""),
                        "status": "failed",
                        "error": str(e)[:200],
                    })
                # Brief pause to be polite to Gutenberg
                await asyncio.sleep(0.3)

            yield _sse("done", {
                "downloaded": downloaded,
                "failed": failed,
                "already_cached": already,
                "total": len(manifest),
            })

        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.exception("Seed stream crashed")
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ══════════════════════════════════════════════════════════════════════════════
# AUDIO CACHE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/audio")
async def get_audio_cache(_admin: dict = Depends(_require_admin)):
    """List audio cache entries grouped by book + chapter."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("""
            SELECT book_id, chapter_index, provider, voice,
                   COUNT(*) as chunks,
                   SUM(LENGTH(audio)) as total_bytes,
                   MIN(created_at) as created_at
            FROM audio_cache
            GROUP BY book_id, chapter_index, provider, voice
            ORDER BY book_id, chapter_index
        """) as cursor:
            rows = []
            async for row in cursor:
                rows.append({
                    "book_id": row[0],
                    "chapter_index": row[1],
                    "provider": row[2],
                    "voice": row[3],
                    "chunks": row[4],
                    "size_mb": round(row[5] / (1024 * 1024), 2),
                    "created_at": row[6],
                })
    return rows


@router.delete("/audio/{book_id}")
async def delete_book_audio(book_id: int, _admin: dict = Depends(_require_admin)):
    """Delete all audio cache for a book."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM audio_cache WHERE book_id = ?", (book_id,))
        await db.commit()
        return {"ok": True, "deleted": cursor.rowcount}


@router.delete("/audio/{book_id}/{chapter_index}")
async def delete_chapter_audio(book_id: int, chapter_index: int, _admin: dict = Depends(_require_admin)):
    """Delete audio cache for a specific chapter."""
    deleted = await delete_chapter_audio_cache(book_id, chapter_index)
    return {"ok": True, "deleted": deleted}


# ══════════════════════════════════════════════════════════════════════════════
# TRANSLATIONS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/translations")
async def get_translations(_admin: dict = Depends(_require_admin)):
    """List all cached translations."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("""
            SELECT book_id, chapter_index, target_language,
                   LENGTH(paragraphs) as size_chars,
                   created_at
            FROM translations
            ORDER BY book_id, chapter_index
        """) as cursor:
            rows = []
            async for row in cursor:
                rows.append({
                    "book_id": row[0],
                    "chapter_index": row[1],
                    "target_language": row[2],
                    "size_chars": row[3],
                    "created_at": row[4],
                })
    return rows


@router.delete("/translations/{book_id}")
async def delete_book_translations(book_id: int, _admin: dict = Depends(_require_admin)):
    """Delete all translations for a book."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM translations WHERE book_id = ?", (book_id,))
        await db.commit()
        return {"ok": True, "deleted": cursor.rowcount}


@router.delete("/translations/{book_id}/{chapter_index}/{target_language}")
async def delete_translation(
    book_id: int,
    chapter_index: int,
    target_language: str,
    _admin: dict = Depends(_require_admin),
):
    """Delete a specific cached translation."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM translations WHERE book_id=? AND chapter_index=? AND target_language=?",
            (book_id, chapter_index, target_language),
        )
        await db.commit()
        return {"ok": True, "deleted": cursor.rowcount}


@router.post("/translations/{book_id}/{chapter_index}/{target_language}/retranslate")
async def retranslate(
    book_id: int,
    chapter_index: int,
    target_language: str,
    admin: dict = Depends(_require_admin),
):
    """Delete cached translation and re-translate the chapter."""
    # 1. Get the book text
    book = await get_cached_book(book_id)
    if not book or not book.get("text"):
        raise HTTPException(status_code=404, detail="Book not found in cache")

    chapters = build_chapters(book["text"])
    if chapter_index < 0 or chapter_index >= len(chapters):
        raise HTTPException(status_code=400, detail=f"Chapter index {chapter_index} out of range (0–{len(chapters) - 1})")

    chapter_text = chapters[chapter_index].text

    # 2. Delete old cached translation
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM translations WHERE book_id=? AND chapter_index=? AND target_language=?",
            (book_id, chapter_index, target_language),
        )
        await db.commit()

    # 3. Detect source language from book metadata
    source_language = (book.get("languages") or ["en"])[0]

    # 4. Resolve provider — use admin's Gemini key if available, else Google
    raw_key = admin.get("gemini_key")
    decrypted_key: str | None = decrypt_api_key(raw_key) if raw_key else None
    provider = "gemini" if decrypted_key else "google"

    # 5. Translate
    try:
        paragraphs = await do_translate(
            chapter_text,
            source_language,
            target_language,
            provider=provider,
            gemini_key=decrypted_key,
        )
    except Exception:
        if provider == "gemini":
            paragraphs = await do_translate(
                chapter_text, source_language, target_language, provider="google",
            )
            provider = "google"
        else:
            raise

    # 6. Cache the new translation
    await save_translation(book_id, chapter_index, target_language, paragraphs)

    return {
        "ok": True,
        "provider": provider,
        "paragraphs_count": len(paragraphs),
    }


class BulkRetranslateRequest(BaseModel):
    target_language: str


@router.post("/translations/{book_id}/retranslate-all")
async def retranslate_all(
    book_id: int,
    req: BulkRetranslateRequest,
    admin: dict = Depends(_require_admin),
):
    """Delete and retranslate ALL chapters of a book for a target language."""
    book = await get_cached_book(book_id)
    if not book or not book.get("text"):
        raise HTTPException(status_code=404, detail="Book not found in cache")

    chapters = build_chapters(book["text"])
    source_language = (book.get("languages") or ["en"])[0]

    raw_key = admin.get("gemini_key")
    decrypted_key: str | None = decrypt_api_key(raw_key) if raw_key else None
    provider = "gemini" if decrypted_key else "google"

    # Delete all existing translations for this language
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM translations WHERE book_id=? AND target_language=?",
            (book_id, req.target_language),
        )
        await db.commit()

    results = []
    for i, ch in enumerate(chapters):
        try:
            paragraphs = await do_translate(
                ch.text, source_language, req.target_language,
                provider=provider, gemini_key=decrypted_key,
            )
        except Exception:
            if provider == "gemini":
                paragraphs = await do_translate(
                    ch.text, source_language, req.target_language, provider="google",
                )
            else:
                results.append({"chapter": i, "status": "failed"})
                continue
        await save_translation(book_id, i, req.target_language, paragraphs)
        results.append({"chapter": i, "status": "ok", "paragraphs": len(paragraphs)})

    return {"ok": True, "chapters": len(results), "results": results}


# ══════════════════════════════════════════════════════════════════════════════
# STATS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/stats")
async def stats(_admin: dict = Depends(_require_admin)):
    users = await list_users()
    books = await list_cached_books()

    audio_count = 0
    audio_bytes = 0
    translation_count = 0
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            async with db.execute("SELECT COUNT(*), COALESCE(SUM(LENGTH(audio)),0) FROM audio_cache") as cur:
                row = await cur.fetchone()
                audio_count = row[0]
                audio_bytes = row[1]
        except Exception:
            pass
        try:
            async with db.execute("SELECT COUNT(*) FROM translations") as cur:
                translation_count = (await cur.fetchone())[0]
        except Exception:
            pass

    return {
        "users_total": len(users),
        "users_approved": sum(1 for u in users if u.get("approved")),
        "users_pending": sum(1 for u in users if not u.get("approved")),
        "books_cached": len(books),
        "audio_chunks_cached": audio_count,
        "audio_cache_mb": round(audio_bytes / (1024 * 1024), 1),
        "translations_cached": translation_count,
    }


# ══════════════════════════════════════════════════════════════════════════════
# BULK TRANSLATION JOB
# ══════════════════════════════════════════════════════════════════════════════

class StartBulkTranslateRequest(BaseModel):
    target_language: str
    dry_run: bool = False
    rpm: int = 12
    rpd: int = 1400
    book_ids: list[int] | None = None
    model: str | None = None  # override the default Gemini model if specified


@router.post("/bulk-translate/plan")
async def bulk_translate_plan(
    req: StartBulkTranslateRequest,
    _admin: dict = Depends(_require_admin),
):
    """Dry-inspect: compute what a real run would do, without calling any API."""
    plans = await plan_work(req.target_language, book_ids=req.book_ids)
    total_chapters = sum(len(p.chapters) for p in plans)

    # Estimate batches (upper bound on requests)
    total_batches = 0
    total_words = 0
    for p in plans:
        batches = group_chapters_for_batch(p.chapters)
        total_batches += len(batches)
        total_words += sum(len(c.chapter_text.split()) for c in p.chapters)

    return {
        "total_books": len(plans),
        "total_chapters": total_chapters,
        "total_batches": total_batches,
        "total_words": total_words,
        "books": [
            {
                "id": p.book_id,
                "title": p.book_title,
                "source_language": p.source_language,
                "chapters_to_translate": len(p.chapters),
            }
            for p in plans
        ],
        # Rough time estimate at RPM and RPD limits
        "estimated_minutes_at_rpm": round(total_batches / max(1, req.rpm), 1),
        "estimated_days_at_rpd": round(total_batches / max(1, req.rpd), 2),
    }


@router.post("/bulk-translate/start")
async def bulk_translate_start(
    req: StartBulkTranslateRequest,
    admin: dict = Depends(_require_admin),
):
    """Kick off a background translation job using the admin's Gemini key.

    If dry_run=True, the first batch is translated for quality preview and
    nothing is saved to the DB.
    """
    raw_key = admin.get("gemini_key")
    if not raw_key:
        raise HTTPException(
            status_code=400,
            detail="Bulk translation requires a Gemini API key on the admin account",
        )
    api_key = decrypt_api_key(raw_key)

    try:
        kwargs: dict = dict(
            target_language=req.target_language,
            api_key=api_key,
            rpm=req.rpm,
            rpd=req.rpd,
            dry_run=req.dry_run,
            book_ids=req.book_ids,
        )
        if req.model:
            kwargs["model"] = req.model
        state = await bulk_manager().start(**kwargs)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return {"id": state.id, "status": state.status, "dry_run": state.dry_run}


@router.post("/bulk-translate/stop")
async def bulk_translate_stop(_admin: dict = Depends(_require_admin)):
    await bulk_manager().stop()
    return {"ok": True}


@router.get("/bulk-translate/status")
async def bulk_translate_status(_admin: dict = Depends(_require_admin)):
    """Return the most recent job's live state + running flag."""
    state = await bulk_manager().status()
    running = bulk_manager().is_running()
    if not state:
        return {"running": False, "state": None}
    return {
        "running": running,
        "state": {
            "id": state.id,
            "status": state.status,
            "target_language": state.target_language,
            "provider": state.provider,
            "model": state.model,
            "dry_run": state.dry_run,
            "total_chapters": state.total_chapters,
            "completed_chapters": state.completed_chapters,
            "failed_chapters": state.failed_chapters,
            "skipped_chapters": state.skipped_chapters,
            "requests_made": state.requests_made,
            "current_book_id": state.current_book_id,
            "current_book_title": state.current_book_title,
            "current_chapter_index": state.current_chapter_index,
            "last_error": state.last_error,
            "started_at": state.started_at,
            "ended_at": state.ended_at,
        },
        "preview": bulk_manager().preview(),
    }


@router.get("/bulk-translate/history")
async def bulk_translate_history(_admin: dict = Depends(_require_admin)):
    """List past and current bulk-translate runs, newest first."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT id, status, target_language, provider, model, dry_run,
                      total_chapters, completed_chapters, failed_chapters,
                      started_at, ended_at
               FROM bulk_translation_jobs ORDER BY id DESC LIMIT 50"""
        ) as cursor:
            rows = [dict(row) async for row in cursor]
    for r in rows:
        r["dry_run"] = bool(r["dry_run"])
    return rows
