"""
Admin-only endpoints for managing users, books, audio cache, and translations.
Full CRUD where applicable.
"""

import json
import aiosqlite
from typing import Annotated
from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from services.auth import get_current_user, decrypt_api_key, encrypt_api_key
from services.db import (
    DB_PATH,
    list_users,
    get_user_by_id,
    set_user_approved,
    set_user_role,
    delete_user,
    list_cached_books,
    get_cached_book,
    save_book,
    save_translation,
    get_setting,
    set_setting,
)
from services.gemini import translate_chapters_batch, TRANSLATOR_MODEL
from services.gutenberg import get_book_meta, get_book_text
from services.model_limits import limits_for
from services.splitter import build_chapters
from services.translate import translate_text as do_translate
from services.translation_queue import (
    DEFAULT_MAX_OUTPUT_TOKENS,
    DEFAULT_RPD,
    DEFAULT_RPM,
    SETTING_API_KEY,
    SETTING_AUTO_LANGS,
    SETTING_ENABLED,
    SETTING_MAX_OUTPUT_TOKENS,
    SETTING_MODEL,
    SETTING_MODEL_CHAIN,
    SETTING_RPD,
    SETTING_RPM,
    ChapterWork,
    estimate_queue_cost,
    get_model_chain,
    group_chapters_for_batch,
    plan_work_for_queue,
    clear_queue,
    delete_queue_for_book,
    delete_queue_item,
    enqueue_for_book,
    get_auto_languages,
    list_queue,
    queue_summary,
    worker as queue_worker,
)

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
    if not await get_user_by_id(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    await set_user_approved(user_id, req.approved)
    return {"ok": True}


class RoleRequest(BaseModel):
    role: str = Field(..., max_length=10)


@router.put("/users/{user_id}/role")
async def change_role(user_id: int, req: RoleRequest, admin: dict = Depends(_require_admin)):
    if req.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
    if user_id == admin["id"] and req.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    if not await get_user_by_id(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    await set_user_role(user_id, req.role)
    return {"ok": True}


@router.delete("/users/{user_id}")
async def remove_user(user_id: int, admin: dict = Depends(_require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if not await get_user_by_id(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    await delete_user(user_id)
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# BOOKS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/books")
async def get_books(_admin: dict = Depends(_require_admin)):
    """List all cached books with rich stats for the admin UI.

    Per-book payload:
    - `text_length`, `word_count`, `chapter_count` — size stats.
    - `translations`: map of `target_language → {chapters, size_chars}`.
    - `queue`: map of `target_language → {pending, running, done, failed, ...}`
      so the UI can show progress bars / status badges live.
    """
    books = await list_cached_books()

    async with aiosqlite.connect(DB_PATH) as db:
        # Translation stats grouped per (book, language)
        async with db.execute(
            """SELECT book_id, target_language,
                      COUNT(*) AS chapters,
                      SUM(LENGTH(paragraphs)) AS size_chars
               FROM translations
               GROUP BY book_id, target_language"""
        ) as cursor:
            trans_rows = await cursor.fetchall()

        # Live queue stats grouped per (book, language, status)
        async with db.execute(
            """SELECT book_id, target_language, status, COUNT(*) AS n
               FROM translation_queue
               GROUP BY book_id, target_language, status"""
        ) as cursor:
            queue_rows = await cursor.fetchall()

    translations: dict[int, dict[str, dict]] = {}
    for book_id, lang, chapters, size_chars in trans_rows:
        translations.setdefault(book_id, {})[lang] = {
            "chapters": chapters,
            "size_chars": size_chars or 0,
        }

    queue_by_book: dict[int, dict[str, dict[str, int]]] = {}
    for book_id, lang, status, n in queue_rows:
        queue_by_book.setdefault(book_id, {}).setdefault(lang, {})[status] = n

    # Currently active (book, lang) from worker state — used by the UI to
    # show a "working now" glow on the right row.
    worker_state = queue_worker().state()
    current = None
    if worker_state.current_book_id:
        current = {
            "book_id": worker_state.current_book_id,
            "target_language": worker_state.current_target_language,
        }

    result = []
    for b in books:
        full = await get_cached_book(b["id"])
        text = full["text"] if full and full.get("text") else ""
        text_len = len(text)
        word_count = len(text.split()) if text else 0
        # Avoid re-splitting chapters on every /admin/books hit — it's
        # expensive for big books. The translations table gives us an
        # upper bound; splitting can be done on-demand per book elsewhere.
        result.append({
            **b,
            "text_length": text_len,
            "word_count": word_count,
            "translations": {
                lang: v["chapters"] for lang, v in translations.get(b["id"], {}).items()
            },
            "translation_stats": translations.get(b["id"], {}),
            "queue": queue_by_book.get(b["id"], {}),
            "active": bool(
                current and current["book_id"] == b["id"]
            ),
            "active_language": (
                current["target_language"]
                if current and current["book_id"] == b["id"]
                else None
            ),
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
    if not await get_cached_book(book_id):
        raise HTTPException(status_code=404, detail="Book not found")
    async with aiosqlite.connect(DB_PATH) as db:
        # Reject if any worker is running — deleting the queue row would cause
        # mark_queue_row_done() to no-op and the worker to discard its result. (#370)
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
        await db.execute("DELETE FROM user_book_chapters WHERE book_id = ?", (book_id,))
        await db.execute("DELETE FROM book_uploads WHERE book_id = ?", (book_id,))
        await db.execute("DELETE FROM books WHERE id = ?", (book_id,))
        await db.execute("DELETE FROM translations WHERE book_id = ?", (book_id,))
        await db.execute("DELETE FROM audio_cache WHERE book_id = ?", (book_id,))
        # SQL guard: skip running rows in case a job transitioned after the
        # Python check above (same pattern as delete_book_translations, #335).
        await db.execute(
            "DELETE FROM translation_queue WHERE book_id=? AND status != 'running'",
            (book_id,),
        )
        await db.execute("DELETE FROM word_occurrences WHERE book_id = ?", (book_id,))
        await db.execute(
            "DELETE FROM flashcard_reviews WHERE vocabulary_id NOT IN "
            "(SELECT DISTINCT vocabulary_id FROM word_occurrences)"
        )
        await db.execute(
            "DELETE FROM vocabulary WHERE id NOT IN (SELECT DISTINCT vocabulary_id FROM word_occurrences)"
        )
        await db.execute("DELETE FROM annotations WHERE book_id = ?", (book_id,))
        await db.execute("DELETE FROM book_insights WHERE book_id = ?", (book_id,))
        await db.execute("DELETE FROM chapter_summaries WHERE book_id = ?", (book_id,))
        await db.execute("DELETE FROM reading_history WHERE book_id = ?", (book_id,))
        await db.execute("DELETE FROM user_reading_progress WHERE book_id = ?", (book_id,))
        await db.commit()
    # Invalidate the in-memory chapter split so a future import of the same
    # id doesn't accidentally reuse stale chapter boundaries.
    from services.book_chapters import clear_cache as clear_chapter_cache
    clear_chapter_cache(book_id)
    return {"ok": True}


@router.post("/books/seed-popular/start")
async def seed_popular_start(_admin: dict = Depends(_require_admin)):
    """Kick off the seed-popular background job.

    Unlike an SSE stream, this endpoint returns immediately — the actual
    download work runs in a detached asyncio task so it survives admin
    navigation and connection drops. Poll /seed-popular/status for progress.
    """
    import os as _os
    from services.seed_popular import manager as seed_manager

    manifest_path = _os.path.join(
        _os.path.dirname(__file__), "..", "popular_books.json",
    )
    try:
        state = await seed_manager().start(manifest_path)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"ok": True, "status": state.status}


@router.post("/books/seed-popular/stop")
async def seed_popular_stop(_admin: dict = Depends(_require_admin)):
    from services.seed_popular import manager as seed_manager
    await seed_manager().stop()
    return {"ok": True}


@router.get("/books/seed-popular/status")
async def seed_popular_status(_admin: dict = Depends(_require_admin)):
    from services.seed_popular import manager as seed_manager
    mgr = seed_manager()
    state = mgr.state()
    return {
        "running": mgr.is_running(),
        "state": {
            "status": state.status,
            "total": state.total,
            "current": state.current,
            "downloaded": state.downloaded,
            "failed": state.failed,
            "already_cached": state.already_cached,
            "current_book_id": state.current_book_id,
            "current_book_title": state.current_book_title,
            "last_error": state.last_error,
            "started_at": state.started_at,
            "ended_at": state.ended_at,
            "log": list(state.log),
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# AUDIO CACHE (stubs — backend caching removed; endpoints kept for compatibility)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/audio")
async def get_audio_cache(_admin: dict = Depends(_require_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT book_id, chapter_index, chunk_index, provider, voice, "
            "content_type, LENGTH(audio) AS audio_bytes, created_at FROM audio_cache "
            "ORDER BY book_id, chapter_index, chunk_index"
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.delete("/audio/{book_id}")
async def delete_book_audio(book_id: int, _admin: dict = Depends(_require_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM audio_cache WHERE book_id=?", (book_id,))
        deleted = db.total_changes
        await db.commit()
    return {"ok": True, "deleted": deleted}


@router.delete("/audio/{book_id}/{chapter_index}")
async def delete_chapter_audio(book_id: int, chapter_index: int, _admin: dict = Depends(_require_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM audio_cache WHERE book_id=? AND chapter_index=?",
            (book_id, chapter_index),
        )
        deleted = db.total_changes
        await db.commit()
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
        # Reject if any worker is running — it would re-insert via INSERT OR REPLACE. (#338)
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
        cursor = await db.execute("DELETE FROM translations WHERE book_id = ?", (book_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="No translations found for this book")
        # Clear non-running queue rows so enqueue() can re-add chapters.
        # Running rows are left alone — the worker holds them. (#335)
        await db.execute(
            "DELETE FROM translation_queue WHERE book_id=? AND status != 'running'",
            (book_id,),
        )
        await db.commit()
    return {"ok": True, "deleted": cursor.rowcount}


@router.delete("/translations/{book_id}/{target_language}")
async def delete_language_translations(
    book_id: int,
    target_language: str = Path(..., max_length=20),
    _admin: dict = Depends(_require_admin),
):
    """Delete all cached translations for one language of a book."""
    target_language = target_language.lower().split("-")[0]
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT chapter_index FROM translation_queue "
            "WHERE book_id=? AND target_language=? AND status='running' LIMIT 1",
            (book_id, target_language),
        ) as cur:
            running = await cur.fetchone()
        if running:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"A translation job is currently running for chapter {running[0]}. "
                    "Wait for it to finish before deleting."
                ),
            )
        cursor = await db.execute(
            "DELETE FROM translations WHERE book_id=? AND target_language=?",
            (book_id, target_language),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="No translations found for this language")
        await db.execute(
            "DELETE FROM translation_queue "
            "WHERE book_id=? AND target_language=? AND status != 'running'",
            (book_id, target_language),
        )
        await db.commit()
    return {"ok": True, "deleted": cursor.rowcount}


@router.delete("/translations/{book_id}/{chapter_index}/{target_language}")
async def delete_translation(
    book_id: int,
    chapter_index: int,
    target_language: str = Path(..., max_length=20),
    _admin: dict = Depends(_require_admin),
):
    """Delete a specific cached translation."""
    target_language = target_language.lower().split("-")[0]
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT 1 FROM translation_queue "
            "WHERE book_id=? AND chapter_index=? AND target_language=? AND status='running'",
            (book_id, chapter_index, target_language),
        ) as cur:
            if await cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"A translation job is currently running for chapter {chapter_index}. "
                        "Wait for it to finish before deleting."
                    ),
                )
        cursor = await db.execute(
            "DELETE FROM translations WHERE book_id=? AND chapter_index=? AND target_language=?",
            (book_id, chapter_index, target_language),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Translation not found")
        await db.execute(
            "DELETE FROM translation_queue "
            "WHERE book_id=? AND chapter_index=? AND target_language=? AND status != 'running'",
            (book_id, chapter_index, target_language),
        )
        await db.commit()
    return {"ok": True, "deleted": cursor.rowcount}


@router.post("/translations/{book_id}/{chapter_index}/{target_language}/retranslate")
async def retranslate(
    book_id: int,
    chapter_index: int,
    target_language: str = Path(..., max_length=20),
    admin: dict = Depends(_require_admin),
):
    """Delete cached translation and re-translate the chapter."""
    target_language = target_language.lower().split("-")[0]
    # 1. Get the book text
    book = await get_cached_book(book_id)
    if not book or not book.get("text"):
        raise HTTPException(status_code=404, detail="Book not found in cache")

    from services.book_chapters import split_with_html_preference
    chapters = await split_with_html_preference(book_id, book["text"])
    if chapter_index < 0 or chapter_index >= len(chapters):
        raise HTTPException(status_code=400, detail=f"Chapter index {chapter_index} out of range (0–{len(chapters) - 1})")

    chapter_text = chapters[chapter_index].text

    # Reject if a queue worker is actively translating this chapter — the
    # worker's save_translation (INSERT OR REPLACE) would silently overwrite
    # whatever we write here. (#333)
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT 1 FROM translation_queue "
            "WHERE book_id=? AND chapter_index=? AND target_language=? AND status='running'",
            (book_id, chapter_index, target_language),
        ) as cur:
            if await cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"A translation job is currently running for chapter {chapter_index}. "
                        "Wait for it to finish before retranslating."
                    ),
                )

    # 2. Detect source language from book metadata
    source_language = (book.get("languages") or ["en"])[0]

    # 3. Resolve provider — use admin's Gemini key if available, else Google
    raw_key = admin.get("gemini_key")
    try:
        decrypted_key: str | None = decrypt_api_key(raw_key) if raw_key else None
    except HTTPException:
        decrypted_key = None  # corrupted key → fall back to Google
    provider = "gemini" if decrypted_key else "google"

    # 4. Translate
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

    # 5. Cache the new translation
    await save_translation(book_id, chapter_index, target_language, paragraphs)

    return {
        "ok": True,
        "provider": provider,
        "paragraphs_count": len(paragraphs),
    }


class BulkRetranslateRequest(BaseModel):
    target_language: str = Field(..., max_length=20)


class ImportTranslationEntry(BaseModel):
    book_id: int
    chapter_index: int
    target_language: str = Field(..., max_length=20)
    paragraphs: list[Annotated[str, Field(max_length=50000)]] = Field(..., max_length=2000)
    provider: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=200)
    title_translation: str | None = Field(default=None, max_length=500)


class ImportTranslationsRequest(BaseModel):
    entries: list[ImportTranslationEntry] = Field(..., max_length=5000)


@router.post("/translations/import")
async def import_translations(
    req: ImportTranslationsRequest,
    _admin: dict = Depends(_require_admin),
):
    """Bulk-import pre-translated chapters from an offline run.

    Companion to `scripts/translate_book.py` and `scripts/seed_translations.py`:
    you translate a book locally (paying once on a dev machine), export
    the rows to JSON, then POST them here to seed prod without paying
    for Gemini a second time.

    Overwrites existing cache entries — safer than silently skipping,
    since the whole point of seeding is usually to replace bad
    translations. Skips empty paragraphs arrays.
    """
    # Pre-validate all referenced books exist before writing any row.
    book_ids = {e.book_id for e in req.entries if e.paragraphs}
    for bid in book_ids:
        if not await get_cached_book(bid):
            raise HTTPException(status_code=404, detail=f"Book {bid} not found")

    # Pre-check: reject if any chapter to be imported has a running queue job.
    # The worker uses INSERT OR REPLACE and would overwrite the imported translation
    # when it finishes — same race as retranslate (#334) and PUT /translate/cache (#341).
    from services.translation_queue import queue_status_for_chapter
    for entry in req.entries:
        if not entry.paragraphs:
            continue
        lang = entry.target_language.lower().split("-")[0]
        status = await queue_status_for_chapter(entry.book_id, entry.chapter_index, lang)
        if status["status"] == "running":
            raise HTTPException(
                status_code=409,
                detail=(
                    f"A translation job is currently running for book {entry.book_id} "
                    f"chapter {entry.chapter_index} ({lang}). "
                    "Wait for it to finish before importing."
                ),
            )

    count = 0
    for entry in req.entries:
        if not entry.paragraphs:
            continue
        await save_translation(
            entry.book_id,
            entry.chapter_index,
            entry.target_language.lower().split("-")[0],
            entry.paragraphs,
            provider=entry.provider,
            model=entry.model,
            title_translation=entry.title_translation,
        )
        count += 1
    return {"ok": True, "imported": count}


@router.post("/translations/{book_id}/retranslate-all")
async def retranslate_all(
    book_id: int,
    req: BulkRetranslateRequest,
    admin: dict = Depends(_require_admin),
):
    """Retranslate ALL chapters of a book for a target language.

    save_translation uses INSERT OR REPLACE, so each successful chapter
    overwrites the old row atomically. Old translations survive if their
    chapter fails — no upfront DELETE needed.
    """
    target_language = req.target_language.lower().split("-")[0]
    book = await get_cached_book(book_id)
    if not book or not book.get("text"):
        raise HTTPException(status_code=404, detail="Book not found in cache")

    from services.book_chapters import split_with_html_preference
    chapters = await split_with_html_preference(book_id, book["text"])
    source_language = (book.get("languages") or ["en"])[0]

    # Pre-check: reject before translating any chapter if any have a running
    # queue job. The worker would overwrite whatever we write. (#333)
    chapter_indices = list(range(len(chapters)))
    async with aiosqlite.connect(DB_PATH) as db:
        placeholders = ",".join("?" * len(chapter_indices))
        async with db.execute(
            f"SELECT chapter_index FROM translation_queue "
            f"WHERE book_id=? AND target_language=? AND status='running' "
            f"AND chapter_index IN ({placeholders})",
            [book_id, target_language, *chapter_indices],
        ) as cur:
            running = [row[0] for row in await cur.fetchall()]
    if running:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Translation job(s) currently running for chapter(s) {sorted(running)}. "
                "Wait for them to finish before retranslating."
            ),
        )

    raw_key = admin.get("gemini_key")
    try:
        decrypted_key: str | None = decrypt_api_key(raw_key) if raw_key else None
    except HTTPException:
        decrypted_key = None  # corrupted key → fall back to Google
    provider = "gemini" if decrypted_key else "google"

    results = []
    for i, ch in enumerate(chapters):
        try:
            paragraphs = await do_translate(
                ch.text, source_language, target_language,
                provider=provider, gemini_key=decrypted_key,
            )
        except Exception:
            if provider == "gemini":
                paragraphs = await do_translate(
                    ch.text, source_language, target_language, provider="google",
                )
            else:
                results.append({"chapter": i, "status": "failed"})
                continue
        await save_translation(book_id, i, target_language, paragraphs)
        results.append({"chapter": i, "status": "ok", "paragraphs": len(paragraphs)})

    return {"ok": True, "chapters": len(results), "results": results}


class MoveTranslationRequest(BaseModel):
    new_chapter_index: int


@router.post("/translations/{book_id}/{chapter_index}/{target_language}/move")
async def move_translation(
    book_id: int,
    chapter_index: int,
    target_language: str = Path(..., max_length=20),
    req: MoveTranslationRequest = Body(...),
    _admin: dict = Depends(_require_admin),
):
    """Reassign a cached translation to a different chapter_index.

    Use case: when the splitter indices change (PR #107 HTML/text
    realignment), existing cached translations are at the wrong slot.
    Rather than burn tokens re-translating, admins can shift each cached
    translation to the chapter_index that now matches the source content.

    Rejects with 409 if the target slot already has a translation —
    the admin must delete it first. Rejects with 400 on out-of-range
    indices. Clears any pending/failed queue row at the destination so
    the worker doesn't later overwrite the moved translation.
    """
    target_language = target_language.lower().split("-")[0]
    book = await get_cached_book(book_id)
    if not book or not book.get("text"):
        raise HTTPException(status_code=404, detail="Book not found in cache")

    from services.book_chapters import split_with_html_preference
    chapters = await split_with_html_preference(book_id, book["text"])
    new_idx = req.new_chapter_index
    if new_idx < 0 or new_idx >= len(chapters):
        raise HTTPException(
            status_code=400,
            detail=f"new_chapter_index {new_idx} out of range (0-{len(chapters) - 1})",
        )
    if new_idx == chapter_index:
        raise HTTPException(
            status_code=400, detail="new_chapter_index is the same as the source",
        )

    async with aiosqlite.connect(DB_PATH) as db:
        # Source exists?
        async with db.execute(
            "SELECT 1 FROM translations "
            "WHERE book_id=? AND chapter_index=? AND target_language=?",
            (book_id, chapter_index, target_language),
        ) as cursor:
            if await cursor.fetchone() is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"No translation at chapter {chapter_index} "
                        f"for book {book_id} / {target_language}"
                    ),
                )
        # Target slot must be empty — safer than silently overwriting.
        async with db.execute(
            "SELECT 1 FROM translations "
            "WHERE book_id=? AND chapter_index=? AND target_language=?",
            (book_id, new_idx, target_language),
        ) as cursor:
            if await cursor.fetchone() is not None:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Chapter {new_idx} already has a {target_language} translation. "
                        "Delete it first, then retry the move."
                    ),
                )
        # Reject if the destination chapter's queue row is running: the worker
        # will save a new translation that would silently overwrite the move.
        async with db.execute(
            "SELECT 1 FROM translation_queue "
            "WHERE book_id=? AND chapter_index=? AND target_language=? AND status='running'",
            (book_id, new_idx, target_language),
        ) as cursor:
            if await cursor.fetchone() is not None:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Chapter {new_idx} is currently being translated. "
                        "Wait for it to finish, then retry the move."
                    ),
                )
        await db.execute(
            "UPDATE translations "
            "SET chapter_index=? "
            "WHERE book_id=? AND chapter_index=? AND target_language=?",
            (new_idx, book_id, chapter_index, target_language),
        )
        # A queue row at the destination (pending/failed) would let the worker
        # later translate over the top. Clear it — the move means we're
        # asserting this chapter is now done. Running rows are already rejected
        # above, so only non-running rows can remain here.
        await db.execute(
            "DELETE FROM translation_queue "
            "WHERE book_id=? AND chapter_index=? AND target_language=? AND status != 'running'",
            (book_id, new_idx, target_language),
        )
        await db.commit()

    return {"ok": True, "from": chapter_index, "to": new_idx}


