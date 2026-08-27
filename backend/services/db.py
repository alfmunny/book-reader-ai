"""
SQLite book cache.

Schema
------
books: id, title, authors (JSON), languages (JSON), subjects (JSON),
       download_count, cover, text, cached_at
"""

import json
from datetime import datetime, timezone
import os
import aiosqlite

# DB file location. In local dev, defaults to backend/books.db (relative to
# this file). In production (e.g. Railway), set DB_PATH to a path inside a
# persistent volume so the file survives container redeploys — otherwise
# every redeploy starts with an empty database. See README "Deployment".
DB_PATH = os.environ.get(
    "DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "books.db"),
)


# ── Global aiosqlite tuning for concurrent writes ────────────────────────────
#
# By default sqlite3.connect uses `timeout=5.0` as its busy_timeout. Under the
# always-on translation queue we have MANY overlapping writers:
#   - worker writing translations + queue updates + rate_limiter_usage
#   - admin PUT /queue/settings updating app_settings
#   - save_book auto-enqueueing
# A 5s window isn't always enough — admins were seeing
# "database is locked" 500s on /admin/queue/settings. We monkey-patch
# aiosqlite.connect to apply a 30-second busy timeout globally, which makes
# SQLite retry the busy writer instead of failing fast. Combined with WAL
# mode (set persistently in init_db), this eliminates the contention we
# actually see in practice.

_BUSY_TIMEOUT_ATTR = "_book_reader_ai_busy_timeout_patched"

if not getattr(aiosqlite.connect, _BUSY_TIMEOUT_ATTR, False):
    _original_aiosqlite_connect = aiosqlite.connect

    def _aiosqlite_connect_with_busy_timeout(database, **kwargs):
        kwargs.setdefault("timeout", 30)
        return _original_aiosqlite_connect(database, **kwargs)

    setattr(_aiosqlite_connect_with_busy_timeout, _BUSY_TIMEOUT_ATTR, True)
    aiosqlite.connect = _aiosqlite_connect_with_busy_timeout


# ── Per-connection FK enforcement (issue #700 / #748) ────────────────────────
#
# SQLite's PRAGMA foreign_keys is OFF by default AND must be set per
# connection. Without this hook every ON DELETE CASCADE in the schema is
# silent — a gap that caused three production cascade-cleanup bugs in April
# 2026 (#685, #691, #695). We patch aiosqlite.Connection.__aenter__ at the
# class level (instance-level patches are ignored by Python's dunder
# lookup) so every Connection issues PRAGMA foreign_keys = ON right after
# the backing sqlite3 connection is live.
#
# Migrations run under a separate FK-off window — see services/migrations.run.

_FK_ATTR = "_book_reader_ai_fk_patched"

if not getattr(aiosqlite.Connection, _FK_ATTR, False):
    _original_aenter = aiosqlite.Connection.__aenter__

    async def _aenter_with_fk(self):
        db = await _original_aenter(self)
        try:
            await db.execute("PRAGMA foreign_keys = ON")
        except Exception:
            # Never block connection open on pragma failure — log and continue.
            import logging
            logging.getLogger(__name__).warning(
                "Failed to enable PRAGMA foreign_keys", exc_info=True,
            )
        return db

    aiosqlite.Connection.__aenter__ = _aenter_with_fk
    setattr(aiosqlite.Connection, _FK_ATTR, True)


async def init_db() -> None:
    """Ensure the database schema is up-to-date by running any pending
    versioned migrations from backend/migrations/*.sql.

    This replaces the old inline CREATE TABLE + ALTER TABLE + DROP/CREATE
    soup that previously lived here. All schema definitions now live in
    numbered SQL files so there's a clear audit trail and SQLite's
    limitations (can't ALTER primary keys, etc.) are handled per-migration
    rather than with ad-hoc sqlite_master inspections.
    """
    # Make sure the parent directory exists. Important on first run after
    # mounting a Railway volume at e.g. /app/data — the mount point exists
    # but no books.db file does yet, and SQLite needs the directory to be
    # present before it can create the file.
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    from services.migrations import run as run_migrations
    applied = await run_migrations(DB_PATH)
    if applied:
        import logging
        logging.getLogger(__name__).info("Applied %d migration(s): %s", len(applied), ", ".join(applied))

    # Enable WAL journaling — concurrent readers don't block a writer, which
    # is what our queue worker + admin settings + save_book paths constantly
    # do. Persists across restarts once set on the file.
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("PRAGMA journal_mode=WAL")
            await db.commit()
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to enable WAL mode (non-fatal)", exc_info=True,
        )


async def _new_user_role_approved(db) -> tuple[str, int]:
    """Return (role, approved) for a brand-new user registration.

    The very first user ever registered automatically becomes admin and is
    pre-approved so the app is usable out of the box.  All subsequent users
    start as role='user', approved=0 (pending manual approval by an admin).
    """
    async with db.execute("SELECT COUNT(*) FROM users") as cursor:
        count = (await cursor.fetchone())[0]
    return ("admin", 1) if count == 0 else ("user", 0)


async def get_or_create_user(google_id: str, email: str, name: str, picture: str) -> dict:
    """Return existing user or create a new one.

    First user ever → role='admin', approved=1 (auto-admin).
    Subsequent users → role='user', approved=0 (pending approval).
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE google_id = ?", (google_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if row:
            await db.execute(
                "UPDATE users SET email=?, name=?, picture=? WHERE google_id=?",
                (email, name, picture, google_id),
            )
            await db.commit()
            async with db.execute(
                "SELECT * FROM users WHERE id = ?", (row["id"],)
            ) as cur:
                row = await cur.fetchone()
            return dict(row)

        role, approved = await _new_user_role_approved(db)
        await db.execute(
            "INSERT INTO users (google_id, email, name, picture, role, approved) VALUES (?,?,?,?,?,?)",
            (google_id, email, name, picture, role, approved),
        )
        async with db.execute(
            "SELECT * FROM users WHERE google_id = ?", (google_id,)
        ) as cursor:
            row = await cursor.fetchone()
        await db.commit()
        return dict(row)


async def get_or_create_user_github(github_id: str, email: str, name: str, picture: str) -> dict:
    """Return existing user (by github_id or email) or create a new one for GitHub OAuth."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Try finding by github_id first
        async with db.execute("SELECT * FROM users WHERE github_id = ?", (github_id,)) as cursor:
            row = await cursor.fetchone()
        if row:
            await db.execute(
                "UPDATE users SET email=?, name=?, picture=? WHERE github_id=?",
                (email, name, picture, github_id),
            )
            await db.commit()
            async with db.execute(
                "SELECT * FROM users WHERE id = ?", (row["id"],)
            ) as cur:
                row = await cur.fetchone()
            return dict(row)

        # Try linking to existing account by email (user signed in via Google before)
        if email:
            async with db.execute("SELECT * FROM users WHERE email = ?", (email,)) as cursor:
                row = await cursor.fetchone()
            if row:
                row_id = row["id"]
                await db.execute(
                    "UPDATE users SET github_id=?, name=?, picture=? WHERE id=?",
                    (github_id, name, picture, row_id),
                )
                await db.commit()
                async with db.execute(
                    "SELECT * FROM users WHERE id = ?", (row_id,)
                ) as cur:
                    row = await cur.fetchone()
                return dict(row)

        role, approved = await _new_user_role_approved(db)
        await db.execute(
            "INSERT INTO users (google_id, github_id, email, name, picture, role, approved) VALUES (?,?,?,?,?,?,?)",
            (f"github:{github_id}", github_id, email, name, picture, role, approved),
        )
        async with db.execute("SELECT * FROM users WHERE github_id = ?", (github_id,)) as cursor:
            row = await cursor.fetchone()
        await db.commit()
        return dict(row)


