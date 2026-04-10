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

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "books.db")


async def init_db() -> None:
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
    return d


async def save_book(book_id: int, meta: dict, text: str) -> None:
    """Insert or replace a book record (meta + full text)."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO books
                (id, title, authors, languages, subjects, download_count, cover, text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
            ),
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
