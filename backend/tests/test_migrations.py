"""
Thorough tests for services/migrations.py — the versioned SQL migration runner.

Covers:
  - Fresh DB: all migrations applied in order
  - Running twice: idempotent, no-op on second run
  - Partially-migrated DB: only new migrations applied
  - Existing DB without schema_migrations: bootstrap marks old migrations done
  - Migration with SQL error: rolls back, raises, doesn't record version
  - Empty migration file: skipped silently
  - schema_migrations tracks versions correctly
  - init_db() integration: tables exist and are usable after init
"""

import os
import pytest
import aiosqlite
import tempfile
import shutil

import services.db as db_module
from services.db import init_db, get_or_create_user, save_book, get_cached_book
from services.migrations import run as run_migrations


@pytest.fixture
def tmp_db(tmp_path):
    """Return a fresh DB path (file does not exist yet)."""
    return str(tmp_path / "test.db")


@pytest.fixture
def tmp_migrations(tmp_path):
    """Create a temporary migrations directory and return its path.
    Tests that need custom migrations write files into it.
    """
    d = tmp_path / "migrations"
    d.mkdir()
    return str(d)


# ── Fresh DB: all migrations applied ──────────────────────────────────────────

async def test_fresh_db_applies_all_migrations(tmp_db):
    """On a brand-new database, run() should apply every migration file and
    return the list of versions applied."""
    applied = await run_migrations(tmp_db)
    assert len(applied) >= 3
    assert "001_initial_schema" in applied
    assert "002_add_book_images" in applied
    assert "003_create_audio_cache" in applied

    # Tables should now exist and be usable
    async with aiosqlite.connect(tmp_db) as db:
        # books table with images column
        await db.execute("INSERT INTO books (id, title, images) VALUES (1, 'Test', '[]')")
        await db.commit()
        async with db.execute("SELECT images FROM books WHERE id=1") as cursor:
            row = await cursor.fetchone()
        assert row[0] == "[]"

        # users table
        await db.execute(
            "INSERT INTO users (google_id, email, name, picture) VALUES ('g1','a@b.com','A','')"
        )
        await db.commit()

        # translations table
        await db.execute(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
            "VALUES (1, 0, 'en', '[]')"
        )
        await db.commit()

        # audiobooks table
        await db.execute(
            "INSERT INTO audiobooks (book_id, librivox_id) VALUES (1, 'lv-1')"
        )
        await db.commit()

        # audio_cache table with chunk_index in the PK
        await db.execute(
            "INSERT INTO audio_cache (book_id, chapter_index, chunk_index, provider, voice, "
            "content_type, audio) VALUES (1, 0, 0, 'edge', 'v1', 'audio/mpeg', X'00')"
        )
        await db.execute(
            "INSERT INTO audio_cache (book_id, chapter_index, chunk_index, provider, voice, "
            "content_type, audio) VALUES (1, 0, 1, 'edge', 'v1', 'audio/mpeg', X'01')"
        )
        await db.commit()


async def test_schema_migrations_table_records_versions(tmp_db):
    """After run(), the schema_migrations table should contain every applied version."""
    applied = await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT version FROM schema_migrations ORDER BY version"
        ) as cursor:
            versions = [row[0] async for row in cursor]

    assert versions == sorted(applied)


# ── Running twice: idempotent ─────────────────────────────────────────────────

async def test_running_twice_is_noop(tmp_db):
    """Second run should return empty list and not touch the DB."""
    first = await run_migrations(tmp_db)
    assert len(first) >= 3

    second = await run_migrations(tmp_db)
    assert second == []


async def test_running_twice_does_not_duplicate_schema_migrations(tmp_db):
    await run_migrations(tmp_db)
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT COUNT(*) FROM schema_migrations") as cursor:
            count = (await cursor.fetchone())[0]

    # Should be exactly the number of migration files, not doubled
    migration_count = len([
        f for f in os.listdir(os.path.join(os.path.dirname(__file__), "..", "migrations"))
        if f.endswith(".sql")
    ])
    assert count == migration_count


