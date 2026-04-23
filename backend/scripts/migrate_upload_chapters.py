"""One-time migration: move JSON chapters from books.text to user_book_chapters.

Run in two phases (both idempotent):

    # Phase 1 — copy rows into the new table (books.text untouched)
    python -m backend.scripts.migrate_upload_chapters

    # Phase 2 — clear books.text after the new router code is stable
    python -m backend.scripts.migrate_upload_chapters --finalize

The two-phase split keeps the rollback path safe: if the router deploy that
reads from user_book_chapters fails, books.text is still intact and the old
code path keeps working.

See docs/design/user-book-chapters.md for the full deployment checklist.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

import aiosqlite


def _resolve_db_path() -> str:
    """Resolve the DB path the same way services.db does."""
    return os.environ.get(
        "DB_PATH",
        os.path.join(os.path.dirname(__file__), "..", "books.db"),
    )


async def copy_phase(db: aiosqlite.Connection) -> int:
    """Copy upload-book JSON into user_book_chapters. Returns count of books processed."""
    async with db.execute(
        "SELECT id, text FROM books WHERE source='upload' AND text LIKE '{%'"
    ) as cur:
        rows = await cur.fetchall()

    copied = 0
    for book_id, text in rows:
        try:
            data = json.loads(text)
        except (ValueError, TypeError):
            continue
        chapters = data.get("chapters") or []
        is_draft = 1 if data.get("draft") else 0
        for i, ch in enumerate(chapters):
            if not isinstance(ch, dict):
                continue
            await db.execute(
                """INSERT OR IGNORE INTO user_book_chapters
                   (book_id, chapter_index, title, text, is_draft)
                   VALUES (?, ?, ?, ?, ?)""",
                (book_id, i, ch.get("title", "") or "", ch.get("text", "") or "", is_draft),
            )
        copied += 1
    return copied


async def finalize_phase(db: aiosqlite.Connection) -> int:
    """Clear books.text for uploads that already have rows in user_book_chapters."""
    async with db.execute(
        """UPDATE books
           SET text = ''
           WHERE source = 'upload'
             AND text LIKE '{%'
             AND EXISTS (
                 SELECT 1 FROM user_book_chapters WHERE book_id = books.id
             )"""
    ) as cur:
        return cur.rowcount or 0


async def run(db_path: str, finalize: bool) -> None:
    async with aiosqlite.connect(db_path) as db:
        copied = await copy_phase(db)
        print(f"copy phase: {copied} upload book(s) processed")
        if finalize:
            cleared = await finalize_phase(db)
            print(f"finalize phase: books.text cleared for {cleared} book(s)")
        await db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--finalize",
        action="store_true",
        help="After the new router deploy is stable, clear books.text for migrated uploads.",
    )
    parser.add_argument(
        "--db-path",
        default=None,
        help="SQLite file (defaults to $DB_PATH or backend/books.db)",
    )
    args = parser.parse_args()
    db_path = args.db_path or _resolve_db_path()
    if not os.path.exists(db_path):
        print(f"error: database not found at {db_path}", file=sys.stderr)
        sys.exit(1)
    asyncio.run(run(db_path, args.finalize))


if __name__ == "__main__":
    main()