async def get_or_create_user_apple(apple_id: str, email: str, name: str) -> dict:
    """Return existing user (by apple_id or email) or create a new one for Apple OAuth.

    Apple only returns name/email on the first login; subsequent logins only
    provide the subject (apple_id). We therefore only update name/email when
    they are non-empty.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Try finding by apple_id first
        async with db.execute("SELECT * FROM users WHERE apple_id = ?", (apple_id,)) as cursor:
            row = await cursor.fetchone()
        if row:
            if email or name:
                await db.execute(
                    "UPDATE users SET email=COALESCE(NULLIF(?,''), email), name=COALESCE(NULLIF(?,''), name) WHERE apple_id=?",
                    (email, name, apple_id),
                )
            async with db.execute("SELECT * FROM users WHERE apple_id = ?", (apple_id,)) as cursor:
                row = await cursor.fetchone()
            await db.commit()
            return dict(row)

        # Try linking to existing account by email
        if email:
            async with db.execute("SELECT * FROM users WHERE email = ?", (email,)) as cursor:
                row = await cursor.fetchone()
            if row:
                await db.execute(
                    "UPDATE users SET apple_id=? WHERE id=?",
                    (apple_id, row["id"]),
                )
                await db.commit()
                updated = dict(row)
                updated["apple_id"] = apple_id
                return updated

        role, approved = await _new_user_role_approved(db)
        await db.execute(
            "INSERT INTO users (google_id, apple_id, email, name, role, approved) VALUES (?,?,?,?,?,?)",
            (f"apple:{apple_id}", apple_id, email, name, role, approved),
        )
        async with db.execute("SELECT * FROM users WHERE apple_id = ?", (apple_id,)) as cursor:
            row = await cursor.fetchone()
        await db.commit()
        return dict(row)


async def get_user_by_id(user_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
    return dict(row) if row else None


async def list_users() -> list[dict]:
    """Return all users (for the admin panel)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, email, name, picture, role, approved, created_at FROM users ORDER BY created_at"
        ) as cursor:
            return [dict(row) async for row in cursor]


async def set_user_approved(user_id: int, approved: bool) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET approved = ? WHERE id = ?",
            (1 if approved else 0, user_id),
        )
        await db.commit()


async def set_user_role(user_id: int, role: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET role = ? WHERE id = ?",
            (role, user_id),
        )
        await db.commit()


async def delete_user(user_id: int) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        # annotations.user_id, vocabulary.user_id (migration 031, #754 PR 1/4)
        # and book_insights.user_id (migration 032, #754 PR 2/4) carry declared
        # FKs with ON DELETE CASCADE, so the DELETE FROM users at the bottom
        # cascades all three tables automatically under PRAGMA foreign_keys=ON.
        await db.execute("DELETE FROM user_reading_progress WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM reading_history WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM book_uploads WHERE user_id = ?", (user_id,))
        # Cascade deletions for uploaded books owned by this user.
        # translations.book_id, audio_cache.book_id (migration 033, #754 PR 3/4),
        # chapter_summaries.book_id and book_insights.book_id (migration 032,
        # #754 PR 2/4) all carry declared FKs, so the DELETE FROM books
        # WHERE owner_user_id below cascades these tables automatically.
        _owned = "SELECT id FROM books WHERE owner_user_id = ?"
        await db.execute(f"DELETE FROM translation_queue WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM word_occurrences WHERE book_id IN ({_owned})", (user_id,))
        # Prune flashcard_reviews entries left without any occurrence (still
        # needed until word_occurrences gets its declared FK in PR 4/4).
        await db.execute(
            "DELETE FROM flashcard_reviews WHERE vocabulary_id NOT IN "
            "(SELECT DISTINCT vocabulary_id FROM word_occurrences)"
        )
        await db.execute(
            "DELETE FROM vocabulary WHERE id NOT IN (SELECT DISTINCT vocabulary_id FROM word_occurrences)"
        )
        # annotations.book_id (migration 031) and book_insights.book_id
        # (migration 032) cascade on the DELETE FROM books below, so no
        # manual cleanup is needed here for those tables.
        await db.execute(f"DELETE FROM user_reading_progress WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM reading_history WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM user_book_chapters WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM book_uploads WHERE book_id IN ({_owned})", (user_id,))
        await db.execute("DELETE FROM books WHERE owner_user_id = ?", (user_id,))
        await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await db.commit()


async def set_user_plan(user_id: int, plan: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET plan = ? WHERE id = ?",
            (plan, user_id),
        )
        await db.commit()


async def set_user_gemini_key(user_id: int, encrypted_key: str | None) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET gemini_key = ? WHERE id = ?",
            (encrypted_key, user_id),
        )
        await db.commit()


async def set_user_claude_key(user_id: int, encrypted_key: str | None) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET claude_key = ? WHERE id = ?",
            (encrypted_key, user_id),
        )
        await db.commit()


async def set_user_deepseek_key(user_id: int, encrypted_key: str | None) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET deepseek_key = ? WHERE id = ?",
            (encrypted_key, user_id),
        )
        await db.commit()


async def get_cached_translation(book_id: int, chapter_index: int, target_language: str) -> list[str] | None:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT paragraphs FROM translations WHERE book_id=? AND chapter_index=? AND target_language=?",
            (book_id, chapter_index, target_language),
        ) as cursor:
            row = await cursor.fetchone()
    return json.loads(row[0]) if row else None


async def get_cached_translation_with_meta(
    book_id: int, chapter_index: int, target_language: str,
) -> dict | None:
    """Like get_cached_translation, but also returns provider/model metadata
    and the translated chapter title (may be None for rows saved before the
    011 migration, or when the translator couldn't produce a title)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT paragraphs, provider, model, title_translation
               FROM translations
               WHERE book_id=? AND chapter_index=? AND target_language=?""",
            (book_id, chapter_index, target_language),
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        return None
    return {
        "paragraphs": json.loads(row["paragraphs"]),
        "provider": row["provider"],
        "model": row["model"],
        "title_translation": row["title_translation"],
    }


async def save_translation(
    book_id: int,
    chapter_index: int,
    target_language: str,
    paragraphs: list[str],
    *,
    provider: str | None = None,
    model: str | None = None,
    title_translation: str | None = None,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO translations
              (book_id, chapter_index, target_language, paragraphs,
               provider, model, title_translation)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (book_id, chapter_index, target_language,
             json.dumps(paragraphs), provider, model, title_translation),
        )
        await db.commit()

    # Self-cleaning queue: any pending/running row for this (book, chapter,
    # lang) gets marked 'done' so the worker doesn't claim and skip-cache
    # later. Works for all save paths: reader on-demand, bulk job, manual
    # retranslate, and even the worker's own save (no-op in that case).
    # Lazy import for cycle safety; non-fatal on error.
    try:
        from services.translation_queue import mark_queue_row_done
        await mark_queue_row_done(book_id, chapter_index, target_language)
    except ImportError:
        pass  # FastAPI not installed (offline pretranslate context) — queue cleanup not needed
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "Queue cleanup after save_translation failed", exc_info=True,
        )


async def count_translations_for_book(book_id: int, target_language: str) -> int:
    """Count how many chapters of a book have a translation cached."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM translations WHERE book_id=? AND target_language=?",
            (book_id, target_language),
        ) as cursor:
            row = await cursor.fetchone()
    return row[0] if row else 0


async def get_translated_chapter_indices(book_id: int, target_language: str) -> list[int]:
    """Return the chapter indices of a book that have a translation cached.

    The reader's Contents panel marks each row translated or not (#2754), which
    a bare count cannot answer. Sorted so the caller can rely on the order.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT chapter_index FROM translations WHERE book_id=? AND target_language=? "
            "ORDER BY chapter_index",
            (book_id, target_language),
        ) as cursor:
            rows = await cursor.fetchall()
    return [row[0] for row in rows]


async def delete_translations_for_book(book_id: int) -> None:
    """Delete all cached translations for a book across all languages and chapters."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM translations WHERE book_id=?", (book_id,))
        await db.commit()


async def replace_translations_for_book(
    book_id: int,
    target_language: str,
    entries: list[dict],
) -> None:
    """Atomically replace all translations for (book_id, target_language).

    Deletes every existing row for the pair and inserts the new batch in a
    single transaction. On any failure the original rows are preserved.
    Each dict in entries must have: chapter_index, paragraphs (list[str]),
    and optionally provider, model, title_translation.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute(
                "DELETE FROM translations WHERE book_id=? AND target_language=?",
                (book_id, target_language),
            )
            await db.executemany(
                """INSERT INTO translations
                   (book_id, chapter_index, target_language, paragraphs,
                    provider, model, title_translation)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        book_id,
                        e["chapter_index"],
                        target_language,
                        json.dumps(e["paragraphs"]),
                        e.get("provider"),
                        e.get("model"),
                        e.get("title_translation"),
                    )
                    for e in entries
                ],
            )
            await db.commit()
        except Exception:
            await db.rollback()
            raise


async def get_cached_book(book_id: int) -> dict | None:
    """Return cached book dict (includes 'text') or None."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM books WHERE id = ?", (book_id,)
        ) as cursor:
            row = await cursor.fetchone()
    if row is None:
        return None
    d = dict(row)
    for field in ("authors", "languages", "subjects"):
        if isinstance(d.get(field), str):
            d[field] = json.loads(d[field])
    if isinstance(d.get("images"), str):
        d["images"] = json.loads(d["images"])
    return d