# ── Partially-migrated DB: only new migrations applied ───────────────────────

async def test_partially_migrated_db_applies_only_new(tmp_db):
    """If some migrations have already been applied, only the remaining ones run."""
    # Apply just the first one manually
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Pretend migration 001 is done
        await db.execute("INSERT INTO schema_migrations (version) VALUES ('001_initial_schema')")
        # Create the tables that 001 would have created
        await db.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT)")
        await db.execute("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_id TEXT UNIQUE NOT NULL,
                email TEXT, name TEXT, picture TEXT, gemini_key TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE translations (
                book_id INTEGER NOT NULL, chapter_index INTEGER NOT NULL,
                target_language TEXT NOT NULL, paragraphs TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (book_id, chapter_index, target_language)
            )
        """)
        await db.execute("""
            CREATE TABLE audiobooks (
                book_id INTEGER PRIMARY KEY, librivox_id TEXT NOT NULL,
                title TEXT, authors TEXT, url_librivox TEXT, url_rss TEXT,
                sections TEXT, saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()

    applied = await run_migrations(tmp_db)
    assert "001_initial_schema" not in applied
    assert "002_add_book_images" in applied
    assert "003_create_audio_cache" in applied


# ── Existing DB without schema_migrations (bootstrap) ─────────────────────────

async def test_existing_db_bootstrap_marks_old_migrations_done(tmp_db):
    """An existing DB created by the old init_db() has tables but no
    schema_migrations table. The runner should detect this and mark
    all known migrations as already applied without re-running them."""
    # Simulate the old init_db() — create tables directly
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, images TEXT)")
        await db.execute("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT, google_id TEXT UNIQUE NOT NULL,
                email TEXT, name TEXT, picture TEXT, gemini_key TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE translations (
                book_id INTEGER NOT NULL, chapter_index INTEGER NOT NULL,
                target_language TEXT NOT NULL, paragraphs TEXT NOT NULL,
                PRIMARY KEY (book_id, chapter_index, target_language)
            )
        """)
        await db.execute("""
            CREATE TABLE audiobooks (book_id INTEGER PRIMARY KEY, librivox_id TEXT NOT NULL)
        """)
        await db.execute("""
            CREATE TABLE audio_cache (
                book_id INTEGER NOT NULL, chapter_index INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL DEFAULT 0,
                provider TEXT NOT NULL, voice TEXT NOT NULL,
                content_type TEXT NOT NULL, audio BLOB NOT NULL,
                PRIMARY KEY (book_id, chapter_index, chunk_index, provider, voice)
            )
        """)
        await db.commit()

    applied = await run_migrations(tmp_db)
    # Bootstrap should have marked all 3 as done
    assert applied == []

    # Verify schema_migrations contains the bootstrapped versions
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT version FROM schema_migrations ORDER BY version") as cursor:
            versions = [row[0] async for row in cursor]
    assert "001_initial_schema" in versions
    assert "002_add_book_images" in versions
    assert "003_create_audio_cache" in versions


async def test_bootstrap_does_not_trigger_on_fresh_db(tmp_db):
    """Bootstrap only fires when the `books` table already exists. On a
    truly fresh DB, all migrations should actually run."""
    applied = await run_migrations(tmp_db)
    assert len(applied) >= 3
    assert "001_initial_schema" in applied


# ── Migration with SQL error ──────────────────────────────────────────────────

async def test_bad_migration_rolls_back_and_raises(tmp_db, tmp_migrations, monkeypatch):
    """A migration with a SQL syntax error should roll back and raise,
    and the version should NOT be recorded in schema_migrations."""
    # Write a good migration + a bad one
    (open(os.path.join(tmp_migrations, "001_good.sql"), "w")).write(
        "CREATE TABLE test_table (id INTEGER PRIMARY KEY);"
    )
    (open(os.path.join(tmp_migrations, "002_bad.sql"), "w")).write(
        "THIS IS NOT VALID SQL;"
    )

    # Point the runner at our custom migrations dir
    monkeypatch.setattr("services.migrations._MIGRATIONS_DIR", tmp_migrations)

    with pytest.raises(Exception):
        await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        # 001 was applied before the failure
        async with db.execute("SELECT version FROM schema_migrations") as cursor:
            versions = [row[0] async for row in cursor]
        assert "001_good" in versions
        assert "002_bad" not in versions

        # test_table from 001 should exist
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'"
        ) as cursor:
            assert await cursor.fetchone() is not None


# ── Empty migration file ──────────────────────────────────────────────────────

async def test_empty_migration_file_is_skipped(tmp_db, tmp_migrations, monkeypatch):
    """An empty .sql file should be skipped silently."""
    (open(os.path.join(tmp_migrations, "001_empty.sql"), "w")).write("")
    (open(os.path.join(tmp_migrations, "002_real.sql"), "w")).write(
        "CREATE TABLE real_table (id INTEGER PRIMARY KEY);"
    )

    monkeypatch.setattr("services.migrations._MIGRATIONS_DIR", tmp_migrations)
    applied = await run_migrations(tmp_db)

    # The empty one should NOT appear in applied
    assert "001_empty" not in applied
    assert "002_real" in applied


# ── init_db() integration: full end-to-end ────────────────────────────────────

async def test_init_db_creates_usable_schema(monkeypatch, tmp_path):
    """init_db() should produce a fully functional schema via the migration
    runner — this is the ultimate integration test."""
    path = str(tmp_path / "integration.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)

    await init_db()

    # Verify we can do real CRUD operations against the resulting schema
    user = await get_or_create_user(
        google_id="g1", email="test@test.com", name="Test", picture=""
    )
    assert user["id"] is not None

    await save_book(1, {
        "id": 1, "title": "Faust", "authors": ["Goethe"], "languages": ["de"],
        "subjects": ["Drama"], "download_count": 100, "cover": "",
    }, "Chapter text here.", [{"url": "img.jpg", "caption": "Cover"}])

    book = await get_cached_book(1)
    assert book is not None
    assert book["title"] == "Faust"


async def test_init_db_on_existing_db_is_safe(monkeypatch, tmp_path):
    """Running init_db() twice on the same DB should be a no-op the second time."""
    path = str(tmp_path / "twice.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)

    await init_db()
    # Insert a user so we can verify it survives the second run
    user = await get_or_create_user(
        google_id="g1", email="test@test.com", name="Test", picture=""
    )

    await init_db()  # second run — should not wipe data
    from services.db import get_user_by_id
    same_user = await get_user_by_id(user["id"])
    assert same_user is not None
    assert same_user["email"] == "test@test.com"


# ── Migration ordering ───────────────────────────────────────────────────────

async def test_migrations_applied_in_filename_order(tmp_db, tmp_migrations, monkeypatch):
    """Migrations should run in sorted filename order (001, 002, 003...)."""
    applied_order = []

    # Create migrations that record their own order via table names
    for i in [3, 1, 2]:
        (open(os.path.join(tmp_migrations, f"00{i}_m.sql"), "w")).write(
            f"CREATE TABLE t{i} (id INTEGER PRIMARY KEY);"
        )

    monkeypatch.setattr("services.migrations._MIGRATIONS_DIR", tmp_migrations)
    applied = await run_migrations(tmp_db)

    # Applied list should be in sorted order regardless of filesystem order
    assert applied == ["001_m", "002_m", "003_m"]


# ── No migrations directory ──────────────────────────────────────────────────

async def test_missing_migrations_dir_returns_empty(tmp_db, monkeypatch):
    """If the migrations directory doesn't exist, run() should return []
    and create only the schema_migrations tracking table."""
    monkeypatch.setattr("services.migrations._MIGRATIONS_DIR", "/nonexistent/path")
    applied = await run_migrations(tmp_db)
    assert applied == []

    # schema_migrations table should still have been created
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
        ) as cursor:
            assert await cursor.fetchone() is not None
