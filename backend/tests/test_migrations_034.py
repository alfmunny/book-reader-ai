"""Tests for migration 034 (declared FKs on word_occurrences + translation_queue).

Split into its own file because the shared `tmp_db` fixture in
`test_migrations.py` is the integration point for every earlier migration
test; adding migration-specific assertions there keeps per-PR test runs
readable. The fixture here is a minimal copy of the one used elsewhere.
"""

import os
import pytest
import aiosqlite

from services.migrations import run as run_migrations


@pytest.fixture
async def tmp_db(tmp_path):
    path = str(tmp_path / "migration-034-test.db")
    return path


async def test_migration_034_cleans_orphan_word_occurrences_and_queue(tmp_db):
    """Seed rows pointing at missing books, re-run migration 034, confirm the
    pre-rewrite orphan DELETEs wiped them so the subsequent INSERT INTO _new
    SELECT … does not violate the new FK."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (1, 'g1', 'a@b.com', 'A', '')"
        )
        await db.execute("INSERT INTO books (id, title, images) VALUES (1400, 'Book', '[]')")
        await db.execute(
            "INSERT INTO vocabulary (user_id, word, language) VALUES (1, 'Hund', 'de')"
        )
        async with db.execute("SELECT id FROM vocabulary WHERE word='Hund'") as cur:
            vocab_id = (await cur.fetchone())[0]

        # Valid parent — these rows should survive.
        await db.execute(
            "INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text) "
            "VALUES (?, 1400, 0, 'sample')",
            (vocab_id,),
        )
        await db.execute(
            "INSERT INTO translation_queue (book_id, chapter_index, target_language, status) "
            "VALUES (1400, 0, 'de', 'pending')"
        )
        # Orphan rows — bogus book ids.
        await db.execute(
            "INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text) "
            "VALUES (?, 9993, 0, 'orphan')",
            (vocab_id,),
        )
        await db.execute(
            "INSERT INTO translation_queue (book_id, chapter_index, target_language, status) "
            "VALUES (9994, 0, 'en', 'pending')"
        )
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '034_fk_word_occurrences_translation_queue'"
        )
        await db.commit()

    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT book_id FROM word_occurrences ORDER BY book_id"
        ) as cur:
            rows = [r[0] for r in await cur.fetchall()]
        assert rows == [1400], f"only valid word_occurrence should survive; got {rows}"

        async with db.execute(
            "SELECT book_id FROM translation_queue ORDER BY book_id"
        ) as cur:
            rows = [r[0] for r in await cur.fetchall()]
        assert rows == [1400], f"only valid queue row should survive; got {rows}"


async def test_migration_034_word_occurrences_carries_both_fks(tmp_db):
    """word_occurrences keeps its vocabulary_id FK (migration 014) and gains
    the books FK."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("PRAGMA foreign_key_list(word_occurrences)") as cur:
            fks = await cur.fetchall()

    fk_map = {(row[2], row[3]): (row[4], row[5], row[6]) for row in fks}
    assert ("vocabulary", "vocabulary_id") in fk_map, f"missing vocabulary FK: {fk_map}"
    assert ("books", "book_id") in fk_map, f"missing books FK: {fk_map}"
    assert fk_map[("vocabulary", "vocabulary_id")][2] == "CASCADE"
    assert fk_map[("books", "book_id")][2] == "CASCADE"