async def save_book(book_id: int, meta: dict, text: str, images: list | None = None) -> None:
    """Insert or update a book record (meta + full text + images).

    After saving, the translation queue is auto-seeded with this book's
    chapters for every configured target language. The worker (if running)
    will pick them up on its next tick.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        # Guard against clobbering a user's uploaded private book that happens
        # to share the same auto-assigned SQLite ID as a Gutenberg catalog ID.
        # (#467)
        async with db.execute(
            "SELECT source FROM books WHERE id=?", (book_id,)
        ) as _cur:
            _existing = await _cur.fetchone()
        if _existing and _existing[0] == "upload":
            return

        params = (
            meta.get("title", ""),
            json.dumps(meta.get("authors", [])),
            json.dumps(meta.get("languages", [])),
            json.dumps(meta.get("subjects", [])),
            meta.get("download_count", 0),
            meta.get("cover", ""),
            text,
            json.dumps(images or []),
        )

        if _existing:
            # UPDATE — never DELETE+INSERT on an existing row; INSERT OR REPLACE
            # would fire ON DELETE CASCADE and wipe translations, audio_cache,
            # annotations, etc. (#1703)
            await db.execute(
                """UPDATE books
                   SET title=?, authors=?, languages=?, subjects=?,
                       download_count=?, cover=?, text=?, images=?
                   WHERE id=?""",
                (*params, book_id),
            )
        else:
            await db.execute(
                """INSERT INTO books
                   (title, authors, languages, subjects, download_count, cover, text, images, id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (*params, book_id),
            )
        await db.commit()

    # Auto-enqueue for translation. Lazy-imported to avoid a circular import
    # (translation_queue → db → translation_queue). Failures are non-fatal:
    # a book save must never be blocked by queue trouble.
    try:
        from services.translation_queue import enqueue_for_book, worker
        added = await enqueue_for_book(book_id)
        if added:
            worker().wake()
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "Auto-enqueue after save_book(%s) failed", book_id, exc_info=True,
        )




# ── Uploaded-book chapters (issue #357) ──────────────────────────────────────

async def get_book_source(book_id: int) -> str | None:
    """Return the 'source' column of a book (e.g. 'gutenberg', 'upload') or None if missing."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT source FROM books WHERE id = ?", (book_id,)
        ) as cur:
            row = await cur.fetchone()
    return row[0] if row else None


async def get_user_book_chapters(
    book_id: int, include_drafts: bool = False,
) -> list[dict]:
    """Return rows from user_book_chapters for an uploaded book, ordered by chapter_index."""
    query = ("SELECT id, chapter_index, title, text, is_draft, reviewed, updated_at"
             " FROM user_book_chapters WHERE book_id = ?")
    if not include_drafts:
        query += " AND is_draft = 0"
    query += " ORDER BY chapter_index"
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(query, (book_id,)) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def count_draft_user_book_chapters(book_id: int) -> int:
    """Return count of draft rows for an uploaded book (0 means fully confirmed or empty)."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM user_book_chapters WHERE book_id = ? AND is_draft = 1",
            (book_id,),
        ) as cur:
            row = await cur.fetchone()
    return row[0] if row else 0


# ── EPUB cache ────────────────────────────────────────────────────────────────

async def save_book_epub(book_id: int, epub_bytes: bytes, epub_url: str = "") -> None:
    """Persist downloaded EPUB bytes for a Gutenberg book."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO book_epubs (book_id, epub_url, epub_bytes)
            VALUES (?, ?, ?)
            """,
            (book_id, epub_url, epub_bytes),
        )
        await db.commit()


async def get_book_epub_bytes(book_id: int) -> bytes | None:
    """Return stored EPUB bytes for a book, or None if not cached."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT epub_bytes FROM book_epubs WHERE book_id = ?", (book_id,)
        ) as cur:
            row = await cur.fetchone()
    return row[0] if row else None


async def has_book_epub(book_id: int) -> bool:
    """Cheap existence check — avoids loading the EPUB blob just to know if
    we have one. Used by the reader source-format badge."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT 1 FROM book_epubs WHERE book_id = ? LIMIT 1", (book_id,)
        ) as cur:
            return (await cur.fetchone()) is not None


# ── Fossilized content (issue #2624 / docs/design/local-first-content.md) ────

async def get_book_freeze(book_id: int) -> dict | None:
    """Return the freeze metadata row for a fossilized book, or None if the
    book is not frozen. The row's existence is the frozen flag."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM book_freeze WHERE book_id = ?", (book_id,)
        ) as cur:
            row = await cur.fetchone()
    return dict(row) if row else None


async def split_dependents(book_id: int) -> dict[str, int]:
    """Count rows that anchor to this book's chapter_index.

    annotations, word_occurrences and translations each store a bare index, so
    changing the split re-anchors them silently. Anything with no dependents is
    safe to re-split — which covers both a book still in the review queue and a
    reader's own upload that nobody has annotated.
    """
    counts: dict[str, int] = {}
    async with aiosqlite.connect(DB_PATH) as db:
        for label, sql in (
            ("annotations", "SELECT COUNT(*) FROM annotations WHERE book_id = ?"),
            ("vocabulary", "SELECT COUNT(*) FROM word_occurrences WHERE book_id = ?"),
            ("translations", "SELECT COUNT(*) FROM translations WHERE book_id = ?"),
        ):
            async with db.execute(sql, (book_id,)) as cur:
                n = (await cur.fetchone())[0]
            if n:
                counts[label] = n
    return counts


async def get_frozen_chapters(book_id: int) -> list[dict]:
    """Return stored chapters for a fossilized book, ordered by chapter_index."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT chapter_index, title, text, role FROM book_chapters "
            "WHERE book_id = ? ORDER BY chapter_index",
            (book_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


# ── App settings (key/value config used by the always-on queue, etc.) ────────

async def get_setting(key: str) -> str | None:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT value FROM app_settings WHERE key=?", (key,),
        ) as cursor:
            row = await cursor.fetchone()
    return row[0] if row else None


async def set_setting(key: str, value: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO app_settings (key, value) VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value=excluded.value""",
            (key, value),
        )
        await db.commit()


async def get_chapter_summary(book_id: int, chapter_index: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT content, model, created_at FROM chapter_summaries WHERE book_id=? AND chapter_index=?",
            (book_id, chapter_index),
        ) as cursor:
            row = await cursor.fetchone()
    return dict(row) if row else None


async def save_chapter_summary(book_id: int, chapter_index: int, content: str, model: str | None = None) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO chapter_summaries (book_id, chapter_index, content, model)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(book_id, chapter_index) DO UPDATE
               SET content=excluded.content, model=excluded.model, created_at=CURRENT_TIMESTAMP""",
            (book_id, chapter_index, content, model),
        )
        await db.commit()


