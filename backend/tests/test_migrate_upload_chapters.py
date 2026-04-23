"""Tests for the two-phase migrate_upload_chapters.py helper (issue #357)."""
from __future__ import annotations

import json

import aiosqlite
import pytest

from scripts.migrate_upload_chapters import copy_phase, finalize_phase
from services.migrations import run as run_migrations


@pytest.fixture
def tmp_db(tmp_path):
    return str(tmp_path / "test.db")


async def _seed_upload(db: aiosqlite.Connection, book_id: int, payload: dict) -> None:
    """Insert an uploaded book with JSON-in-text (legacy encoding)."""
    await db.execute(
        "INSERT INTO books (id, title, source, text) VALUES (?, ?, 'upload', ?)",
        (book_id, f"book-{book_id}", json.dumps(payload)),
    )


async def test_copy_phase_copies_chapters_and_leaves_books_text_intact(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_upload(db, 1, {
            "draft": False,
            "chapters": [
                {"title": "C1", "text": "text1"},
                {"title": "C2", "text": "text2"},
            ],
        })
        await db.commit()

        processed = await copy_phase(db)
        await db.commit()

        assert processed == 1
        async with db.execute(
            "SELECT chapter_index, title, text, is_draft FROM user_book_chapters "
            "WHERE book_id=1 ORDER BY chapter_index"
        ) as cur:
            rows = await cur.fetchall()
        assert rows == [(0, "C1", "text1", 0), (1, "C2", "text2", 0)]

        # books.text is NOT cleared in the copy phase — rollback safety.
        async with db.execute("SELECT text FROM books WHERE id=1") as cur:
            text = (await cur.fetchone())[0]
        assert text.startswith("{")


async def test_copy_phase_marks_draft_correctly(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_upload(db, 2, {
            "draft": True,
            "chapters": [{"title": "C1", "text": "t"}],
        })
        await db.commit()
        await copy_phase(db)
        await db.commit()
        async with db.execute(
            "SELECT is_draft FROM user_book_chapters WHERE book_id=2"
        ) as cur:
            assert (await cur.fetchone())[0] == 1


async def test_copy_phase_is_idempotent(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_upload(db, 3, {
            "draft": False,
            "chapters": [{"title": "C1", "text": "t"}],
        })
        await db.commit()
        await copy_phase(db)
        await db.commit()
        await copy_phase(db)
        await db.commit()
        async with db.execute(
            "SELECT COUNT(*) FROM user_book_chapters WHERE book_id=3"
        ) as cur:
            assert (await cur.fetchone())[0] == 1


async def test_copy_phase_skips_non_upload_books(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO books (id, title, source, text) VALUES (4, 'gute', 'gutenberg', 'plain text')"
        )
        await db.commit()
        processed = await copy_phase(db)
        await db.commit()
        assert processed == 0
        async with db.execute(
            "SELECT COUNT(*) FROM user_book_chapters WHERE book_id=4"
        ) as cur:
            assert (await cur.fetchone())[0] == 0


async def test_copy_phase_skips_books_already_cleared(tmp_db):
    """A second deploy wave must not re-copy data into already-cleared books."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        # Upload row with books.text=''. copy_phase should not touch it (filter LIKE '{%').
        await db.execute(
            "INSERT INTO books (id, title, source, text) VALUES (5, 'x', 'upload', '')"
        )
        await db.commit()
        processed = await copy_phase(db)
        await db.commit()
        assert processed == 0


async def test_copy_phase_handles_corrupt_json_gracefully(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO books (id, title, source, text) VALUES (6, 'x', 'upload', '{garbage')"
        )
        await db.commit()
        processed = await copy_phase(db)
        await db.commit()
        # Corrupt JSON is skipped silently — returned count reflects books with chapters processed.
        assert processed == 0
        async with db.execute(
            "SELECT COUNT(*) FROM user_book_chapters WHERE book_id=6"
        ) as cur:
            assert (await cur.fetchone())[0] == 0


async def test_finalize_phase_clears_only_migrated_books(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        # Migrated upload (has rows in user_book_chapters)
        await _seed_upload(db, 7, {
            "draft": False,
            "chapters": [{"title": "C1", "text": "t"}],
        })
        # Upload that has NOT been through copy_phase (no rows in user_book_chapters)
        await _seed_upload(db, 8, {
            "draft": False,
            "chapters": [{"title": "C1", "text": "t"}],
        })
        # Gutenberg book with plain text — must never be touched
        await db.execute(
            "INSERT INTO books (id, title, source, text) VALUES (9, 'g', 'gutenberg', 'plain')"
        )
        await db.commit()

        await copy_phase(db)
        # Simulate: only book 8's data got copied via some other path, but book 7 was NOT.
        # We overwrite: actually simpler — remove book 8's user_book_chapters rows to
        # simulate the "not yet copied" state.
        await db.execute("DELETE FROM user_book_chapters WHERE book_id=8")
        await db.commit()

        cleared = await finalize_phase(db)
        await db.commit()

        # Only book 7 should be cleared.
        assert cleared == 1
        async with db.execute("SELECT id, text FROM books ORDER BY id") as cur:
            rows = await cur.fetchall()
        texts = {row[0]: row[1] for row in rows}
        assert texts[7] == ""
        assert texts[8].startswith("{")
        assert texts[9] == "plain"


async def test_finalize_phase_is_idempotent(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_upload(db, 10, {
            "draft": False,
            "chapters": [{"title": "C1", "text": "t"}],
        })
        await db.commit()
        await copy_phase(db)
        await finalize_phase(db)
        await db.commit()
        cleared_second = await finalize_phase(db)
        await db.commit()
        assert cleared_second == 0