# ══════════════════════════════════════════════════════════════════════════════
# STATS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/stats")
async def stats(_admin: dict = Depends(_require_admin)):
    users = await list_users()
    books = await list_cached_books()

    translation_count = 0
    audio_chunks = 0
    audio_mb: float = 0.0
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            async with db.execute("SELECT COUNT(*) FROM translations") as cur:
                translation_count = (await cur.fetchone())[0]
        except Exception:
            pass
        try:
            async with db.execute(
                "SELECT COUNT(*), COALESCE(SUM(LENGTH(audio)), 0) FROM audio_cache"
            ) as cur:
                row = await cur.fetchone()
                audio_chunks = row[0]
                audio_mb = round(row[1] / 1_048_576, 2)
        except Exception:
            pass

    return {
        "users_total": len(users),
        "users_approved": sum(1 for u in users if u.get("approved")),
        "users_pending": sum(1 for u in users if not u.get("approved")),
        "books_cached": len(books),
        "translations_cached": translation_count,
        "audio_chunks_cached": audio_chunks,
        "audio_cache_mb": audio_mb,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ALWAYS-ON TRANSLATION QUEUE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/queue/status")
async def queue_status(_admin: dict = Depends(_require_admin)):
    """Snapshot of the queue worker + overall queue counts."""
    w = queue_worker()
    s = w.state()
    summary = await queue_summary()
    return {
        "running": w.is_running(),
        "state": {
            "enabled": s.enabled,
            "idle": s.idle,
            "current_book_id": s.current_book_id,
            "current_book_title": s.current_book_title,
            "current_target_language": s.current_target_language,
            "current_batch_size": s.current_batch_size,
            "current_model": s.current_model,
            "startup_phase": s.startup_phase,
            "startup_progress": s.startup_progress,
            "last_completed_at": s.last_completed_at,
            "last_error": s.last_error,
            "started_at": s.started_at,
            "ended_at": s.ended_at,
            "requests_made": s.requests_made,
            "chapters_done": s.chapters_done,
            "chapters_failed": s.chapters_failed,
            "total_chapters": s.total_chapters,
            "skipped_chapters": s.skipped_chapters,
            "waiting_reason": s.waiting_reason,
            "retry_attempt": s.retry_attempt,
            "retry_max": s.retry_max,
            "retry_delay_seconds": s.retry_delay_seconds,
            "retry_next_at": s.retry_next_at,
            "retry_reason": s.retry_reason,
            "log": list(s.log),
        },
        "counts": summary["counts"],
    }


@router.post("/queue/start")
async def queue_start(_admin: dict = Depends(_require_admin)):
    await queue_worker().start()
    return {"ok": True}


@router.post("/queue/stop")
async def queue_stop(_admin: dict = Depends(_require_admin)):
    await queue_worker().stop()
    return {"ok": True}


class QueuePlanRequest(BaseModel):
    target_language: str = Field(..., max_length=20)
    book_ids: list[int] | None = None


@router.post("/queue/plan")
async def queue_plan(req: QueuePlanRequest, _admin: dict = Depends(_require_admin)):
    """Compute how many chapters still need translation without touching the queue."""
    target_language = req.target_language.lower().split("-")[0]
    plans = await plan_work_for_queue(target_language, book_ids=req.book_ids)
    total_chapters = sum(len(p["chapters"]) for p in plans)
    total_batches = 0
    total_words = 0
    for p in plans:
        batches = group_chapters_for_batch(p["chapters"])
        total_batches += len(batches)
        total_words += sum(len(c.chapter_text.split()) for c in p["chapters"])
    rpm_raw = await get_setting(SETTING_RPM)
    rpd_raw = await get_setting(SETTING_RPD)
    rpm = int(rpm_raw) if rpm_raw else DEFAULT_RPM
    rpd = int(rpd_raw) if rpd_raw else DEFAULT_RPD
    return {
        "total_books": len(plans),
        "total_chapters": total_chapters,
        "total_batches": total_batches,
        "total_words": total_words,
        "estimated_minutes_at_rpm": round(total_batches / max(1, rpm), 1),
        "estimated_days_at_rpd": round(total_batches / max(1, rpd), 2),
        "books": [
            {
                "id": p["book_id"],
                "title": p["book_title"],
                "source_language": p["source_language"],
                "chapters_to_translate": len(p["chapters"]),
            }
            for p in plans
        ],
    }


@router.post("/queue/dry-run")
async def queue_dry_run(req: QueuePlanRequest, _admin: dict = Depends(_require_admin)):
    """Translate the first batch of the first untranslated book without saving.

    Uses the queue's configured API key and model chain so the preview
    reflects exactly the quality the live worker would produce.
    """
    target_language = req.target_language.lower().split("-")[0]
    encrypted = await get_setting(SETTING_API_KEY)
    if not encrypted:
        raise HTTPException(status_code=400, detail="No Gemini API key configured in queue settings")
    try:
        api_key = decrypt_api_key(encrypted)
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to decrypt queue API key")

    plans = await plan_work_for_queue(target_language, book_ids=req.book_ids)
    if not plans:
        return {"preview": {}, "total_chapters": 0, "total_books": 0}

    total_chapters = sum(len(p["chapters"]) for p in plans)
    chain = await get_model_chain()
    max_output_tokens = max(
        (limits_for(m)["max_output_tokens"] for m in chain),
        default=DEFAULT_MAX_OUTPUT_TOKENS,
    )

    first_plan = plans[0]
    batches = group_chapters_for_batch(first_plan["chapters"], max_output_tokens=max_output_tokens)
    if not batches:
        return {"preview": {}, "total_chapters": total_chapters, "total_books": len(plans)}

    first_batch = batches[0]
    chapters = [(c.chapter_index, c.chapter_text) for c in first_batch]
    try:
        translations = await translate_chapters_batch(
            api_key, chapters,
            first_plan["source_language"], target_language,
            model=chain[0] or TRANSLATOR_MODEL,
            max_output_tokens=max_output_tokens,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {e}")

    return {
        "preview": translations,
        "total_chapters": total_chapters,
        "total_books": len(plans),
        "preview_book_title": first_plan["book_title"],
        "preview_chapter_count": len(first_batch),
    }


@router.get("/queue/settings")
async def queue_get_settings(_admin: dict = Depends(_require_admin)):
    enabled = await get_setting(SETTING_ENABLED)
    key = await get_setting(SETTING_API_KEY)
    langs = await get_auto_languages()
    rpm = await get_setting(SETTING_RPM)
    rpd = await get_setting(SETTING_RPD)
    model = await get_setting(SETTING_MODEL)
    max_tok = await get_setting(SETTING_MAX_OUTPUT_TOKENS)
    chain = await get_model_chain()
    return {
        "enabled": enabled != "0",
        "has_api_key": bool(key),
        "auto_translate_languages": langs,
        "rpm": int(rpm) if rpm else None,
        "rpd": int(rpd) if rpd else None,
        "model": model or None,
        "model_chain": chain,
        "max_output_tokens": int(max_tok) if max_tok else None,
    }


class QueueSettingsRequest(BaseModel):
    enabled: bool | None = None
    api_key: str | None = Field(default=None, max_length=500)
    auto_translate_languages: list[Annotated[str, Field(max_length=20)]] | None = Field(default=None, max_length=50)
    rpm: int | None = Field(default=None, ge=1)
    rpd: int | None = Field(default=None, ge=1)
    model: str | None = Field(default=None, max_length=200)
    model_chain: list[Annotated[str, Field(max_length=200)]] | None = Field(default=None, max_length=20)
    max_output_tokens: int | None = Field(default=None, ge=1)


@router.put("/queue/settings")
async def queue_set_settings(
    req: QueueSettingsRequest,
    _admin: dict = Depends(_require_admin),
):
    if req.enabled is not None:
        await set_setting(SETTING_ENABLED, "1" if req.enabled else "0")
    if req.api_key is not None:
        if req.api_key == "":
            await set_setting(SETTING_API_KEY, "")
        else:
            await set_setting(SETTING_API_KEY, encrypt_api_key(req.api_key))
    if req.auto_translate_languages is not None:
        await set_setting(
            SETTING_AUTO_LANGS,
            json.dumps([
                lang.strip().lower().split("-")[0]
                for lang in req.auto_translate_languages
                if lang and lang.strip()
            ]),
        )
    if req.rpm is not None:
        await set_setting(SETTING_RPM, str(req.rpm))
    if req.rpd is not None:
        await set_setting(SETTING_RPD, str(req.rpd))
    if req.model is not None:
        await set_setting(SETTING_MODEL, req.model)
    if req.model_chain is not None:
        if not req.model_chain:
            raise HTTPException(status_code=400, detail="model_chain cannot be empty")
        if any(not m.strip() for m in req.model_chain):
            raise HTTPException(status_code=400, detail="model_chain entries cannot be empty strings")
        # Keep the legacy single-model setting in sync with the chain head
        # so any code path still reading SETTING_MODEL stays consistent.
        await set_setting(SETTING_MODEL_CHAIN, json.dumps(req.model_chain))
        await set_setting(SETTING_MODEL, req.model_chain[0])
    if req.max_output_tokens is not None:
        await set_setting(SETTING_MAX_OUTPUT_TOKENS, str(req.max_output_tokens))
    queue_worker().wake()
    return {"ok": True}


@router.get("/queue/items")
async def queue_items(
    status: str | None = Query(default=None, max_length=20),
    book_id: int | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    _admin: dict = Depends(_require_admin),
):
    return await list_queue(status=status, book_id=book_id, limit=limit)


class EnqueueBookRequest(BaseModel):
    book_id: int
    target_languages: list[Annotated[str, Field(max_length=20)]] | None = Field(default=None, max_length=100)
    priority: int = 50   # lower than default so admin enqueues jump the line
    reset_failed: bool = False


@router.post("/queue/enqueue-book")
async def queue_enqueue_book(
    req: EnqueueBookRequest,
    admin: dict = Depends(_require_admin),
):
    book = await get_cached_book(req.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.get("source") == "upload":
        from services.db import count_draft_user_book_chapters
        if await count_draft_user_book_chapters(req.book_id) > 0:
            raise HTTPException(
                status_code=400,
                detail="Book has not been confirmed yet. Confirm chapter splits before enqueueing for translation.",
            )
    added = await enqueue_for_book(
        req.book_id,
        target_languages=req.target_languages,
        priority=req.priority,
        reset_failed=req.reset_failed,
        queued_by=admin.get("email") or admin.get("name") or f"admin#{admin.get('id')}",
    )
    queue_worker().wake()
    return {"ok": True, "enqueued": added}


@router.delete("/queue/items/{item_id}")
async def queue_delete_item(
    item_id: int, _admin: dict = Depends(_require_admin),
):
    # Reject deletion of running items: the worker will still save its result,
    # so silently "succeeding" here gives the admin a false sense of cancellation (#296).
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT status FROM translation_queue WHERE id=?", (item_id,)
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Queue item not found")
        if row["status"] == "running":
            raise HTTPException(
                status_code=409,
                detail="Cannot delete a running item; wait for it to finish or fail",
            )
        cursor = await db.execute(
            "DELETE FROM translation_queue WHERE id=? AND status != 'running'", (item_id,)
        )
        await db.commit()
    return {"ok": True, "deleted": cursor.rowcount}


@router.delete("/queue")
async def queue_clear(
    status: str | None = Query(default=None, max_length=20),
    _admin: dict = Depends(_require_admin),
):
    """Delete every queue row (optionally filtered by status).

    ?status=failed  → wipe just the failed rows (safe to retry clean).
    No filter       → clear the entire queue (admin confirms in the UI).
    """
    deleted = await clear_queue(status)
    return {"ok": True, "deleted": deleted}


@router.delete("/queue/book/{book_id}")
async def queue_delete_book(
    book_id: int,
    target_language: str | None = Query(default=None, max_length=20),
    _admin: dict = Depends(_require_admin),
):
    norm = target_language.lower().split("-")[0] if target_language else None
    deleted = await delete_queue_for_book(book_id, target_language=norm)
    return {"ok": True, "deleted": deleted}


@router.post("/queue/items/{item_id}/retry")
async def queue_retry_item(
    item_id: int, _admin: dict = Depends(_require_admin),
):
    # Reset priority too — without this, a row that was bumped to the back
    # on failure would be retried but still sit behind everything else.
    # Guard against retrying a running item: _mark_done() deletes rows by ID,
    # so resetting status='pending' while the worker holds the row as 'running'
    # would cause _mark_done() to silently delete the re-enqueued item (#294).
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT status FROM translation_queue WHERE id=?", (item_id,)
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Queue item not found")
        if row["status"] == "running":
            raise HTTPException(
                status_code=409,
                detail="Cannot retry a running item; wait for it to finish or fail",
            )
        cursor = await db.execute(
            """UPDATE translation_queue
               SET status='pending', attempts=0, last_error=NULL,
                   priority=100,
                   updated_at=CURRENT_TIMESTAMP
               WHERE id=? AND status != 'running'""",
            (item_id,),
        )
        await db.commit()
    queue_worker().wake()
    return {"ok": True, "updated": cursor.rowcount}


class RetryFailedRequest(BaseModel):
    book_id: int | None = None
    target_language: str | None = Field(default=None, max_length=20)


@router.post("/queue/retry-failed")
async def queue_retry_failed(
    req: RetryFailedRequest,
    _admin: dict = Depends(_require_admin),
):
    """Revive every failed queue row matching the filters.

    Shortcut for the admin books list's "Retry N failed" button when a
    book/language pair has a stack of failures. Without filters this retries
    every failed row in the whole queue.
    """
    clauses = ["status='failed'"]
    params: list[int | str] = []
    if req.book_id is not None:
        clauses.append("book_id=?")
        params.append(req.book_id)
    if req.target_language is not None:
        clauses.append("target_language=?")
        params.append(req.target_language.lower().split("-")[0])
    where = " AND ".join(clauses)
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            f"""UPDATE translation_queue
                   SET status='pending', attempts=0, last_error=NULL,
                       priority=100,
                       updated_at=CURRENT_TIMESTAMP
                   WHERE {where}""",
            params,
        )
        await db.commit()
    queue_worker().wake()
    return {"ok": True, "updated": cursor.rowcount}


@router.get("/queue/cost-estimate")
async def queue_cost_estimate(_admin: dict = Depends(_require_admin)):
    """Ballpark USD to drain every pending queue item, per model.

    Intended to help admins decide whether it's worth routing the queue
    through the frontier models vs. cheaper flash variants.
    """
    return await estimate_queue_cost()


@router.post("/queue/enqueue-all")
async def queue_enqueue_all(admin: dict = Depends(_require_admin)):
    """Walk every cached book and enqueue missing translations for all
    configured auto-translate languages."""
    langs = await get_auto_languages()
    if not langs:
        raise HTTPException(
            status_code=400,
            detail="No auto_translate_languages configured in queue settings",
        )
    books = await list_cached_books()
    by = admin.get("email") or admin.get("name") or f"admin#{admin.get('id')}"
    total = 0
    for b in books:
        total += await enqueue_for_book(b["id"], target_languages=langs, queued_by=by)
    queue_worker().wake()
    return {"ok": True, "enqueued": total, "books_scanned": len(books)}


@router.get("/uploads")
async def get_uploads(
    user_id: int | None = Query(default=None),
    _admin: dict = Depends(_require_admin),
):
    """Return all user-uploaded books with uploader information.

    Optionally filter by user_id.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if user_id is not None:
            async with db.execute(
                """
                SELECT bu.book_id, b.title, bu.filename, bu.file_size, bu.format,
                       bu.uploaded_at, u.email AS uploader_email, u.name AS uploader_name
                FROM book_uploads bu
                JOIN books b ON b.id = bu.book_id
                JOIN users u ON u.id = bu.user_id
                WHERE bu.user_id = ?
                ORDER BY bu.uploaded_at DESC
                """,
                (user_id,),
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute(
                """
                SELECT bu.book_id, b.title, bu.filename, bu.file_size, bu.format,
                       bu.uploaded_at, u.email AS uploader_email, u.name AS uploader_name
                FROM book_uploads bu
                JOIN books b ON b.id = bu.book_id
                JOIN users u ON u.id = bu.user_id
                ORDER BY bu.uploaded_at DESC
                """,
            ) as cursor:
                rows = await cursor.fetchall()
    return [dict(row) for row in rows]