async def get_reading_progress(user_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT book_id, chapter_index, last_read FROM user_reading_progress WHERE user_id=? ORDER BY last_read DESC",
            (user_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def upsert_reading_progress(user_id: int, book_id: int, chapter_index: int) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO user_reading_progress (user_id, book_id, chapter_index, last_read)
               VALUES (?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(user_id, book_id) DO UPDATE SET
                 chapter_index=excluded.chapter_index,
                 last_read=excluded.last_read""",
            (user_id, book_id, chapter_index),
        )
        await db.commit()


async def log_reading_event(user_id: int, book_id: int, chapter_index: int) -> None:
    """Append one row to reading_history for streak / heatmap analytics."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO reading_history (user_id, book_id, chapter_index) VALUES (?, ?, ?)",
            (user_id, book_id, chapter_index),
        )
        await db.commit()


async def upsert_progress_and_log_event(
    user_id: int, book_id: int, chapter_index: int
) -> None:
    """Atomically save reading position and append an analytics event.

    Both writes share a single connection and commit so they either both
    persist or both roll back — eliminating the window where progress is
    saved but the streak/heatmap event is silently dropped.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO user_reading_progress (user_id, book_id, chapter_index, last_read)
               VALUES (?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(user_id, book_id) DO UPDATE SET
                 chapter_index=excluded.chapter_index,
                 last_read=excluded.last_read""",
            (user_id, book_id, chapter_index),
        )
        await db.execute(
            "INSERT INTO reading_history (user_id, book_id, chapter_index) VALUES (?, ?, ?)",
            (user_id, book_id, chapter_index),
        )
        await db.commit()


async def get_user_stats(user_id: int) -> dict:
    """Return aggregated reading statistics for a user."""
    from datetime import date, timedelta, datetime, timezone

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # ── Totals ────────────────────────────────────────────────────────────
        async with db.execute(
            "SELECT COUNT(DISTINCT book_id) FROM user_reading_progress WHERE user_id=?",
            (user_id,),
        ) as cur:
            books_started = (await cur.fetchone())[0]

        async with db.execute(
            "SELECT COUNT(*) FROM vocabulary WHERE user_id=?", (user_id,)
        ) as cur:
            vocab_words = (await cur.fetchone())[0]

        async with db.execute(
            "SELECT COUNT(*) FROM annotations WHERE user_id=?", (user_id,)
        ) as cur:
            annotations = (await cur.fetchone())[0]

        async with db.execute(
            "SELECT COUNT(*) FROM book_insights WHERE user_id=?", (user_id,)
        ) as cur:
            insights = (await cur.fetchone())[0]

        # ── Activity per day (last 365 days) — union of all event types ──────
        activity_sql = """
            SELECT DATE(ts) AS day, COUNT(*) AS cnt FROM (
                SELECT created_at AS ts FROM vocabulary WHERE user_id=?
                UNION ALL SELECT created_at FROM annotations WHERE user_id=?
                UNION ALL SELECT created_at FROM book_insights WHERE user_id=?
                UNION ALL SELECT read_at FROM reading_history WHERE user_id=?
            ) WHERE ts >= DATE('now', '-365 days')
            GROUP BY day ORDER BY day DESC
        """
        async with db.execute(activity_sql, (user_id, user_id, user_id, user_id)) as cur:
            activity_rows = await cur.fetchall()

    activity = [{"date": r["day"], "count": r["cnt"]} for r in activity_rows]

    # ── Streak (consecutive days ending today or yesterday) ───────────────────
    dates_set = {a["date"] for a in activity}
    _utc_today = datetime.now(timezone.utc).date()
    today = _utc_today.isoformat()
    yesterday = (_utc_today - timedelta(days=1)).isoformat()

    streak = 0
    if today in dates_set or yesterday in dates_set:
        check = _utc_today if today in dates_set else _utc_today - timedelta(days=1)
        while check.isoformat() in dates_set:
            streak += 1
            check -= timedelta(days=1)

    # Longest streak in the available data
    sorted_dates = sorted(dates_set)
    longest = 0
    run = 0
    prev: date | None = None
    for ds in sorted_dates:
        d = date.fromisoformat(ds)
        if prev is None or (d - prev).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)
        prev = d

    return {
        "totals": {
            "books_started": books_started,
            "vocabulary_words": vocab_words,
            "annotations": annotations,
            "insights": insights,
        },
        "streak": streak,
        "longest_streak": longest,
        "activity": activity,
    }


async def list_audited_books() -> list[dict]:
    """Return the published catalog.

    Two separate facts, deliberately (migration 046). A `book_freeze` row means the
    chapter split is fixed — a technical, irreversible commitment an architect
    session makes on its own. `published_at` means a human decided the book belongs
    in the library — editorial, outward-facing, and reversible. Only the second
    puts a book here.

    Keying on *published* rather than on ownership keeps the user-upload flow
    additive: an unpublished book is simply not in the catalog, whoever froze it.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT b.id, b.title, b.authors, b.languages, b.subjects,"
            " b.download_count, b.cover, b.cached_at, f.frozen_at"
            " FROM books b"
            " JOIN book_freeze f ON f.book_id = b.id"
            " WHERE f.published_at IS NOT NULL"
            "   AND (b.source IS NULL OR b.source != 'upload')"
            " ORDER BY b.title COLLATE NOCASE"
        ) as cursor:
            rows = await cursor.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        for field in ("authors", "languages", "subjects"):
            if isinstance(d.get(field), str):
                try:
                    d[field] = json.loads(d[field])
                except (ValueError, TypeError):
                    d[field] = []
        result.append(d)
    return result


async def list_frozen_unpublished() -> list[dict]:
    """Books an architect session froze that no human has published yet.

    This is the admin review queue: the split is fixed, the chapters are readable,
    and the only thing standing between the book and the library is somebody
    reading the chapter list.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT b.id, b.title, b.authors, b.languages, b.cover,"
            "       f.frozen_at, f.audited_by, f.splitter, f.chapter_source,"
            "       (SELECT COUNT(*) FROM book_chapters c WHERE c.book_id = b.id) AS chapter_count"
            "  FROM books b"
            "  JOIN book_freeze f ON f.book_id = b.id"
            " WHERE f.published_at IS NULL"
            "   AND (b.source IS NULL OR b.source != 'upload')"
            " ORDER BY f.frozen_at DESC, b.id DESC"
        ) as cursor:
            rows = await cursor.fetchall()

        # A frozen book can still be mid-translation. Publishing it then puts a
        # half-translated book in the library, so the queue has to say — DISTINCT
        # because a re-translated chapter is still one translated chapter.
        async with db.execute(
            "SELECT book_id, target_language, COUNT(DISTINCT chapter_index) AS n"
            "  FROM translations GROUP BY book_id, target_language"
        ) as cursor:
            trans_rows = await cursor.fetchall()

    by_book: dict[int, list[tuple[str, int]]] = {}
    for r in trans_rows:
        by_book.setdefault(r["book_id"], []).append((r["target_language"], r["n"]))

    result = []
    for row in rows:
        d = dict(row)
        for field in ("authors", "languages"):
            if isinstance(d.get(field), str):
                try:
                    d[field] = json.loads(d[field])
                except (ValueError, TypeError):
                    d[field] = []
        total = d.get("chapter_count") or 0
        d["translations"] = [
            {
                "language": lang,
                "translated": n,
                "total": total,
                "complete": total > 0 and n >= total,
            }
            for lang, n in sorted(by_book.get(d["id"], []))
        ]
        result.append(d)
    return result


async def set_book_published(book_id: int, published: bool) -> bool:
    """Put a frozen book into the library, or take it back out.

    Returns False when the book has no freeze row — a split has to be fixed before
    it can be published. Re-publishing an already-published book keeps its original
    publish time rather than bumping it.
    """
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT published_at FROM book_freeze WHERE book_id = ?", (book_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if row is None:
            return False
        if published and row[0]:
            return True
        await db.execute(
            "UPDATE book_freeze SET published_at = ? WHERE book_id = ?",
            (stamp if published else None, book_id),
        )
        await db.commit()
    return True


async def list_cached_books() -> list[dict]:
    """Return publicly available cached books (Gutenberg only, without text field).

    Uploaded books are excluded — their titles are private to the owner.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, title, authors, languages, subjects, download_count, cover, cached_at"
            " FROM books"
            " WHERE (source IS NULL OR source != 'upload')"
            " ORDER BY cached_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        for field in ("authors", "languages", "subjects"):
            if isinstance(d.get(field), str):
                d[field] = json.loads(d[field])
        result.append(d)
    return result


# ── Annotations ───────────────────────────────────────────────────────────────

async def create_annotation(
    user_id: int,
    book_id: int,
    chapter_index: int,
    sentence_text: str,
    note_text: str,
    color: str,
) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text, note_text, color)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT (user_id, book_id, chapter_index, sentence_text)
               DO UPDATE SET note_text = excluded.note_text, color = excluded.color""",
            (user_id, book_id, chapter_index, sentence_text, note_text, color),
        )
        async with db.execute(
            "SELECT * FROM annotations WHERE user_id = ? AND book_id = ? AND chapter_index = ? AND sentence_text = ?",
            (user_id, book_id, chapter_index, sentence_text),
        ) as c:
            row = await c.fetchone()
        await db.commit()
    return dict(row) if row else {}


