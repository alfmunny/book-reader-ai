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
    # Make sure the parent directory exists. Important on first run after
    # mounting a Railway volume at e.g. /app/data — the mount point exists
    # but no books.db file does yet, and SQLite needs the directory to be
    # present before it can create the file.
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS books (
                id            INTEGER PRIMARY KEY,
                title         TEXT,
                authors       TEXT,
                languages     TEXT,
                subjects      TEXT,
                download_count INTEGER DEFAULT 0,
                cover         TEXT,
                text          TEXT,
                cached_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                google_id  TEXT UNIQUE NOT NULL,
                email      TEXT,
                name       TEXT,
                picture    TEXT,
                gemini_key TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Migration: add images column if it doesn't exist yet
        try:
            await db.execute("ALTER TABLE books ADD COLUMN images TEXT DEFAULT '[]'")
            await db.commit()
        except Exception:
            pass  # column already exists
        await db.execute("""
            CREATE TABLE IF NOT EXISTS translations (
                book_id        INTEGER NOT NULL,
                chapter_index  INTEGER NOT NULL,
                target_language TEXT NOT NULL,
                paragraphs     TEXT NOT NULL,
                created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (book_id, chapter_index, target_language)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS audiobooks (
                book_id      INTEGER PRIMARY KEY,
                librivox_id  TEXT NOT NULL,
                title        TEXT,
                authors      TEXT,
                url_librivox TEXT,
                url_rss      TEXT,
                sections     TEXT,
                saved_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()


async def get_or_create_user(google_id: str, email: str, name: str, picture: str) -> dict:
    """Return existing user or create a new one. Returns the user dict."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE google_id = ?", (google_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if row:
            # Update name/picture in case they changed
            await db.execute(
                "UPDATE users SET email=?, name=?, picture=? WHERE google_id=?",
                (email, name, picture, google_id),
            )
            await db.commit()
            return dict(row)
        await db.execute(
            "INSERT INTO users (google_id, email, name, picture) VALUES (?,?,?,?)",
            (google_id, email, name, picture),
        )
        await db.commit()
        async with db.execute(
            "SELECT * FROM users WHERE google_id = ?", (google_id,)
        ) as cursor:
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


async def save_translation(book_id: int, chapter_index: int, target_language: str, paragraphs: list[str]) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO translations (book_id, chapter_index, target_language, paragraphs)
            VALUES (?, ?, ?, ?)
            """,
            (book_id, chapter_index, target_language, json.dumps(paragraphs)),
        )
        await db.commit()


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
    """Insert or replace a book record (meta + full text + images)."""
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
