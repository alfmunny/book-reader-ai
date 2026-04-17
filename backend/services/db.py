"""
SQLite book cache.

Schema
------
books: id, title, authors (JSON), languages (JSON), subjects (JSON),
       download_count, cover, text, cached_at
"""

import json
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
            return dict(row)

        # New user — check if this is the very first user (auto-admin)
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            count = (await cursor.fetchone())[0]
        is_first = count == 0

        await db.execute(
            "INSERT INTO users (google_id, email, name, picture, role, approved) VALUES (?,?,?,?,?,?)",
            (google_id, email, name, picture,
             "admin" if is_first else "user",
             1 if is_first else 0),
        )
        await db.commit()
        async with db.execute(
            "SELECT * FROM users WHERE google_id = ?", (google_id,)
        ) as cursor:
            row = await cursor.fetchone()
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
            return dict(row)

        # Try linking to existing account by email (user signed in via Google before)
        if email:
            async with db.execute("SELECT * FROM users WHERE email = ?", (email,)) as cursor:
                row = await cursor.fetchone()
            if row:
                await db.execute(
                    "UPDATE users SET github_id=?, name=?, picture=? WHERE id=?",
                    (github_id, name, picture, row["id"]),
                )
                await db.commit()
                return dict(row)

        # New user
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            count = (await cursor.fetchone())[0]
        is_first = count == 0

        await db.execute(
            "INSERT INTO users (google_id, github_id, email, name, picture, role, approved) VALUES (?,?,?,?,?,?,?)",
            (f"github:{github_id}", github_id, email, name, picture,
             "admin" if is_first else "user",
             1 if is_first else 0),
        )
        await db.commit()
        async with db.execute("SELECT * FROM users WHERE github_id = ?", (github_id,)) as cursor:
            row = await cursor.fetchone()
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
                await db.commit()
            async with db.execute("SELECT * FROM users WHERE apple_id = ?", (apple_id,)) as cursor:
                row = await cursor.fetchone()
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
                return dict(row)

        # New user
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            count = (await cursor.fetchone())[0]
        is_first = count == 0

        await db.execute(
            "INSERT INTO users (google_id, apple_id, email, name, role, approved) VALUES (?,?,?,?,?,?)",
            (f"apple:{apple_id}", apple_id, email, name,
             "admin" if is_first else "user",
             1 if is_first else 0),
        )
        await db.commit()
        async with db.execute("SELECT * FROM users WHERE apple_id = ?", (apple_id,)) as cursor:
            row = await cursor.fetchone()
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
        await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await db.commit()


async def set_user_gemini_key(user_id: int, encrypted_key: str | None) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET gemini_key = ? WHERE id = ?",
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
    """Like get_cached_translation, but also returns provider/model metadata."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT paragraphs, provider, model FROM translations
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
    }


async def save_translation(
    book_id: int,
    chapter_index: int,
    target_language: str,
    paragraphs: list[str],
    *,
    provider: str | None = None,
    model: str | None = None,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO translations
              (book_id, chapter_index, target_language, paragraphs, provider, model)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (book_id, chapter_index, target_language,
             json.dumps(paragraphs), provider, model),
        )
        await db.commit()


async def count_translations_for_book(book_id: int, target_language: str) -> int:
    """Count how many chapters of a book have a translation cached."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM translations WHERE book_id=? AND target_language=?",
            (book_id, target_language),
        ) as cursor:
            row = await cursor.fetchone()
    return row[0] if row else 0


# ── Audio cache (whole-chapter TTS output) ────────────────────────────────────

async def get_cached_audio(
    book_id: int,
    chapter_index: int,
    provider: str,
    voice: str,
    chunk_index: int = 0,
) -> tuple[bytes, str] | None:
    """Return (audio_bytes, content_type) for a cached chunk, or None on miss."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """
            SELECT audio, content_type FROM audio_cache
            WHERE book_id=? AND chapter_index=? AND chunk_index=? AND provider=? AND voice=?
            """,
            (book_id, chapter_index, chunk_index, provider, voice),
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        return None
    return row[0], row[1]


async def save_audio(
    book_id: int,
    chapter_index: int,
    provider: str,
    voice: str,
    audio: bytes,
    content_type: str,
    chunk_index: int = 0,
) -> None:
    """Insert or replace one cached audio chunk."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO audio_cache
                (book_id, chapter_index, chunk_index, provider, voice, content_type, audio)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (book_id, chapter_index, chunk_index, provider, voice, content_type, audio),
        )
        await db.commit()


async def delete_chapter_audio_cache(book_id: int, chapter_index: int) -> int:
    """Delete all cached audio chunks for one chapter (across all providers/voices).

    Returns the number of rows deleted. Used by the Regenerate button to
    force a fresh TTS generation pass on the next Read click.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM audio_cache WHERE book_id=? AND chapter_index=?",
            (book_id, chapter_index),
        )
        await db.commit()
        return cursor.rowcount


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
    """Insert or replace a book record (meta + full text + images).

    After saving, the translation queue is auto-seeded with this book's
    chapters for every configured target language. The worker (if running)
    will pick them up on its next tick.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO books
                (id, title, authors, languages, subjects, download_count, cover, text, images)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                book_id,
                meta.get("title", ""),
                json.dumps(meta.get("authors", [])),
                json.dumps(meta.get("languages", [])),
                json.dumps(meta.get("subjects", [])),
                meta.get("download_count", 0),
                meta.get("cover", ""),
                text,
                json.dumps(images or []),
            ),
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


async def get_audiobook(book_id: int) -> dict | None:
    """Return the saved audiobook for a Gutenberg book, or None."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM audiobooks WHERE book_id = ?", (book_id,)
        ) as cursor:
            row = await cursor.fetchone()
    if row is None:
        return None
    d = dict(row)
    for field in ("authors", "sections"):
        if isinstance(d.get(field), str):
            d[field] = json.loads(d[field])
    return d


async def save_audiobook(book_id: int, audiobook: dict) -> None:
    """Insert or replace audiobook association."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO audiobooks
                (book_id, librivox_id, title, authors, url_librivox, url_rss, sections)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                book_id,
                audiobook.get("id", ""),
                audiobook.get("title", ""),
                json.dumps(audiobook.get("authors", [])),
                audiobook.get("url_librivox", ""),
                audiobook.get("url_rss", ""),
                json.dumps(audiobook.get("sections", [])),
            ),
        )
        await db.commit()


async def delete_audiobook(book_id: int) -> None:
    """Remove the audiobook association for a book."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM audiobooks WHERE book_id = ?", (book_id,))
        await db.commit()


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


async def list_cached_books() -> list[dict]:
    """Return all cached books (without text field)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, title, authors, languages, subjects, download_count, cover, cached_at FROM books ORDER BY cached_at DESC"
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