async def get_annotations(user_id: int, book_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM annotations WHERE user_id = ? AND book_id = ? ORDER BY chapter_index, created_at",
            (user_id, book_id),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def update_annotation(
    annotation_id: int,
    user_id: int,
    note_text: str | None = None,
    color: str | None = None,
) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        clauses, params = [], []
        if note_text is not None:
            clauses.append("note_text = ?")
            params.append(note_text)
        if color is not None:
            clauses.append("color = ?")
            params.append(color)
        if clauses:
            params.extend([annotation_id, user_id])
            await db.execute(
                f"UPDATE annotations SET {', '.join(clauses)} WHERE id = ? AND user_id = ?",
                params,
            )
        async with db.execute(
            "SELECT * FROM annotations WHERE id = ? AND user_id = ?",
            (annotation_id, user_id),
        ) as cursor:
            row = await cursor.fetchone()
        await db.commit()
    return dict(row) if row else None


async def delete_annotation(annotation_id: int, user_id: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM annotations WHERE id = ? AND user_id = ?",
            (annotation_id, user_id),
        )
        await db.commit()
    return cursor.rowcount > 0


async def get_all_annotations(user_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT a.*, b.title AS book_title
            FROM annotations a
            LEFT JOIN books b ON b.id = a.book_id
            WHERE a.user_id = ?
            ORDER BY b.title, a.chapter_index, a.created_at
            """,
            (user_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


# ── Vocabulary ────────────────────────────────────────────────────────────────

async def _resolve_base_form(
    word: str, book_id: int, provided: str | None = None
) -> tuple[str, str | None, dict | None]:
    """Return ``(base form, language, lookup result or None)`` for *word*.

    Vocabulary entries are keyed on the base form so one word encountered in
    several inflections stays a single entry (#2663). Callers that already hold a
    definition — the reader's word tooltip fetches one before its Save button is
    reachable — pass it in via *provided*, which skips the round-trip entirely.

    Every failure path falls back to *word* as it appeared in the text: a save must
    never fail, stall, or be dropped because a dictionary lookup did not work out.
    """
    try:
        book = await get_cached_book(book_id)
        langs = book.get("languages") if book else None
        lang = (langs[0] if langs else None) or "en"
    except Exception:
        lang = "en"

    if provided and provided.strip():
        return provided.strip().lower(), lang, None

    try:
        from services import wiktionary
        result = await wiktionary.lookup(word, lang)
        base = (result.get("lemma") or "").strip().lower()
        # The caller reuses this payload to store the meaning, so resolving the
        # base form and capturing the definition cost one request, not two.
        return (base or word), (result.get("language") or lang), result
    except Exception:
        import logging
        logging.getLogger(__name__).warning("Base-form lookup failed for %s", word, exc_info=True)
        return word, lang, None


# Definitions are written in English unless the client asked for another
# language; a stored meaning must always record one, or it can never be matched
# against a request and would be re-fetched forever (#2704).
_DEFAULT_DEFINITION_LANG = "en"


def _decode_definitions(raw: str | None) -> list[dict]:
    """Parse a stored definitions blob, tolerating anything unusable."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return []
    return parsed if isinstance(parsed, list) else []


async def get_stored_definition(user_id: int, word: str, target: str) -> dict | None:
    """Return a saved word's stored meaning, or None if there is nothing usable.

    Serves the reader's tooltip without a network round-trip for words the user
    already saved (#2704). Only a meaning written in *target* qualifies — a stored
    English gloss must not be handed back to someone who asked for Chinese.
    """
    word = word.strip().lower()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT word, lemma, language, definitions, form_of, definition_url, definition_lang
                 FROM vocabulary WHERE user_id = ? AND LOWER(word) = ?""",
            (user_id, word),
        ) as cursor:
            row = await cursor.fetchone()
    if row is None:
        return None
    definitions = _decode_definitions(row["definitions"])
    if not definitions or row["definition_lang"] != target:
        return None
    return {
        "lemma": row["lemma"] or row["word"],
        "language": row["language"] or "",
        "definitions": definitions,
        "form_of": row["form_of"],
        "url": row["definition_url"] or "",
        "definition_lang": row["definition_lang"],
        "cached": True,
    }


async def store_definition(
    user_id: int, word: str, result: dict, target: str | None = None
) -> bool:
    """Persist a freshly looked-up meaning onto an already-saved word (#2704).

    Lazy backfill: entries saved before meanings were stored — and entries whose
    stored meaning is in a different language than the one now being asked for —
    are filled in the next time a live lookup happens. Returns True when a row
    was written.
    """
    definitions = result.get("definitions") or []
    if not definitions:
        return False
    word = word.strip().lower()
    target = target or result.get("definition_lang") or _DEFAULT_DEFINITION_LANG

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, definitions, definition_lang FROM vocabulary WHERE user_id = ? AND LOWER(word) = ?",
            (user_id, word),
        ) as cursor:
            row = await cursor.fetchone()
        if row is None:
            return False
        # Already stored in the language being asked for — nothing to do.
        if _decode_definitions(row["definitions"]) and row["definition_lang"] == target:
            return False
        await db.execute(
            """UPDATE vocabulary
                  SET definitions = ?, form_of = ?, definition_url = ?, definition_lang = ?
                WHERE id = ?""",
            (json.dumps(definitions, ensure_ascii=False), result.get("form_of"),
             result.get("url"), target, row["id"]),
        )
        await db.commit()
    return True


async def save_word(
    user_id: int,
    word: str,
    book_id: int,
    chapter_index: int,
    sentence_text: str,
    lemma: str | None = None,
    definitions: list[dict] | None = None,
    form_of: str | None = None,
    definition_url: str | None = None,
    definition_lang: str | None = None,
) -> dict:
    word = word.strip().lower()
    base, language, looked_up = await _resolve_base_form(word, book_id, lemma)

    # The meaning is captured once, here, instead of being re-fetched on every
    # click (#2704). The tooltip passes what it already fetched; otherwise the
    # lookup done for the base form above supplies it at no extra cost.
    if not definitions and looked_up:
        definitions = looked_up.get("definitions") or None
        form_of = form_of or looked_up.get("form_of")
        definition_url = definition_url if definition_url is not None else looked_up.get("url")
        definition_lang = definition_lang or looked_up.get("definition_lang")
    if definitions:
        definition_lang = definition_lang or _DEFAULT_DEFINITION_LANG
    defs_json = json.dumps(definitions, ensure_ascii=False) if definitions else None

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            "INSERT OR IGNORE INTO vocabulary (user_id, word, lemma, language) VALUES (?, ?, ?, ?)",
            (user_id, base, base, language),
        )
        # An entry saved before base-form storage landed can carry a stale lemma.
        await db.execute(
            "UPDATE vocabulary SET lemma = ?, language = COALESCE(?, language) WHERE user_id = ? AND word = ?",
            (base, language, user_id, base),
        )
        # COALESCE so a save with nothing in hand (the mobile drawer, which can
        # save without opening the definition) never blanks a stored meaning.
        if defs_json:
            await db.execute(
                """UPDATE vocabulary
                      SET definitions = ?, form_of = ?, definition_url = ?, definition_lang = ?
                    WHERE user_id = ? AND word = ?""",
                (defs_json, form_of, definition_url, definition_lang, user_id, base),
            )
        # SQLite makes uncommitted writes visible to subsequent reads on the
        # same connection, so no intermediate commit is needed before the SELECT.
        async with db.execute(
            "SELECT id FROM vocabulary WHERE user_id = ? AND word = ?",
            (user_id, base),
        ) as cursor:
            vocab_row = await cursor.fetchone()
        vocab_id = vocab_row["id"]

        # UNIQUE INDEX on (vocabulary_id, book_id, chapter_index, sentence_text) prevents duplicates
        await db.execute(
            """INSERT OR IGNORE INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text, surface_form)
               VALUES (?, ?, ?, ?, ?)""",
            (vocab_id, book_id, chapter_index, sentence_text, word),
        )
        # Pre-migration rows carry NULL — a re-save of the same sentence
        # backfills the surface form instead of duplicating the occurrence.
        await db.execute(
            """UPDATE word_occurrences SET surface_form = ?
               WHERE vocabulary_id = ? AND book_id = ? AND chapter_index = ?
                 AND sentence_text = ? AND surface_form IS NULL""",
            (word, vocab_id, book_id, chapter_index, sentence_text),
        )
        async with db.execute("SELECT * FROM vocabulary WHERE id = ?", (vocab_id,)) as cursor:
            row = await cursor.fetchone()
        await db.commit()  # single atomic commit for both inserts

    return dict(row) if row else {}


async def get_vocabulary(user_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT v.id, v.word, v.lemma, v.language, v.created_at,
                      v.definitions, v.form_of, v.definition_url, v.definition_lang,
                      wo.book_id, b.title AS book_title, json_extract(b.languages, '$[0]') AS book_language, wo.chapter_index, wo.sentence_text, wo.surface_form
               FROM vocabulary v
               LEFT JOIN word_occurrences wo ON wo.vocabulary_id = v.id
               LEFT JOIN books b ON b.id = wo.book_id
               WHERE v.user_id = ?
               ORDER BY v.word, wo.created_at""",
            (user_id,),
        ) as cursor:
            rows = await cursor.fetchall()

    words: dict[int, dict] = {}
    for row in rows:
        vid = row["id"]
        if vid not in words:
            words[vid] = {
                "id": vid,
                "word": row["word"],
                "lemma": row["lemma"],
                "language": row["language"],
                "created_at": row["created_at"],
                "definitions": _decode_definitions(row["definitions"]),
                "form_of": row["form_of"],
                "definition_url": row["definition_url"],
                "definition_lang": row["definition_lang"],
                "occurrences": [],
            }
        if row["book_id"] is not None:
            words[vid]["occurrences"].append({
                "book_id": row["book_id"],
                "book_title": row["book_title"],
                "book_language": row["book_language"],
                "chapter_index": row["chapter_index"],
                "sentence_text": row["sentence_text"],
                "surface_form": row["surface_form"],
            })
    return list(words.values())


async def delete_word(user_id: int, word: str) -> bool:
    word = word.strip().lower()
    async with aiosqlite.connect(DB_PATH) as db:
        # FK enforcement (issue #748) cascades vocabulary → word_occurrences /
        # flashcard_reviews / vocabulary_tags / deck_members automatically.
        cursor = await db.execute(
            "DELETE FROM vocabulary WHERE user_id = ? AND word = ?",
            (user_id, word),
        )
        await db.commit()
    return cursor.rowcount > 0


# ── Obsidian / GitHub settings ────────────────────────────────────────────────

async def update_obsidian_settings(
    user_id: int,
    github_token_encrypted: str | None,
    repo: str | None,
    path: str | None,
    *,
    token_explicitly_set: bool = True,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        if token_explicitly_set:
            await db.execute(
                "UPDATE users SET github_token = ?, obsidian_repo = ?, obsidian_path = ? WHERE id = ?",
                (github_token_encrypted, repo, path, user_id),
            )
        else:
            # github_token omitted intentionally — avoid a non-atomic read-then-write race.
            await db.execute(
                "UPDATE users SET obsidian_repo = ?, obsidian_path = ? WHERE id = ?",
                (repo, path, user_id),
            )
        await db.commit()


async def get_obsidian_settings(user_id: int) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT github_token, obsidian_repo, obsidian_path FROM users WHERE id = ?",
            (user_id,),
        ) as cursor:
            row = await cursor.fetchone()
    return dict(row) if row else {}


# ── Book Insights (saved AI Q&A) ──────────────────────────────────────────────

async def save_insight(
    user_id: int,
    book_id: int,
    chapter_index: int | None,
    question: str,
    answer: str,
    context_text: str | None = None,
) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            """INSERT OR IGNORE INTO book_insights (user_id, book_id, chapter_index, question, answer, context_text)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (user_id, book_id, chapter_index, question, answer, context_text),
        )
        # SELECT before COMMIT — prevents dict(None) crash if a concurrent
        # delete_book removes the row between our COMMIT and a later SELECT.
        if chapter_index is None:
            async with db.execute(
                "SELECT * FROM book_insights WHERE user_id=? AND book_id=? AND chapter_index IS NULL AND question=?",
                (user_id, book_id, question),
            ) as c:
                row = await c.fetchone()
        else:
            async with db.execute(
                "SELECT * FROM book_insights WHERE user_id=? AND book_id=? AND chapter_index=? AND question=?",
                (user_id, book_id, chapter_index, question),
            ) as c:
                row = await c.fetchone()
        await db.commit()
    return dict(row) if row else {}


async def get_insights(user_id: int, book_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM book_insights WHERE user_id = ? AND book_id = ? ORDER BY created_at",
            (user_id, book_id),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_all_insights(user_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT i.*, b.title AS book_title
            FROM book_insights i
            LEFT JOIN books b ON b.id = i.book_id
            WHERE i.user_id = ?
            ORDER BY b.title, i.chapter_index, i.created_at
            """,
            (user_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def update_insight_question(insight_id: int, user_id: int, question: str) -> dict | None:
    """Update the question of the user's own insight; the answer is immutable.

    Returns the updated row, or None when the insight doesn't exist or
    belongs to another user."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "UPDATE book_insights SET question = ? WHERE id = ? AND user_id = ?",
            (question, insight_id, user_id),
        )
        if cursor.rowcount == 0:
            return None
        async with db.execute(
            "SELECT * FROM book_insights WHERE id = ?", (insight_id,)
        ) as c:
            row = await c.fetchone()
        await db.commit()
    return dict(row) if row else None


async def delete_insight(insight_id: int, user_id: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM book_insights WHERE id = ? AND user_id = ?",
            (insight_id, user_id),
        )
        await db.commit()
    return cursor.rowcount > 0


# ── InsightChat message history (issue #907, migration 035) ──────────────────
#
# See docs/design/insightchat-history-persistence.md for the "why new table"
# decision. `book_insights` is the user-bookmarked Q&A pair store; this is
# the transient running-conversation store.

CHAT_MESSAGE_MAX_BYTES = 8 * 1024  # 8 KB per message — rejected with 413 otherwise


async def append_chat_message(
    user_id: int, book_id: int, role: str, content: str
) -> dict:
    """Insert one chat message and return the inserted row (including
    auto-assigned id + created_at) so the caller can avoid a re-fetch."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "INSERT INTO chat_messages (user_id, book_id, role, content) "
            "VALUES (?, ?, ?, ?)",
            (user_id, book_id, role, content),
        )
        new_id = cursor.lastrowid
        async with db.execute(
            "SELECT * FROM chat_messages WHERE id = ?", (new_id,)
        ) as c:
            row = await c.fetchone()
        await db.commit()
    return dict(row) if row else {}


async def get_chat_messages(
    user_id: int,
    book_id: int,
    *,
    limit: int = 50,
    before_id: int | None = None,
) -> list[dict]:
    """Return up to `limit` messages for (user, book), newest first.

    When `before_id` is given, only rows with id < before_id are returned
    — enables reverse-scroll pagination of older history.
    """
    # Cap at 201 (one above the router's max of 200) so the router can fetch
    # limit+1 rows for has_more detection without hitting the cap at limit=200.
    safe_limit = max(1, min(limit, 201))
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if before_id is not None:
            sql = (
                "SELECT * FROM chat_messages "
                "WHERE user_id = ? AND book_id = ? AND id < ? "
                "ORDER BY id DESC LIMIT ?"
            )
            params = (user_id, book_id, before_id, safe_limit)
        else:
            sql = (
                "SELECT * FROM chat_messages "
                "WHERE user_id = ? AND book_id = ? "
                "ORDER BY id DESC LIMIT ?"
            )
            params = (user_id, book_id, safe_limit)
        async with db.execute(sql, params) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def clear_chat_messages(user_id: int, book_id: int) -> int:
    """Delete all chat messages for (user, book). Returns rowcount."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM chat_messages WHERE user_id = ? AND book_id = ?",
            (user_id, book_id),
        )
        await db.commit()
    return cursor.rowcount


# ── Flashcard / SRS (issue #556) ─────────────────────────────────────────────

async def _ensure_flashcard_rows(user_id: int) -> None:
    """Create flashcard_reviews rows for any vocabulary words that don't have one yet.

    New words are treated as due immediately (due_date = today). This is called
    lazily before any flashcard read so users don't need a separate 'enroll' step.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR IGNORE INTO flashcard_reviews (user_id, vocabulary_id, due_date)
            SELECT ?, id, date('now')
            FROM vocabulary
            WHERE user_id = ?
            """,
            (user_id, user_id),
        )
        await db.commit()


async def get_flashcards_due(
    user_id: int,
    vocabulary_ids: list[int] | None = None,
) -> list[dict]:
    """Return vocabulary cards whose due_date <= today, with vocab metadata.

    If vocabulary_ids is provided (e.g. a deck's resolved members), results
    are filtered to just those ids. An empty list means no cards are due.
    """
    await _ensure_flashcard_rows(user_id)
    if vocabulary_ids is not None and not vocabulary_ids:
        return []
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        sql = """
            SELECT fr.vocabulary_id, fr.interval_days, fr.ease_factor,
                   fr.repetitions, fr.due_date, fr.last_reviewed_at,
                   v.word, v.language, v.created_at AS saved_at,
                   v.definitions, v.form_of,
                   (SELECT wo.sentence_text FROM word_occurrences wo
                    WHERE wo.vocabulary_id = fr.vocabulary_id
                    ORDER BY wo.id ASC LIMIT 1) AS context
            FROM flashcard_reviews fr
            JOIN vocabulary v ON v.id = fr.vocabulary_id
            WHERE fr.user_id = ? AND fr.due_date <= date('now')
        """
        params: list = [user_id]
        if vocabulary_ids is not None:
            placeholders = ",".join(["?"] * len(vocabulary_ids))
            sql += f" AND fr.vocabulary_id IN ({placeholders})"
            params.extend(vocabulary_ids)
        sql += " ORDER BY fr.due_date ASC, v.word ASC LIMIT 100"
        async with db.execute(sql, params) as cur:
            rows = await cur.fetchall()
    # The card back shows the stored meaning rather than fetching one per review.
    return [{**dict(r), "definitions": _decode_definitions(r["definitions"])} for r in rows]


async def review_flashcard(
    user_id: int,
    vocabulary_id: int,
    grade: int,
) -> dict | None:
    """Apply SM-2 algorithm to a flashcard review. Returns updated state or None if not found."""
    from datetime import date, timedelta

    await _ensure_flashcard_rows(user_id)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT interval_days, ease_factor, repetitions FROM flashcard_reviews "
            "WHERE user_id = ? AND vocabulary_id = ?",
            (user_id, vocabulary_id),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None

        interval = row["interval_days"]
        ease = row["ease_factor"]
        reps = row["repetitions"]

        if grade < 3:
            new_interval = 1
            new_reps = 0
        else:
            if reps == 0:
                new_interval = 1
            elif reps == 1:
                new_interval = 6
            else:
                new_interval = round(interval * ease)
            new_reps = reps + 1

        new_ease = max(1.3, ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
        next_due = (date.today() + timedelta(days=new_interval)).isoformat()

        await db.execute(
            """
            UPDATE flashcard_reviews
            SET interval_days = ?, ease_factor = ?, repetitions = ?,
                due_date = ?,
                last_reviewed_at = datetime('now')
            WHERE user_id = ? AND vocabulary_id = ?
            """,
            (new_interval, round(new_ease, 4), new_reps,
             next_due, user_id, vocabulary_id),
        )
        await db.commit()

    return {
        "vocabulary_id": vocabulary_id,
        "interval_days": new_interval,
        "ease_factor": round(new_ease, 4),
        "repetitions": new_reps,
        "next_due": next_due,
    }


async def get_flashcard_stats(
    user_id: int,
    vocabulary_ids: list[int] | None = None,
) -> dict:
    """Return aggregate flashcard stats. Optionally scope to a subset of
    vocabulary_ids (deck-filtered stats)."""
    await _ensure_flashcard_rows(user_id)
    if vocabulary_ids is not None and not vocabulary_ids:
        return {"total": 0, "due_today": 0, "reviewed_today": 0}
    extra = ""
    params: tuple
    if vocabulary_ids is not None:
        placeholders = ",".join(["?"] * len(vocabulary_ids))
        extra = f" AND vocabulary_id IN ({placeholders})"

    async with aiosqlite.connect(DB_PATH) as db:
        if vocabulary_ids is not None:
            params = (user_id, *vocabulary_ids)
        else:
            params = (user_id,)
        async with db.execute(
            f"SELECT COUNT(*) FROM flashcard_reviews WHERE user_id = ?{extra}",
            params,
        ) as cur:
            total = (await cur.fetchone())[0]

        async with db.execute(
            f"SELECT COUNT(*) FROM flashcard_reviews WHERE user_id = ? AND due_date <= date('now'){extra}",
            params,
        ) as cur:
            due_today = (await cur.fetchone())[0]

        async with db.execute(
            f"SELECT COUNT(*) FROM flashcard_reviews "
            f"WHERE user_id = ? AND date(last_reviewed_at) = date('now'){extra}",
            params,
        ) as cur:
            reviewed_today = (await cur.fetchone())[0]

    return {
        "total": total,
        "due_today": due_today,
        "reviewed_today": reviewed_today,
    }


# ── Translation sessions (design: docs/design/user-translations.md, #2740) ───

async def create_translation_session(
    user_id: int, book_id: int, name: str, target_language: str,
    provider: str, style_prompt: str | None = None,
) -> dict | None:
    """Create a named session; returns the row, or None on a duplicate name."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        try:
            cursor = await db.execute(
                """INSERT INTO translation_sessions
                   (user_id, book_id, name, target_language, provider, style_prompt)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (user_id, book_id, name, target_language, provider, style_prompt),
            )
        except aiosqlite.IntegrityError:
            return None
        session_id = cursor.lastrowid
        async with db.execute(
            "SELECT * FROM translation_sessions WHERE id = ?", (session_id,)
        ) as c:
            row = await c.fetchone()
        await db.commit()
    return dict(row) if row else None


async def list_translation_sessions(user_id: int, book_id: int) -> list[dict]:
    """The user's sessions for a book, each with per-chapter coverage counts."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM translation_sessions WHERE user_id = ? AND book_id = ? ORDER BY created_at",
            (user_id, book_id),
        ) as c:
            sessions = [dict(r) for r in await c.fetchall()]
        for s in sessions:
            async with db.execute(
                """SELECT chapter_index, COUNT(*) AS n
                   FROM translation_session_paragraphs
                   WHERE session_id = ? GROUP BY chapter_index""",
                (s["id"],),
            ) as c:
                s["coverage"] = {r["chapter_index"]: r["n"] for r in await c.fetchall()}
    return sessions


async def get_translation_session(session_id: int, user_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM translation_sessions WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        ) as c:
            row = await c.fetchone()
    return dict(row) if row else None


async def update_translation_session(session_id: int, user_id: int, fields: dict) -> dict | None:
    """Update name / style_prompt / provider; returns the row, None if not
    owned, or raises IntegrityError → caller maps to 409 on duplicate name."""
    allowed = {k: v for k, v in fields.items() if k in ("name", "style_prompt", "provider", "target_language")}
    if not allowed:
        return await get_translation_session(session_id, user_id)
    sets = ", ".join(f"{k} = ?" for k in allowed)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            f"UPDATE translation_sessions SET {sets}, updated_at = CURRENT_TIMESTAMP "
            f"WHERE id = ? AND user_id = ?",
            (*allowed.values(), session_id, user_id),
        )
        if cursor.rowcount == 0:
            return None
        async with db.execute(
            "SELECT * FROM translation_sessions WHERE id = ?", (session_id,)
        ) as c:
            row = await c.fetchone()
        await db.commit()
    return dict(row) if row else None


async def delete_translation_session(session_id: int, user_id: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM translation_sessions WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        )
        await db.commit()
        return cursor.rowcount > 0


async def get_session_paragraphs(session_id: int, chapter_index: int) -> dict[int, dict]:
    """Paragraph rows for one chapter, keyed by paragraph_index (may be partial)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT paragraph_index, text, provider, model, edited_by_user
               FROM translation_session_paragraphs
               WHERE session_id = ? AND chapter_index = ?
               ORDER BY paragraph_index""",
            (session_id, chapter_index),
        ) as c:
            rows = await c.fetchall()
    return {
        r["paragraph_index"]: {
            "text": r["text"],
            "provider": r["provider"],
            "model": r["model"],
            "edited_by_user": bool(r["edited_by_user"]),
        }
        for r in rows
    }


async def upsert_session_paragraph(
    session_id: int, chapter_index: int, paragraph_index: int,
    text: str, provider: str, model: str, edited_by_user: bool = False,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO translation_session_paragraphs
               (session_id, chapter_index, paragraph_index, text, provider, model, edited_by_user)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(session_id, chapter_index, paragraph_index)
               DO UPDATE SET text = excluded.text, provider = excluded.provider,
                             model = excluded.model, edited_by_user = excluded.edited_by_user,
                             updated_at = CURRENT_TIMESTAMP""",
            (session_id, chapter_index, paragraph_index, text, provider, model, int(edited_by_user)),
        )
        await db.execute(
            "UPDATE translation_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (session_id,),
        )
        await db.commit()


async def delete_session_paragraph(session_id: int, chapter_index: int, paragraph_index: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """DELETE FROM translation_session_paragraphs
               WHERE session_id = ? AND chapter_index = ? AND paragraph_index = ?""",
            (session_id, chapter_index, paragraph_index),
        )
        await db.commit()
        return cursor.rowcount > 0


# ── Stories: the generic share pipeline (design: user-translations.md phase 2,
#    issue #2752). One pipeline for every kind — no per-kind forks. ──────────

async def create_story(user_id: int, fields: dict) -> dict:
    """Insert a story row; anchor validation happens in the router."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """INSERT INTO stories
               (user_id, kind, book_id, chapter_index, session_id,
                paragraph_start, paragraph_end, annotation_id, caption)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                user_id, fields["kind"], fields["book_id"], fields["chapter_index"],
                fields.get("session_id"), fields.get("paragraph_start"),
                fields.get("paragraph_end"), fields.get("annotation_id"),
                fields.get("caption"),
            ),
        )
        story_id = cursor.lastrowid
        await db.commit()
        async with db.execute("SELECT * FROM stories WHERE id = ?", (story_id,)) as c:
            row = await c.fetchone()
    return dict(row)


