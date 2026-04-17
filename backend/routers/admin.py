"""
Admin-only endpoints for managing users, books, audio cache, and translations.
Full CRUD where applicable.
"""

import json
import aiosqlite
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth import get_current_user, decrypt_api_key, encrypt_api_key
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
    get_setting,
    set_setting,
)
from services.gutenberg import get_book_meta, get_book_text
from services.splitter import build_chapters
from services.translate import translate_text as do_translate
from services.translation_queue import (
    SETTING_API_KEY,
    SETTING_AUTO_LANGS,
    SETTING_ENABLED,
    SETTING_MAX_OUTPUT_TOKENS,
    SETTING_MODEL,
    SETTING_MODEL_CHAIN,
    SETTING_RPD,
    SETTING_RPM,
    estimate_queue_cost,
    get_model_chain,
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
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM books WHERE id = ?", (book_id,))
        await db.execute("DELETE FROM translations WHERE book_id = ?", (book_id,))
        await db.execute("DELETE FROM audio_cache WHERE book_id = ?", (book_id,))
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

    from services.book_chapters import split_with_html_preference
    chapters = await split_with_html_preference(book_id, book["text"])
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

    from services.book_chapters import split_with_html_preference
    chapters = await split_with_html_preference(book_id, book["text"])
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
            "requests_made": s.requests_made,
            "chapters_done": s.chapters_done,
            "chapters_failed": s.chapters_failed,
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
    api_key: str | None = None     # plaintext; empty string clears
    auto_translate_languages: list[str] | None = None
    rpm: int | None = None
    rpd: int | None = None
    model: str | None = None
    model_chain: list[str] | None = None
    max_output_tokens: int | None = None


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
            json.dumps([lang for lang in req.auto_translate_languages if lang]),
        )
    if req.rpm is not None:
        await set_setting(SETTING_RPM, str(req.rpm))
    if req.rpd is not None:
        await set_setting(SETTING_RPD, str(req.rpd))
    if req.model is not None:
        await set_setting(SETTING_MODEL, req.model)
    if req.model_chain is not None:
        # Keep the legacy single-model setting in sync with the chain head
        # so any code path still reading SETTING_MODEL stays consistent.
        await set_setting(SETTING_MODEL_CHAIN, json.dumps(req.model_chain))
        if req.model_chain:
            await set_setting(SETTING_MODEL, req.model_chain[0])
    if req.max_output_tokens is not None:
        await set_setting(SETTING_MAX_OUTPUT_TOKENS, str(req.max_output_tokens))
    queue_worker().wake()
    return {"ok": True}


@router.get("/queue/items")
async def queue_items(
    status: str | None = None,
    book_id: int | None = None,
    limit: int = 200,
    _admin: dict = Depends(_require_admin),
):
    return await list_queue(status=status, book_id=book_id, limit=limit)


class EnqueueBookRequest(BaseModel):
    book_id: int
    target_languages: list[str] | None = None
    priority: int = 50   # lower than default so admin enqueues jump the line
    reset_failed: bool = False


@router.post("/queue/enqueue-book")
async def queue_enqueue_book(
    req: EnqueueBookRequest,
    admin: dict = Depends(_require_admin),
):
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
    deleted = await delete_queue_item(item_id)
    return {"ok": True, "deleted": deleted}


@router.delete("/queue")
async def queue_clear(
    status: str | None = None,
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
    target_language: str | None = None,
    _admin: dict = Depends(_require_admin),
):
    deleted = await delete_queue_for_book(book_id, target_language=target_language)
    return {"ok": True, "deleted": deleted}


@router.post("/queue/items/{item_id}/retry")
async def queue_retry_item(
    item_id: int, _admin: dict = Depends(_require_admin),
):
    # Reset priority too — without this, a row that was bumped to the back
    # on failure would be retried but still sit behind everything else.
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """UPDATE translation_queue
               SET status='pending', attempts=0, last_error=NULL,
                   priority=100,
                   updated_at=CURRENT_TIMESTAMP
               WHERE id=?""",
            (item_id,),
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