async def test_migration_034_translation_queue_carries_declared_fk(tmp_db):
    """translation_queue gets REFERENCES books(id) ON DELETE CASCADE."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("PRAGMA foreign_key_list(translation_queue)") as cur:
            fks = await cur.fetchall()

    fk_map = {(row[2], row[3]): (row[4], row[5], row[6]) for row in fks}
    assert ("books", "book_id") in fk_map, f"missing books FK: {fk_map}"
    assert fk_map[("books", "book_id")][2] == "CASCADE"


async def test_migration_034_preserves_existing_rows(tmp_db):
    """INSERT … SELECT must round-trip every column including the
    migration-009 appended queued_by on translation_queue."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (2, 'g2', 'b@b.com', 'B', '')"
        )
        await db.execute("INSERT INTO books (id, title, images) VALUES (1500, 'T', '[]')")
        await db.execute(
            "INSERT INTO vocabulary (user_id, word, language) VALUES (2, 'Haus', 'de')"
        )
        async with db.execute("SELECT id FROM vocabulary WHERE word='Haus'") as cur:
            vocab_id = (await cur.fetchone())[0]

        await db.execute(
            "INSERT INTO word_occurrences "
            "(id, vocabulary_id, book_id, chapter_index, sentence_text) "
            "VALUES (500, ?, 1500, 3, 'Ein Haus')",
            (vocab_id,),
        )
        await db.execute(
            "INSERT INTO translation_queue "
            "(id, book_id, chapter_index, target_language, status, priority, "
            "attempts, last_error, queued_by) VALUES "
            "(500, 1500, 3, 'de', 'done', 5, 1, NULL, 'admin@example.com')"
        )
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '034_fk_word_occurrences_translation_queue'"
        )
        await db.commit()

    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT vocabulary_id, book_id, chapter_index, sentence_text "
            "FROM word_occurrences WHERE id = 500"
        ) as cur:
            row = await cur.fetchone()
        assert row == (vocab_id, 1500, 3, "Ein Haus")

        async with db.execute(
            "SELECT book_id, chapter_index, target_language, status, priority, "
            "attempts, queued_by FROM translation_queue WHERE id = 500"
        ) as cur:
            row = await cur.fetchone()
        assert row == (1500, 3, "de", "done", 5, 1, "admin@example.com")


async def test_migration_034_preserves_unique_constraints(tmp_db):
    """The UNIQUE index on word_occurrences (migration 015) and the UNIQUE
    constraint on translation_queue (migration 008) must survive the rewrite."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (3, 'g3', 'c@b.com', 'C', '')"
        )
        await db.execute("INSERT INTO books (id, title, images) VALUES (1600, 'T', '[]')")
        await db.execute(
            "INSERT INTO vocabulary (user_id, word, language) VALUES (3, 'Katze', 'de')"
        )
        async with db.execute("SELECT id FROM vocabulary WHERE word='Katze'") as cur:
            vocab_id = (await cur.fetchone())[0]

        await db.execute(
            "INSERT INTO word_occurrences "
            "(vocabulary_id, book_id, chapter_index, sentence_text) "
            "VALUES (?, 1600, 0, 'Eine Katze')",
            (vocab_id,),
        )
        await db.commit()

        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "INSERT INTO word_occurrences "
                "(vocabulary_id, book_id, chapter_index, sentence_text) "
                "VALUES (?, 1600, 0, 'Eine Katze')",
                (vocab_id,),
            )
            await db.commit()

        await db.execute(
            "INSERT INTO translation_queue "
            "(book_id, chapter_index, target_language, status) "
            "VALUES (1600, 0, 'zh', 'pending')"
        )
        await db.commit()

        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "INSERT INTO translation_queue "
                "(book_id, chapter_index, target_language, status) "
                "VALUES (1600, 0, 'zh', 'running')"
            )
            await db.commit()


async def test_migration_034_cascade_deletes_on_book_delete(tmp_db):
    """DELETE FROM books must cascade to word_occurrences and translation_queue
    via the new book_id FKs."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (4, 'g4', 'd@b.com', 'D', '')"
        )
        await db.execute("INSERT INTO books (id, title, images) VALUES (1700, 'T', '[]')")
        await db.execute(
            "INSERT INTO vocabulary (user_id, word, language) VALUES (4, 'Buch', 'de')"
        )
        async with db.execute("SELECT id FROM vocabulary WHERE word='Buch'") as cur:
            vocab_id = (await cur.fetchone())[0]

        await db.execute(
            "INSERT INTO word_occurrences "
            "(vocabulary_id, book_id, chapter_index, sentence_text) "
            "VALUES (?, 1700, 0, 'Ein Buch')",
            (vocab_id,),
        )
        await db.execute(
            "INSERT INTO translation_queue "
            "(book_id, chapter_index, target_language, status) "
            "VALUES (1700, 0, 'en', 'pending')"
        )
        await db.commit()

        await db.execute("DELETE FROM books WHERE id = 1700")
        await db.commit()

        async with db.execute(
            "SELECT COUNT(*) FROM word_occurrences WHERE book_id = 1700"
        ) as cur:
            assert (await cur.fetchone())[0] == 0
        async with db.execute(
            "SELECT COUNT(*) FROM translation_queue WHERE book_id = 1700"
        ) as cur:
            assert (await cur.fetchone())[0] == 0