async def list_stories(book_id: int, chapter_index: int | None = None) -> list[dict]:
    """Stories for a book (optionally one chapter) with live referenced data:
    author name, session name/language and current paragraph texts for
    kind='translation', the annotation for kind='note', plus comment counts.
    Stories snapshot nothing — this JOIN is the 'live reference' contract."""
    where = "s.book_id = ?"
    params: tuple = (book_id,)
    if chapter_index is not None:
        where += " AND s.chapter_index = ?"
        params = (book_id, chapter_index)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            f"""SELECT s.*, u.name AS author_name,
                       ts.name AS session_name, ts.target_language,
                       a.sentence_text, a.note_text, a.color,
                       (SELECT COUNT(*) FROM story_comments sc WHERE sc.story_id = s.id) AS comment_count
                FROM stories s
                JOIN users u ON u.id = s.user_id
                LEFT JOIN translation_sessions ts ON ts.id = s.session_id
                LEFT JOIN annotations a ON a.id = s.annotation_id
                WHERE {where}
                ORDER BY s.created_at DESC, s.id DESC""",
            params,
        ) as c:
            rows = [dict(r) for r in await c.fetchall()]
        # Live paragraph texts for translation stories (current rendering)
        for story in rows:
            if story["kind"] == "translation" and story["session_id"] is not None:
                async with db.execute(
                    """SELECT paragraph_index, text, model
                       FROM translation_session_paragraphs
                       WHERE session_id = ? AND chapter_index = ?
                         AND paragraph_index BETWEEN ? AND ?
                       ORDER BY paragraph_index""",
                    (story["session_id"], story["chapter_index"],
                     story["paragraph_start"], story["paragraph_end"]),
                ) as c:
                    story["paragraphs"] = [dict(r) for r in await c.fetchall()]
    return rows


