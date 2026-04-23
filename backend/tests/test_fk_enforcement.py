"""Tests for PRAGMA foreign_keys enforcement (issue #700 / #748).

Covers:
  - Every new aiosqlite connection comes up with foreign_keys = ON.
  - Cascade deletes fire without a shadow DELETE in the handler.
  - The migration runner's FK-off window does not leak to app connections.
"""

import aiosqlite
import pytest

import services.db as db_module


async def test_connection_has_fk_on(tmp_db):
    """Every connection created via the patched aiosqlite.connect must
    return foreign_keys=1 immediately after it's opened."""
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("PRAGMA foreign_keys") as cur:
            assert (await cur.fetchone())[0] == 1


async def test_cascade_delete_vocabulary_fires_for_word_occurrences(tmp_db, test_user):
    """Deleting a vocabulary row cascades to word_occurrences without any
    manual DELETE — proves ON DELETE CASCADE is doing its job."""
    # Seed a book + a word + one occurrence directly.
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO books (id, title, images) VALUES (9801, 'T', '[]')"
        )
        await db.execute(
            "INSERT INTO vocabulary (user_id, word) VALUES (?, 'x')",
            (test_user["id"],),
        )
        async with db.execute("SELECT last_insert_rowid()") as cur:
            vid = (await cur.fetchone())[0]
        await db.execute(
            "INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text) "
            "VALUES (?, 9801, 0, 's')",
            (vid,),
        )
        await db.commit()

        # Raw DELETE — no manual child cleanup. Cascade MUST kick in.
        await db.execute("DELETE FROM vocabulary WHERE id = ?", (vid,))
        await db.commit()

        async with db.execute(
            "SELECT COUNT(*) FROM word_occurrences WHERE vocabulary_id = ?",
            (vid,),
        ) as cur:
            assert (await cur.fetchone())[0] == 0


async def test_cascade_delete_user_removes_reading_progress(tmp_db):
    """users.id deletion cascades into user_reading_progress via declared FK."""
    from services.db import get_or_create_user
    u = await get_or_create_user("fkc-u", "fkc@ex.com", "U", "")
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO books (id, title, images) VALUES (9802, 'B', '[]')"
        )
        await db.execute(
            "INSERT INTO user_reading_progress (user_id, book_id, chapter_index) "
            "VALUES (?, 9802, 3)",
            (u["id"],),
        )
        await db.commit()

        await db.execute("DELETE FROM users WHERE id = ?", (u["id"],))
        await db.commit()

        async with db.execute(
            "SELECT COUNT(*) FROM user_reading_progress WHERE user_id = ?",
            (u["id"],),
        ) as cur:
            assert (await cur.fetchone())[0] == 0


async def test_migrations_run_without_raising_on_fk_violations(tmp_path):
    """Migration runner must disable FK enforcement for its own connection —
    otherwise the 010_rate_limiter_per_model pattern (CREATE new / INSERT
    SELECT / DROP old / RENAME) would crash mid-rewrite. We prove this by
    running a fresh migration chain: if the runner left FK on, 010 would
    raise a FOREIGN KEY constraint failure somewhere in the sequence.
    """
    from services.migrations import run as run_migrations

    db_file = str(tmp_path / "mig.db")

    # Should not raise. If the runner's FK-off window is missing, some
    # declared-FK + insert-select migration would trip.
    applied = await run_migrations(db_file)
    assert any(v.startswith("010_") for v in applied)
    assert any(v.startswith("028_") for v in applied)


async def test_app_connection_fk_on_after_migrations(tmp_db):
    """After init_db (which ran migrations with FK off), the next connection
    opened by application code must come back with FK on — the runner's
    FK-off window must not leak."""
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("PRAGMA foreign_keys") as cur:
            assert (await cur.fetchone())[0] == 1