async def get_story(story_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM stories WHERE id = ?", (story_id,)) as c:
            row = await c.fetchone()
    return dict(row) if row else None


async def delete_story(story_id: int, user_id: int, is_admin: bool = False) -> bool:
    """Author deletes their own story; admin can unpublish anyone's."""
    async with aiosqlite.connect(DB_PATH) as db:
        if is_admin:
            cursor = await db.execute("DELETE FROM stories WHERE id = ?", (story_id,))
        else:
            cursor = await db.execute(
                "DELETE FROM stories WHERE id = ? AND user_id = ?", (story_id, user_id)
            )
        await db.commit()
        return cursor.rowcount > 0


async def create_story_comment(story_id: int, user_id: int, body: str) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "INSERT INTO story_comments (story_id, user_id, body) VALUES (?, ?, ?)",
            (story_id, user_id, body),
        )
        comment_id = cursor.lastrowid
        await db.commit()
        async with db.execute(
            """SELECT sc.*, u.name AS author_name FROM story_comments sc
               JOIN users u ON u.id = sc.user_id WHERE sc.id = ?""",
            (comment_id,),
        ) as c:
            row = await c.fetchone()
    return dict(row)


async def list_story_comments(story_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT sc.*, u.name AS author_name FROM story_comments sc
               JOIN users u ON u.id = sc.user_id
               WHERE sc.story_id = ? ORDER BY sc.created_at, sc.id""",
            (story_id,),
        ) as c:
            rows = await c.fetchall()
    return [dict(r) for r in rows]


async def delete_story_comment(comment_id: int, user_id: int, is_admin: bool = False) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        if is_admin:
            cursor = await db.execute("DELETE FROM story_comments WHERE id = ?", (comment_id,))
        else:
            cursor = await db.execute(
                "DELETE FROM story_comments WHERE id = ? AND user_id = ?",
                (comment_id, user_id),
            )
        await db.commit()
        return cursor.rowcount > 0


async def list_story_feed(limit: int = 50, follower_id: int | None = None) -> list[dict]:
    """Cross-book recent stories for the Discover feed — same live-reference
    JOIN as list_stories, plus the book title for the feed card. With
    follower_id, only stories from users that reader follows (the
    Following timeline)."""
    follow_clause = (
        "WHERE s.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)"
        if follower_id is not None else ""
    )
    params: tuple = (follower_id, limit) if follower_id is not None else (limit,)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            f"""SELECT s.*, u.name AS author_name,
                      ts.name AS session_name, ts.target_language,
                      a.sentence_text, a.note_text, a.color,
                      b.title AS book_title,
                      (SELECT COUNT(*) FROM story_comments sc WHERE sc.story_id = s.id) AS comment_count
               FROM stories s
               JOIN users u ON u.id = s.user_id
               JOIN books b ON b.id = s.book_id
               LEFT JOIN translation_sessions ts ON ts.id = s.session_id
               LEFT JOIN annotations a ON a.id = s.annotation_id
               {follow_clause}
               ORDER BY s.created_at DESC, s.id DESC
               LIMIT ?""",
            params,
        ) as c:
            rows = [dict(r) for r in await c.fetchall()]
        for story in rows:
            if story["kind"] == "translation" and story["session_id"] is not None:
                async with db.execute(
                    """SELECT paragraph_index, text, model
                       FROM translation_session_paragraphs
                       WHERE session_id = ? AND chapter_index = ?
                         AND paragraph_index BETWEEN ? AND ?
                       ORDER BY paragraph_index""",
                    (story["session_id"], story["chapter_index"],
                     story["paragraph_start"], story["paragraph_end"]),
                ) as c:
                    story["paragraphs"] = [dict(r) for r in await c.fetchall()]
    return rows


# ── Follow graph (owner request 2026-08-27, #2752 extension) ────────────────

async def follow_user(follower_id: int, followee_id: int) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (follower_id, followee_id),
        )
        await db.commit()


async def unfollow_user(follower_id: int, followee_id: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM follows WHERE follower_id = ? AND followee_id = ?",
            (follower_id, followee_id),
        )
        await db.commit()
        return cursor.rowcount > 0


async def list_following(follower_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT u.id, u.name FROM follows f JOIN users u ON u.id = f.followee_id
               WHERE f.follower_id = ? ORDER BY f.created_at DESC""",
            (follower_id,),
        ) as c:
            rows = await c.fetchall()
    return [dict(r) for r in rows]
