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


# ── Partial bootstrap (001 applied, 002/003 missing) ─────────────────────────

async def test_partial_bootstrap_marks_missing_versions(tmp_db):
    """If a previous startup applied 001 but crashed on 002 (e.g. duplicate
    column error), the DB has 001 recorded but not 002/003. The bootstrap
    must fire for the missing versions even though `already` is not empty."""
    # Simulate: existing DB with all tables + images column + audio_cache,
    # but schema_migrations only has 001.
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("INSERT INTO schema_migrations (version) VALUES ('001_initial_schema')")
        await db.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, images TEXT)")
        await db.execute("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT, google_id TEXT UNIQUE NOT NULL,
                email TEXT, name TEXT, picture TEXT, gemini_key TEXT, role TEXT DEFAULT 'user', approved INTEGER DEFAULT 0,
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
        await db.execute("CREATE TABLE audiobooks (book_id INTEGER PRIMARY KEY, librivox_id TEXT NOT NULL)")
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

    # This should NOT crash — the bootstrap should detect the missing 002/003/004
    # and mark them as applied before the migration loop tries to execute them.
    # Newer migrations (005+) that add new columns will actually run.
    applied = await run_migrations(tmp_db)
    assert "002_add_book_images" not in applied
    assert "003_create_audio_cache" not in applied
    assert "004_user_roles_and_approval" not in applied

    # All bootstrapped versions should be in schema_migrations
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT version FROM schema_migrations ORDER BY version") as cursor:
            versions = [row[0] async for row in cursor]
    assert "001_initial_schema" in versions
    assert "002_add_book_images" in versions
    assert "003_create_audio_cache" in versions


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
                email TEXT, name TEXT, picture TEXT, gemini_key TEXT, role TEXT DEFAULT 'user', approved INTEGER DEFAULT 0,
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
                email TEXT, name TEXT, picture TEXT, gemini_key TEXT, role TEXT DEFAULT 'user', approved INTEGER DEFAULT 0,
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
    # Bootstrap should have marked first 4 as done (DB has all features).
    # Newer migrations (005+) that add new columns will actually run.
    assert "001_initial_schema" not in applied
    assert "002_add_book_images" not in applied
    assert "003_create_audio_cache" not in applied
    assert "004_user_roles_and_approval" not in applied

    # Verify schema_migrations contains the bootstrapped versions
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT version FROM schema_migrations ORDER BY version") as cursor:
            versions = [row[0] async for row in cursor]
    assert "001_initial_schema" in versions
    assert "002_add_book_images" in versions
    assert "003_create_audio_cache" in versions
    assert "004_user_roles_and_approval" in versions


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


# ── 006_add_apple_id bootstrap regression ────────────────────────────────────

async def test_bootstrap_marks_006_add_apple_id_when_column_exists(tmp_db):
    """Regression: a legacy DB that already has apple_id must not re-apply
    006_add_apple_id.sql — that ALTER TABLE ADD COLUMN would crash with
    'duplicate column name: apple_id'.

    Root cause: 006_add_apple_id was missing from bootstrap_checks while
    006_bulk_translation_jobs was present, so any existing DB with apple_id
    would crash on startup."""
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, images TEXT)"
        )
        await db.execute("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_id TEXT UNIQUE NOT NULL,
                email TEXT, name TEXT, picture TEXT, gemini_key TEXT,
                role TEXT DEFAULT 'user', approved INTEGER DEFAULT 0,
                github_id TEXT, apple_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_id
            ON users(apple_id) WHERE apple_id IS NOT NULL
        """)
        await db.execute("""
            CREATE TABLE translations (
                book_id INTEGER NOT NULL, chapter_index INTEGER NOT NULL,
                target_language TEXT NOT NULL, paragraphs TEXT NOT NULL,
                PRIMARY KEY (book_id, chapter_index, target_language)
            )
        """)
        await db.execute(
            "CREATE TABLE audiobooks (book_id INTEGER PRIMARY KEY, librivox_id TEXT NOT NULL)"
        )
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

    # Must NOT raise "duplicate column name: apple_id"
    applied = await run_migrations(tmp_db)
    assert "006_add_apple_id" not in applied  # bootstrapped, not re-applied

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT version FROM schema_migrations WHERE version='006_add_apple_id'"
        ) as cursor:
            assert await cursor.fetchone() is not None, \
                "006_add_apple_id must be bootstrapped in schema_migrations"


# ── 011/016/017 bootstrap regressions ────────────────────────────────────────

async def test_bootstrap_marks_011_when_title_translation_exists(tmp_db):
    """Regression: a legacy DB that already has title_translation in translations
    must not re-apply 011_translation_title.sql (ALTER TABLE ADD COLUMN crashes)."""
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, images TEXT)")
        await db.execute("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_id TEXT UNIQUE NOT NULL,
                email TEXT, name TEXT, picture TEXT, gemini_key TEXT,
                role TEXT DEFAULT 'user', approved INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # translations table already has title_translation (as if 011 was applied manually)
        await db.execute("""
            CREATE TABLE translations (
                book_id INTEGER NOT NULL, chapter_index INTEGER NOT NULL,
                target_language TEXT NOT NULL, paragraphs TEXT NOT NULL,
                title_translation TEXT,
                PRIMARY KEY (book_id, chapter_index, target_language)
            )
        """)
        await db.execute("CREATE TABLE audiobooks (book_id INTEGER PRIMARY KEY, librivox_id TEXT NOT NULL)")
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
    assert "011_translation_title" not in applied

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT version FROM schema_migrations WHERE version='011_translation_title'"
        ) as cursor:
            assert await cursor.fetchone() is not None, \
                "011_translation_title must be bootstrapped in schema_migrations"


async def test_bootstrap_marks_016_when_context_text_exists(tmp_db):
    """Regression: a legacy DB that already has context_text in book_insights
    must not re-apply 016_insight_context.sql."""
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, images TEXT)")
        await db.execute("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_id TEXT UNIQUE NOT NULL,
                email TEXT, name TEXT, picture TEXT, gemini_key TEXT,
                role TEXT DEFAULT 'user', approved INTEGER DEFAULT 0,
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
        await db.execute("CREATE TABLE audiobooks (book_id INTEGER PRIMARY KEY, librivox_id TEXT NOT NULL)")
        await db.execute("""
            CREATE TABLE audio_cache (
                book_id INTEGER NOT NULL, chapter_index INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL DEFAULT 0,
                provider TEXT NOT NULL, voice TEXT NOT NULL,
                content_type TEXT NOT NULL, audio BLOB NOT NULL,
                PRIMARY KEY (book_id, chapter_index, chunk_index, provider, voice)
            )
        """)
        # book_insights already has context_text (as if 016 was applied manually).
        # Column shape must match the real 015+016 schema — otherwise later
        # migrations that do INSERT ... SELECT * over this table (e.g. 032)
        # fail on column-count mismatch.
        await db.execute("""
            CREATE TABLE IF NOT EXISTS book_insights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
                chapter_index INTEGER, question TEXT NOT NULL,
                answer TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                context_text TEXT
            )
        """)
        await db.commit()

    applied = await run_migrations(tmp_db)
    assert "016_insight_context" not in applied

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT version FROM schema_migrations WHERE version='016_insight_context'"
        ) as cursor:
            assert await cursor.fetchone() is not None, \
                "016_insight_context must be bootstrapped in schema_migrations"


async def test_bootstrap_marks_017_when_lemma_exists(tmp_db):
    """Regression: a legacy DB that already has lemma/language in vocabulary
    must not re-apply 017_vocabulary_lemma_language.sql."""
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, images TEXT)")
        await db.execute("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_id TEXT UNIQUE NOT NULL,
                email TEXT, name TEXT, picture TEXT, gemini_key TEXT,
                role TEXT DEFAULT 'user', approved INTEGER DEFAULT 0,
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
        await db.execute("CREATE TABLE audiobooks (book_id INTEGER PRIMARY KEY, librivox_id TEXT NOT NULL)")
        await db.execute("""
            CREATE TABLE audio_cache (
                book_id INTEGER NOT NULL, chapter_index INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL DEFAULT 0,
                provider TEXT NOT NULL, voice TEXT NOT NULL,
                content_type TEXT NOT NULL, audio BLOB NOT NULL,
                PRIMARY KEY (book_id, chapter_index, chunk_index, provider, voice)
            )
        """)
        # vocabulary already has lemma/language (as if 017 was applied manually)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS vocabulary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                word TEXT NOT NULL,
                lemma TEXT,
                language TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (user_id, word)
            )
        """)
        await db.commit()

    applied = await run_migrations(tmp_db)
    assert "017_vocabulary_lemma_language" not in applied

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT version FROM schema_migrations WHERE version='017_vocabulary_lemma_language'"
        ) as cursor:
            assert await cursor.fetchone() is not None, \
                "017_vocabulary_lemma_language must be bootstrapped in schema_migrations"


# ── No migrations directory ──────────────────────────────────────────────────

# ── 018→020 chapter_summaries rename (issue #275) ───────────────────────────

async def test_020_chapter_summaries_applied_on_fresh_db(tmp_db):
    """After renaming 018_chapter_summaries → 020_chapter_summaries, a fresh DB
    must apply the migration under the new version key."""
    applied = await run_migrations(tmp_db)
    assert "020_chapter_summaries" in applied, (
        "020_chapter_summaries must be applied on fresh DB"
    )
    assert "018_chapter_summaries" not in applied, (
        "018_chapter_summaries file no longer exists; old key must not appear in applied list"
    )
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_summaries'"
        ) as cursor:
            assert await cursor.fetchone() is not None, "chapter_summaries table must exist"


async def test_legacy_db_with_018_chapter_summaries_gets_020_bootstrapped(tmp_db):
    """A database that already ran 018_chapter_summaries (before the rename)
    must have 020_chapter_summaries bootstrapped — the renamed migration must
    NOT be re-applied, which would fail with 'table already exists'."""
    # Simulate a legacy DB: schema_migrations has 018_chapter_summaries and
    # the chapter_summaries table already exists.
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "CREATE TABLE schema_migrations "
            "(version TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )
        await db.execute(
            "INSERT INTO schema_migrations (version) VALUES ('018_chapter_summaries')"
        )
        await db.execute(
            """CREATE TABLE chapter_summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                chapter_index INTEGER NOT NULL,
                model TEXT,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(book_id, chapter_index)
            )"""
        )
        await db.commit()

    applied = await run_migrations(tmp_db)
    assert "020_chapter_summaries" not in applied, (
        "020_chapter_summaries must NOT be re-applied on a DB that already has chapter_summaries"
    )
    # Must be bootstrapped (recorded in schema_migrations) so it is never re-run
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT version FROM schema_migrations WHERE version='020_chapter_summaries'"
        ) as cursor:
            assert await cursor.fetchone() is not None, (
                "020_chapter_summaries must be bootstrapped into schema_migrations "
                "for legacy DBs so the renamed file is never applied twice"
            )


# ── 022_book_insights_unique: dedup before index (issue #526) ────────────────

async def test_022_deduplicates_before_creating_unique_index(tmp_db, tmp_migrations, monkeypatch):
    """Regression #526: migration 022 must DELETE duplicate book_insights rows
    before creating the UNIQUE INDEX so it doesn't crash with IntegrityError
    on databases that already have duplicate questions in the same chapter.

    This is the exact scenario that caused the Railway app crash: a production
    DB had duplicates and migration 022 had not yet been applied."""
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE book_insights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
                chapter_index INTEGER, question TEXT, answer TEXT, context_text TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Insert duplicate rows: same user/book/chapter/question — this is exactly
        # the state that would cause CREATE UNIQUE INDEX to raise IntegrityError.
        await db.executemany(
            "INSERT INTO book_insights (user_id, book_id, chapter_index, question, answer) "
            "VALUES (1, 100, 0, 'What is the theme?', ?)",
            [("Answer A",), ("Answer B",)],
        )
        # A non-duplicate row — must survive.
        await db.execute(
            "INSERT INTO book_insights (user_id, book_id, chapter_index, question, answer) "
            "VALUES (1, 100, 1, 'What is the theme?', 'Answer C')"
        )
        await db.commit()

    # Point runner at a dir containing only migration 022.
    shutil.copy(
        os.path.join(os.path.dirname(__file__), "..", "migrations", "022_book_insights_unique.sql"),
        os.path.join(tmp_migrations, "022_book_insights_unique.sql"),
    )
    monkeypatch.setattr("services.migrations._MIGRATIONS_DIR", tmp_migrations)

    # Must NOT raise IntegrityError.
    applied = await run_migrations(tmp_db)
    assert "022_book_insights_unique" in applied

    async with aiosqlite.connect(tmp_db) as db:
        # Duplicate removed — only one row for (user=1, book=100, chapter=0, q="What is the theme?")
        async with db.execute(
            "SELECT COUNT(*) FROM book_insights WHERE user_id=1 AND book_id=100 AND chapter_index=0"
        ) as cursor:
            assert (await cursor.fetchone())[0] == 1, \
                "duplicate row must be removed by migration 022 dedup step"

        # Non-duplicate row in chapter 1 must be untouched.
        async with db.execute(
            "SELECT COUNT(*) FROM book_insights WHERE user_id=1 AND book_id=100 AND chapter_index=1"
        ) as cursor:
            assert (await cursor.fetchone())[0] == 1, "non-duplicate row must survive"

        # The unique index must exist.
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='uq_book_insights_question'"
        ) as cursor:
            assert await cursor.fetchone() is not None, \
                "uq_book_insights_question index must exist after migration 022"


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


# ── Semicolon inside SQL comment (issue #544) ────────────────────────────────

async def test_migration_024_flashcard_reviews_table_created(tmp_db):
    """Migration 024 creates the flashcard_reviews table and its index."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='flashcard_reviews'"
        ) as cur:
            assert await cur.fetchone() is not None, "flashcard_reviews table must exist after migration 024"

        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='flashcard_reviews_due'"
        ) as cur:
            assert await cur.fetchone() is not None, "flashcard_reviews_due index must exist after migration 024"


async def test_semicolon_in_sql_comment_does_not_break_migration(tmp_db, tmp_migrations, monkeypatch):
    """Regression #544: sql.split(';') naively splits on semicolons inside
    -- line comments, producing invalid SQL fragments that crash the runner.

    Example: a comment like '-- backfill script available; run manually' causes
    the runner to try to execute ' run manually' as a statement."""
    sql = (
        "-- Creates the test table; run this before adding rows.\n"
        "CREATE TABLE semicolon_test (\n"
        "    id INTEGER PRIMARY KEY,\n"
        "    name TEXT NOT NULL\n"
        ");\n"
        "-- Also insert a default row; ensures schema is populated.\n"
        "INSERT INTO semicolon_test (id, name) VALUES (1, 'hello');\n"
    )
    (open(os.path.join(tmp_migrations, "001_semicolon_comment.sql"), "w")).write(sql)

    monkeypatch.setattr("services.migrations._MIGRATIONS_DIR", tmp_migrations)
    applied = await run_migrations(tmp_db)
    assert "001_semicolon_comment" in applied

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT name FROM semicolon_test WHERE id=1") as cursor:
            row = await cursor.fetchone()
    assert row is not None
    assert row[0] == "hello"


# ── 025_user_book_chapters (issue #357) ──────────────────────────────────────

async def test_migration_025_user_book_chapters_table_created(tmp_db):
    """Migration 025 creates user_book_chapters table + index."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='user_book_chapters'"
        ) as cur:
            assert await cur.fetchone() is not None
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='ubc_book_draft'"
        ) as cur:
            assert await cur.fetchone() is not None
        async with db.execute(
            "SELECT name FROM pragma_table_info('user_book_chapters')"
        ) as cur:
            cols = {r[0] for r in await cur.fetchall()}
    # Subset, not equality: later migrations legitimately append columns
    # (045 adds reviewed/updated_at for cross-session audit drafts).
    assert {"id", "book_id", "chapter_index", "title", "text", "is_draft"} <= cols


# ── SQL splitter keeps CREATE TRIGGER BEGIN...END blocks intact ─────────────

async def test_trigger_migration_applies_cleanly(tmp_db, tmp_migrations, monkeypatch):
    """Regression for #648: migration files containing CREATE TRIGGER ... BEGIN
    statement1; statement2; END; must apply cleanly — the runner must keep
    the BEGIN..END block together and not split it on the inner semicolons."""
    sql = (
        "CREATE TABLE trigger_test_src (id INTEGER PRIMARY KEY, v TEXT);\n"
        "CREATE TABLE trigger_test_dst (src_id INTEGER, v1 TEXT, v2 TEXT);\n"
        "CREATE TRIGGER tts_ai AFTER INSERT ON trigger_test_src\n"
        "BEGIN\n"
        "    INSERT INTO trigger_test_dst (src_id, v1, v2) VALUES (new.id, new.v, 'a');\n"
        "    INSERT INTO trigger_test_dst (src_id, v1, v2) VALUES (new.id, new.v, 'b');\n"
        "END;\n"
    )
    (open(os.path.join(tmp_migrations, "001_trigger.sql"), "w")).write(sql)
    monkeypatch.setattr("services.migrations._MIGRATIONS_DIR", tmp_migrations)

    applied = await run_migrations(tmp_db)
    assert "001_trigger" in applied

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("INSERT INTO trigger_test_src (v) VALUES ('x')")
        await db.commit()
        async with db.execute(
            "SELECT COUNT(*) FROM trigger_test_dst WHERE src_id=1"
        ) as cur:
            count = (await cur.fetchone())[0]
        # Both trigger-body statements ran — splitter preserved BEGIN..END.
        assert count == 2


# ── _split_sql_statements unit tests (issue #1613) ───────────────────────────


def test_split_sql_last_statement_no_trailing_semicolon():
    """Regression #1613: SQL whose last statement has no trailing ';' must still
    be captured.  Covers lines 59-60 (next_semi==-1 branch) and 82-84 (residual
    current after loop exit) in _split_sql_statements."""
    from services.migrations import _split_sql_statements
    sql = "CREATE TABLE a (id INTEGER);\nCREATE TABLE b (id INTEGER)"
    stmts = _split_sql_statements(sql)
    assert len(stmts) == 2, f"Expected 2 statements, got {len(stmts)}: {stmts}"
    assert any("CREATE TABLE a" in s for s in stmts)
    assert any("CREATE TABLE b" in s for s in stmts)


def test_split_sql_only_statement_no_semicolon():
    """Regression #1613: SQL with no semicolon at all is returned as a single
    statement.  Exercises the next_semi==-1 break path (lines 59-60)."""
    from services.migrations import _split_sql_statements
    sql = "SELECT 1"
    stmts = _split_sql_statements(sql)
    assert stmts == ["SELECT 1"]


def test_split_sql_orphan_end_keyword_does_not_crash():
    """Regression #1613: an END token appearing when in_trigger==0 must not
    crash or corrupt parsing.  Covers the False branch of
    'if in_trigger > 0:' (line 77->79 in _split_sql_statements)."""
    from services.migrations import _split_sql_statements
    sql = "CREATE TABLE t (id INTEGER); END;"
    stmts = _split_sql_statements(sql)
    assert any("CREATE TABLE t" in s for s in stmts), (
        f"CREATE TABLE t must be in parsed statements, got: {stmts}"
    )


def test_split_sql_trailing_whitespace_after_semicolon_not_added():
    """Regression #1639: line 83 False branch — SQL ending with only whitespace
    after the last ';' must not add an empty statement to the result."""
    from services.migrations import _split_sql_statements
    sql = "CREATE TABLE a (id INTEGER);\n   \n   "
    stmts = _split_sql_statements(sql)
    assert len(stmts) == 1
    assert stmts[0].startswith("CREATE TABLE a")
    assert all(s.strip() for s in stmts)  # no empty or whitespace-only statements


def test_split_sql_semicolon_inside_a_string_literal_is_not_a_terminator():
    """A `;` inside quotes belongs to the value, not to the statement.

    Migration 052 guards on Moby Dick's real title, `MOBY-DICK; or, THE WHALE.`.
    Split on that semicolon and SQLite sees `... title = 'MOBY-DICK` and dies on
    an unrecognized token.
    """
    from services.migrations import _split_sql_statements
    sql = "UPDATE t SET role = 'a' WHERE title = 'MOBY-DICK; or, THE WHALE.';"
    stmts = _split_sql_statements(sql)
    assert len(stmts) == 1
    assert stmts[0].endswith("'MOBY-DICK; or, THE WHALE.'")


def test_split_sql_apostrophe_in_a_comment_does_not_open_a_string():
    """Comments are prose, and prose has apostrophes.

    Migration 010 says `-- that don't specify a model`. Treat that quote as the
    start of a literal and everything up to the next quote — the whole CREATE
    TABLE — is swallowed into one unrunnable statement.
    """
    from services.migrations import _split_sql_statements
    sql = "-- callers that don't specify a model\nCREATE TABLE a (m TEXT DEFAULT '');\nDROP TABLE b;"
    stmts = _split_sql_statements(sql)
    assert len(stmts) == 2
    assert stmts[0].startswith("CREATE TABLE a")
    assert stmts[1] == "DROP TABLE b"


def test_split_sql_double_dash_inside_a_string_is_not_a_comment():
    """`--` in a value must survive; stripping it would truncate the statement."""
    from services.migrations import _split_sql_statements
    stmts = _split_sql_statements("UPDATE t SET title = 'well -- almost' WHERE id = 1;")
    assert len(stmts) == 1
    assert "well -- almost" in stmts[0]
    assert stmts[0].endswith("id = 1")


def test_split_sql_escaped_quote_does_not_end_the_literal():
    """SQLite escapes a quote by doubling it — `'don''t'` is one string."""
    from services.migrations import _split_sql_statements
    stmts = _split_sql_statements("UPDATE t SET a = 'don''t; stop' WHERE id = 1;\nDROP TABLE b;")
    assert len(stmts) == 2
    assert "'don''t; stop'" in stmts[0]
    assert stmts[1] == "DROP TABLE b"


async def test_migration_025_unique_constraint_enforced(tmp_db):
    """user_book_chapters (book_id, chapter_index) UNIQUE must reject duplicates."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO books (id, title, source) VALUES (1, 'x', 'upload')"
        )
        await db.execute(
            "INSERT INTO user_book_chapters (book_id, chapter_index, title, text, is_draft) "
            "VALUES (1, 0, 'Ch1', 't', 1)"
        )
        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "INSERT INTO user_book_chapters (book_id, chapter_index, title, text, is_draft) "
                "VALUES (1, 0, 'dup', 't', 1)"
            )
        await db.rollback()


# ── Migration 027 (vocab tags & decks, issue #645) ────────────────────────────


async def test_migration_027_creates_tags_and_decks_tables(tmp_db):
    """vocabulary_tags, decks, deck_members must exist with expected columns."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        for tbl, expected in [
            ("vocabulary_tags", {"id", "user_id", "vocabulary_id", "tag", "created_at"}),
            ("decks",
             {"id", "user_id", "name", "description", "mode", "rules_json",
              "created_at", "updated_at"}),
            ("deck_members", {"deck_id", "vocabulary_id", "added_at"}),
        ]:
            async with db.execute(f"PRAGMA table_info({tbl})") as cursor:
                cols = {row[1] async for row in cursor}
            assert cols == expected, f"{tbl} columns: {cols}"


async def test_migration_027_unique_tag_per_vocab(tmp_db):
    """vocabulary_tags UNIQUE(user_id, vocabulary_id, tag) must reject duplicates."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO users (google_id, email, name, picture) VALUES ('x','a@b.com','A','')"
        )
        await db.execute(
            "INSERT INTO vocabulary (user_id, word) VALUES (1, 'w')"
        )
        await db.execute(
            "INSERT INTO vocabulary_tags (user_id, vocabulary_id, tag) VALUES (1, 1, 'foo')"
        )
        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "INSERT INTO vocabulary_tags (user_id, vocabulary_id, tag) VALUES (1, 1, 'foo')"
            )
        await db.rollback()


async def test_migration_027_deck_mode_check(tmp_db):
    """decks.mode CHECK enforces 'manual' or 'smart'."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO users (google_id, email, name, picture) VALUES ('x','a@b.com','A','')"
        )
        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "INSERT INTO decks (user_id, name, mode) VALUES (1, 'x', 'bogus')"
            )
        await db.rollback()


async def test_migration_027_deck_name_unique_per_user(tmp_db):
    """decks UNIQUE(user_id, name) — a user can't create two decks with the same name."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO users (google_id, email, name, picture) VALUES ('x','a@b.com','A','')"
        )
        await db.execute(
            "INSERT INTO decks (user_id, name, mode) VALUES (1, 'dup', 'manual')"
        )
        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "INSERT INTO decks (user_id, name, mode) VALUES (1, 'dup', 'manual')"
            )
        await db.rollback()


# ── Migration 028 (FK orphan cleanup, issue #700 / #748) ──────────────────────


async def test_migration_028_cleans_orphan_flashcard_reviews(tmp_db):
    """Seed a flashcard_review pointing at a missing vocabulary row; migration
    028 must delete it so enabling FK enforcement doesn't fail later."""
    # Apply the full migration sequence up through 027 first so all tables
    # (including vocabulary + flashcard_reviews) exist.
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        # Insert users + a vocabulary row, then delete the vocab directly so
        # the flashcard_reviews row is orphaned without cascades.
        # PRAGMA foreign_keys changes are only accepted outside transactions,
        # so flip FK off before the first DML.
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (1, 'x', 'a@b.com', 'A', '')"
        )
        await db.execute(
            "INSERT INTO vocabulary (id, user_id, word) VALUES (777, 1, 'w')"
        )
        await db.execute(
            "INSERT INTO flashcard_reviews (user_id, vocabulary_id) "
            "VALUES (1, 777)"
        )
        # Orphan the flashcard_review by deleting the parent vocabulary row.
        await db.execute("DELETE FROM vocabulary WHERE id = 777")
        await db.commit()

        # Simulate the migration re-running by deleting its recorded row
        # and running again — this exercises the cleanup SQL.
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '028_fk_orphan_cleanup'"
        )
        await db.commit()

    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM flashcard_reviews WHERE vocabulary_id = 777"
        ) as cur:
            assert (await cur.fetchone())[0] == 0


async def test_migration_028_clears_dangling_book_owner(tmp_db):
    """books.owner_user_id pointing at a deleted user must be NULL'd, not
    deleted — books are also shared content."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        # SQLite rejects PRAGMA foreign_keys changes inside a transaction, so
        # issue it BEFORE any DML. The patched __aenter__ turns FK on; we
        # flip it off for the rest of this connection so the user delete
        # below doesn't cascade-destroy the book via owner_user_id.
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (42, 'gone', 'g@b.com', 'G', '')"
        )
        await db.execute(
            "INSERT INTO books (id, title, images, owner_user_id) VALUES (91234, 'B', '[]', 42)"
        )
        await db.execute("DELETE FROM users WHERE id = 42")
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '028_fk_orphan_cleanup'"
        )
        await db.commit()

    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT owner_user_id FROM books WHERE id = 91234"
        ) as cur:
            row = await cur.fetchone()
        assert row[0] is None, "book row should survive with null owner"


async def test_migration_028_recorded_in_schema_migrations(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT version FROM schema_migrations WHERE version = '028_fk_orphan_cleanup'"
        ) as cur:
            assert (await cur.fetchone()) is not None


# ── Migration 029 (issue #783): invalidate shifted chapter cache ──────────────


async def test_migration_029_clears_shifted_translations(tmp_db):
    """Regression #783: migration 029 must delete translations with chapter_index >= 1
    for Faust (#2229) and Kafka (#69327), but leave chapter 0 and other books untouched."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.executemany(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
            "VALUES (?, ?, 'zh', '[]')",
            [(2229, 0), (2229, 1), (2229, 2), (69327, 0), (69327, 1), (1, 1)],
        )
        await db.executemany(
            "INSERT INTO chapter_summaries (book_id, chapter_index, content) VALUES (?, ?, 'summary')",
            [(2229, 1), (69327, 1)],
        )
        await db.executemany(
            "INSERT INTO translation_queue (book_id, chapter_index, target_language, status) "
            "VALUES (?, ?, 'zh', 'pending')",
            [(2229, 1), (69327, 2)],
        )
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) VALUES (1, 'x', 'a@b.com', 'A', '')"
        )
        await db.executemany(
            "INSERT INTO book_insights (user_id, book_id, chapter_index, question, answer) "
            "VALUES (1, ?, ?, 'Q?', 'A')",
            [(2229, 1), (2229, 2), (69327, 1)],
        )
        await db.execute(
            "INSERT INTO book_insights (user_id, book_id, chapter_index, question, answer) "
            "VALUES (1, 2229, NULL, 'Book-level?', 'A')"
        )
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '029_invalidate_shifted_chapter_cache'"
        )
        await db.commit()

    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM translations WHERE book_id IN (2229, 69327) AND chapter_index >= 1"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "stale chapter >= 1 translations must be deleted"

        async with db.execute(
            "SELECT COUNT(*) FROM translations WHERE book_id=2229 AND chapter_index=0"
        ) as cur:
            assert (await cur.fetchone())[0] == 1, "chapter 0 must survive"

        async with db.execute(
            "SELECT COUNT(*) FROM translations WHERE book_id=1 AND chapter_index=1"
        ) as cur:
            assert (await cur.fetchone())[0] == 1, "unrelated book must survive"

        async with db.execute(
            "SELECT COUNT(*) FROM chapter_summaries WHERE book_id IN (2229, 69327) AND chapter_index >= 1"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "stale chapter summaries must be deleted"

        async with db.execute(
            "SELECT COUNT(*) FROM translation_queue WHERE book_id IN (2229, 69327) AND chapter_index >= 1"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "stale queue rows must be deleted"

        async with db.execute(
            "SELECT COUNT(*) FROM book_insights "
            "WHERE book_id IN (2229, 69327) AND chapter_index IS NOT NULL AND chapter_index >= 1"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "stale per-chapter insights must be deleted"

        async with db.execute(
            "SELECT COUNT(*) FROM book_insights WHERE book_id=2229 AND chapter_index IS NULL"
        ) as cur:
            assert (await cur.fetchone())[0] == 1, "book-level insights (NULL chapter) must survive"


@pytest.mark.asyncio
async def test_migration_030_clears_chapter0_cache(tmp_db):
    """Regression #800: migration 030 must delete chapter_index=0 rows for Faust (#2229)
    and Kafka (#69327) defensively, leaving other chapters and other books untouched."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.executemany(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
            "VALUES (?, ?, 'zh', '[]')",
            [(2229, 0), (2229, 1), (69327, 0), (1, 0)],
        )
        await db.executemany(
            "INSERT INTO chapter_summaries (book_id, chapter_index, content) VALUES (?, ?, 'summary')",
            [(2229, 0), (69327, 0), (1, 0)],
        )
        await db.executemany(
            "INSERT INTO translation_queue (book_id, chapter_index, target_language, status) "
            "VALUES (?, ?, 'zh', 'pending')",
            [(2229, 0), (69327, 0)],
        )
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) VALUES (2, 'y', 'b@c.com', 'B', '')"
        )
        await db.executemany(
            "INSERT INTO book_insights (user_id, book_id, chapter_index, question, answer) "
            "VALUES (2, ?, ?, 'Q?', 'A')",
            [(2229, 0), (69327, 0), (1, 0)],
        )
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '030_invalidate_chapter0_cache'"
        )
        await db.commit()

    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM translations WHERE book_id IN (2229, 69327) AND chapter_index = 0"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "stale chapter-0 translations must be deleted"

        async with db.execute(
            "SELECT COUNT(*) FROM translations WHERE book_id=2229 AND chapter_index=1"
        ) as cur:
            assert (await cur.fetchone())[0] == 1, "chapter 1 must survive"

        async with db.execute(
            "SELECT COUNT(*) FROM translations WHERE book_id=1 AND chapter_index=0"
        ) as cur:
            assert (await cur.fetchone())[0] == 1, "unrelated book chapter-0 must survive"

        async with db.execute(
            "SELECT COUNT(*) FROM chapter_summaries WHERE book_id IN (2229, 69327) AND chapter_index = 0"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "stale chapter-0 summaries must be deleted"

        async with db.execute(
            "SELECT COUNT(*) FROM chapter_summaries WHERE book_id=1 AND chapter_index=0"
        ) as cur:
            assert (await cur.fetchone())[0] == 1, "unrelated book chapter-0 summary must survive"

        async with db.execute(
            "SELECT COUNT(*) FROM translation_queue WHERE book_id IN (2229, 69327) AND chapter_index = 0"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "stale chapter-0 queue rows must be deleted"

        async with db.execute(
            "SELECT COUNT(*) FROM book_insights "
            "WHERE book_id IN (2229, 69327) AND chapter_index = 0"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "stale chapter-0 insights must be deleted"

        async with db.execute(
            "SELECT COUNT(*) FROM book_insights WHERE book_id=1 AND chapter_index=0"
        ) as cur:
            assert (await cur.fetchone())[0] == 1, "unrelated book chapter-0 insights must survive"


# ── Migration 031 (issue #754): declared FKs on annotations + vocabulary ─────


async def test_migration_031_cleans_orphan_annotations_and_vocabulary(tmp_db):
    """Seed rows pointing at missing parents, re-run migration 031, and
    confirm the pre-rewrite orphan DELETEs wiped them so the subsequent
    INSERT INTO …_new SELECT * does not violate the new FKs."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        # Two valid parents we keep.
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (1, 'g1', 'a@b.com', 'A', '')"
        )
        await db.execute(
            "INSERT INTO books (id, title, images) VALUES (100, 'A Book', '[]')"
        )
        # Valid annotation + valid vocabulary row — both must survive.
        await db.execute(
            "INSERT INTO annotations (id, user_id, book_id, chapter_index, sentence_text) "
            "VALUES (1, 1, 100, 0, 'alive')"
        )
        await db.execute(
            "INSERT INTO vocabulary (id, user_id, word) VALUES (1, 1, 'alive')"
        )
        # Orphan rows: bogus parent ids.
        await db.execute(
            "INSERT INTO annotations (id, user_id, book_id, chapter_index, sentence_text) "
            "VALUES (2, 999, 100, 0, 'bad-user')"
        )
        await db.execute(
            "INSERT INTO annotations (id, user_id, book_id, chapter_index, sentence_text) "
            "VALUES (3, 1, 888, 0, 'bad-book')"
        )
        await db.execute(
            "INSERT INTO vocabulary (id, user_id, word) VALUES (2, 999, 'bad-user')"
        )
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '031_fk_annotations_vocabulary'"
        )
        await db.commit()

    # Re-run migrations — this exercises the orphan cleanup + table rewrite.
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT id FROM annotations ORDER BY id") as cur:
            rows = [r[0] for r in await cur.fetchall()]
        assert rows == [1], f"only the valid annotation should survive; got {rows}"

        async with db.execute("SELECT id FROM vocabulary ORDER BY id") as cur:
            rows = [r[0] for r in await cur.fetchall()]
        assert rows == [1], f"only the valid vocabulary row should survive; got {rows}"


async def test_migration_031_annotations_carries_declared_fks(tmp_db):
    """After migration 031 runs, PRAGMA foreign_key_list must report
    annotations.user_id → users(id) CASCADE and annotations.book_id →
    books(id) CASCADE. This is the load-bearing assertion of the design —
    if these slip, the whole series is pointless."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("PRAGMA foreign_key_list(annotations)") as cur:
            fks = await cur.fetchall()

    fk_map = {(row[2], row[3]): (row[4], row[5], row[6]) for row in fks}
    # key = (referenced_table, from_column) → (to_column, on_update, on_delete)
    assert ("users", "user_id") in fk_map, f"missing users FK: {fk_map}"
    assert ("books", "book_id") in fk_map, f"missing books FK: {fk_map}"
    assert fk_map[("users", "user_id")][2] == "CASCADE"
    assert fk_map[("books", "book_id")][2] == "CASCADE"


async def test_migration_031_vocabulary_carries_declared_fk(tmp_db):
    """Vocabulary has only user_id as a soft reference — verify it is now
    declared as REFERENCES users(id) ON DELETE CASCADE."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("PRAGMA foreign_key_list(vocabulary)") as cur:
            fks = await cur.fetchall()

    fk_map = {(row[2], row[3]): (row[4], row[5], row[6]) for row in fks}
    assert ("users", "user_id") in fk_map, f"missing users FK: {fk_map}"
    assert fk_map[("users", "user_id")][2] == "CASCADE"


async def test_migration_031_preserves_existing_rows(tmp_db):
    """The rewrite copies data via INSERT … SELECT *. Data in annotations
    and vocabulary that existed before 031 must still be present after."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (5, 'g5', 'e@b.com', 'E', '')"
        )
        await db.execute(
            "INSERT INTO books (id, title, images) VALUES (500, 'T', '[]')"
        )
        await db.execute(
            "INSERT INTO annotations (id, user_id, book_id, chapter_index, "
            "sentence_text, note_text, color) VALUES "
            "(777, 5, 500, 3, 'a sentence', 'a note', 'blue')"
        )
        await db.execute(
            "INSERT INTO vocabulary (id, user_id, word, lemma, language) "
            "VALUES (777, 5, 'the-word', 'the', 'en')"
        )
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '031_fk_annotations_vocabulary'"
        )
        await db.commit()

    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT user_id, book_id, chapter_index, sentence_text, note_text, color "
            "FROM annotations WHERE id = 777"
        ) as cur:
            row = await cur.fetchone()
        assert row == (5, 500, 3, "a sentence", "a note", "blue")

        async with db.execute(
            "SELECT user_id, word, lemma, language FROM vocabulary WHERE id = 777"
        ) as cur:
            row = await cur.fetchone()
        assert row == (5, "the-word", "the", "en")


async def test_migration_031_cascade_deletes_annotations_on_user_delete(tmp_db):
    """End-to-end: with runtime FK enforcement, deleting a user must
    automatically cascade to annotations and vocabulary via the declared
    FKs introduced in 031 — no manual shadow delete required."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        # Default connection has FK on (services.db patches aiosqlite.connect).
        # Explicitly enable to mirror production runtime behavior.
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (77, 'g', 'k@b.com', 'K', '')"
        )
        await db.execute(
            "INSERT INTO books (id, title, images) VALUES (900, 'T', '[]')"
        )
        await db.execute(
            "INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text) "
            "VALUES (77, 900, 0, 's')"
        )
        await db.execute(
            "INSERT INTO vocabulary (user_id, word) VALUES (77, 'w')"
        )
        await db.commit()

        # Drop the user — FK cascade should remove both child rows.
        await db.execute("DELETE FROM users WHERE id = 77")
        await db.commit()

        async with db.execute(
            "SELECT COUNT(*) FROM annotations WHERE user_id = 77"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "annotations must cascade"
        async with db.execute(
            "SELECT COUNT(*) FROM vocabulary WHERE user_id = 77"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "vocabulary must cascade"


async def test_migration_031_cascade_deletes_annotations_on_book_delete(tmp_db):
    """Same end-to-end test on the book_id side: annotations must cascade
    when the parent book goes away."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (88, 'g', 'm@b.com', 'M', '')"
        )
        await db.execute(
            "INSERT INTO books (id, title, images) VALUES (910, 'T', '[]')"
        )
        await db.execute(
            "INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text) "
            "VALUES (88, 910, 0, 's')"
        )
        await db.commit()

        await db.execute("DELETE FROM books WHERE id = 910")
        await db.commit()

        async with db.execute(
            "SELECT COUNT(*) FROM annotations WHERE book_id = 910"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "annotations must cascade on book delete"

# ── Migration 032 (#754 PR 2/4): declared FKs on book_insights + chapter_summaries ─


async def test_migration_032_cleans_orphan_book_insights_and_summaries(tmp_db):
    """Seed rows pointing at missing parents, re-run migration 032, confirm the
    pre-rewrite orphan DELETEs wiped them so the subsequent INSERT INTO _new
    SELECT * does not violate the new FKs."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (1, 'g1', 'a@b.com', 'A', '')"
        )
        await db.execute(
            "INSERT INTO books (id, title, images) VALUES (100, 'Book', '[]')"
        )
        # Valid parents — these rows should survive.
        await db.execute(
            "INSERT INTO book_insights (id, user_id, book_id, chapter_index, question, answer) "
            "VALUES (1, 1, 100, 0, 'Q', 'A')"
        )
        await db.execute(
            "INSERT INTO chapter_summaries (id, book_id, chapter_index, content) "
            "VALUES (1, 100, 0, 'alive')"
        )
        # Orphan rows — bogus parent ids.
        await db.execute(
            "INSERT INTO book_insights (id, user_id, book_id, chapter_index, question, answer) "
            "VALUES (2, 999, 100, 0, 'Q-bad-user', 'A')"
        )
        await db.execute(
            "INSERT INTO book_insights (id, user_id, book_id, chapter_index, question, answer) "
            "VALUES (3, 1, 888, 0, 'Q-bad-book', 'A')"
        )
        await db.execute(
            "INSERT INTO chapter_summaries (id, book_id, chapter_index, content) "
            "VALUES (2, 888, 0, 'bad-book')"
        )
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '032_fk_book_insights_chapter_summaries'"
        )
        await db.commit()

    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT id FROM book_insights ORDER BY id") as cur:
            rows = [r[0] for r in await cur.fetchall()]
        assert rows == [1], f"only valid book_insight should survive; got {rows}"

        async with db.execute("SELECT id FROM chapter_summaries ORDER BY id") as cur:
            rows = [r[0] for r in await cur.fetchall()]
        assert rows == [1], f"only valid chapter_summary should survive; got {rows}"


async def test_migration_032_book_insights_carries_declared_fks(tmp_db):
    """After migration 032, PRAGMA foreign_key_list must report both FKs."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("PRAGMA foreign_key_list(book_insights)") as cur:
            fks = await cur.fetchall()

    fk_map = {(row[2], row[3]): (row[4], row[5], row[6]) for row in fks}
    assert ("users", "user_id") in fk_map, f"missing users FK: {fk_map}"
    assert ("books", "book_id") in fk_map, f"missing books FK: {fk_map}"
    assert fk_map[("users", "user_id")][2] == "CASCADE"
    assert fk_map[("books", "book_id")][2] == "CASCADE"


async def test_migration_032_chapter_summaries_carries_declared_fk(tmp_db):
    """chapter_summaries only has book_id as a soft reference — verify it is
    now REFERENCES books(id) ON DELETE CASCADE."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("PRAGMA foreign_key_list(chapter_summaries)") as cur:
            fks = await cur.fetchall()

    fk_map = {(row[2], row[3]): (row[4], row[5], row[6]) for row in fks}
    assert ("books", "book_id") in fk_map, f"missing books FK: {fk_map}"
    assert fk_map[("books", "book_id")][2] == "CASCADE"


async def test_migration_032_preserves_existing_rows(tmp_db):
    """INSERT … SELECT * must round-trip data including the appended
    context_text column that migration 016 added to book_insights."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (5, 'g5', 'e@b.com', 'E', '')"
        )
        await db.execute(
            "INSERT INTO books (id, title, images) VALUES (500, 'T', '[]')"
        )
        await db.execute(
            "INSERT INTO book_insights (id, user_id, book_id, chapter_index, "
            "question, answer, context_text) VALUES "
            "(777, 5, 500, 2, 'Why?', 'Because', 'a quoted passage')"
        )
        await db.execute(
            "INSERT INTO chapter_summaries (id, book_id, chapter_index, model, content) "
            "VALUES (777, 500, 2, 'gemini', 'a plot summary')"
        )
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '032_fk_book_insights_chapter_summaries'"
        )
        await db.commit()

    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT user_id, book_id, chapter_index, question, answer, context_text "
            "FROM book_insights WHERE id = 777"
        ) as cur:
            row = await cur.fetchone()
        assert row == (5, 500, 2, "Why?", "Because", "a quoted passage")

        async with db.execute(
            "SELECT book_id, chapter_index, model, content FROM chapter_summaries WHERE id = 777"
        ) as cur:
            row = await cur.fetchone()
        assert row == (500, 2, "gemini", "a plot summary")


async def test_migration_032_uq_book_insights_question_index_survives(tmp_db):
    """The UNIQUE expression index from migration 022 must be recreated after
    the table rewrite, otherwise duplicate (user, book, chapter, question)
    rows would be possible again."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (8, 'g', 'q@b.com', 'Q', '')"
        )
        await db.execute("INSERT INTO books (id, title, images) VALUES (800, 'T', '[]')")
        await db.execute(
            "INSERT INTO book_insights (user_id, book_id, chapter_index, question, answer) "
            "VALUES (8, 800, 0, 'dup?', 'first')"
        )
        await db.commit()

        # Duplicate insert must fail — the index is present.
        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "INSERT INTO book_insights (user_id, book_id, chapter_index, question, answer) "
                "VALUES (8, 800, 0, 'dup?', 'second')"
            )
            await db.commit()


async def test_migration_032_cascade_deletes_on_user_delete(tmp_db):
    """With FK enforcement on, DELETE FROM users must cascade to book_insights
    via the new user_id FK."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (77, 'g', 'u@b.com', 'U', '')"
        )
        await db.execute("INSERT INTO books (id, title, images) VALUES (900, 'T', '[]')")
        await db.execute(
            "INSERT INTO book_insights (user_id, book_id, chapter_index, question, answer) "
            "VALUES (77, 900, 0, 'Q?', 'A')"
        )
        await db.commit()

        await db.execute("DELETE FROM users WHERE id = 77")
        await db.commit()

        async with db.execute(
            "SELECT COUNT(*) FROM book_insights WHERE user_id = 77"
        ) as cur:
            assert (await cur.fetchone())[0] == 0


async def test_migration_032_cascade_deletes_on_book_delete(tmp_db):
    """DELETE FROM books must cascade to both book_insights and
    chapter_summaries via the new book_id FKs."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, picture) "
            "VALUES (88, 'g', 'u2@b.com', 'U2', '')"
        )
        await db.execute("INSERT INTO books (id, title, images) VALUES (910, 'T', '[]')")
        await db.execute(
            "INSERT INTO book_insights (user_id, book_id, chapter_index, question, answer) "
            "VALUES (88, 910, 0, 'Q?', 'A')"
        )
        await db.execute(
            "INSERT INTO chapter_summaries (book_id, chapter_index, content) "
            "VALUES (910, 0, 'sum')"
        )
        await db.commit()

        await db.execute("DELETE FROM books WHERE id = 910")
        await db.commit()

        async with db.execute(
            "SELECT COUNT(*) FROM book_insights WHERE book_id = 910"
        ) as cur:
            assert (await cur.fetchone())[0] == 0
        async with db.execute(
            "SELECT COUNT(*) FROM chapter_summaries WHERE book_id = 910"
        ) as cur:
            assert (await cur.fetchone())[0] == 0


async def test_migration_033_cleans_orphan_translations_and_audio_cache(tmp_db):
    """Seed rows pointing at missing books, re-run migration 033, confirm the
    pre-rewrite orphan DELETEs wiped them so the subsequent INSERT INTO _new
    SELECT * does not violate the new FK."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO books (id, title, images) VALUES (1000, 'Book', '[]')"
        )
        # Valid parent — these rows should survive.
        await db.execute(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
            "VALUES (1000, 0, 'de', '[\"hallo\"]')"
        )
        await db.execute(
            "INSERT INTO audio_cache (book_id, chapter_index, provider, voice, content_type, audio) "
            "VALUES (1000, 0, 'gemini', 'v1', 'audio/mpeg', X'01')"
        )
        # Orphan rows — bogus book ids.
        await db.execute(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
            "VALUES (9991, 0, 'de', '[\"bogus\"]')"
        )
        await db.execute(
            "INSERT INTO audio_cache (book_id, chapter_index, provider, voice, content_type, audio) "
            "VALUES (9992, 0, 'gemini', 'v1', 'audio/mpeg', X'02')"
        )
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '033_fk_translations_audio_cache'"
        )
        await db.commit()

    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT book_id FROM translations ORDER BY book_id"
        ) as cur:
            rows = [r[0] for r in await cur.fetchall()]
        assert rows == [1000], f"only valid translation should survive; got {rows}"

        async with db.execute(
            "SELECT book_id FROM audio_cache ORDER BY book_id"
        ) as cur:
            rows = [r[0] for r in await cur.fetchall()]
        assert rows == [1000], f"only valid audio_cache row should survive; got {rows}"


async def test_migration_033_translations_carries_declared_fk(tmp_db):
    """After migration 033, PRAGMA foreign_key_list must report the books FK."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("PRAGMA foreign_key_list(translations)") as cur:
            fks = await cur.fetchall()

    fk_map = {(row[2], row[3]): (row[4], row[5], row[6]) for row in fks}
    assert ("books", "book_id") in fk_map, f"missing books FK: {fk_map}"
    assert fk_map[("books", "book_id")][2] == "CASCADE"


async def test_migration_033_audio_cache_carries_declared_fk(tmp_db):
    """After migration 033, PRAGMA foreign_key_list must report the books FK."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("PRAGMA foreign_key_list(audio_cache)") as cur:
            fks = await cur.fetchall()

    fk_map = {(row[2], row[3]): (row[4], row[5], row[6]) for row in fks}
    assert ("books", "book_id") in fk_map, f"missing books FK: {fk_map}"
    assert fk_map[("books", "book_id")][2] == "CASCADE"


async def test_migration_033_preserves_existing_rows(tmp_db):
    """INSERT … SELECT * must round-trip data including the post-initial
    columns (provider/model added in 007, title_translation in 011)."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO books (id, title, images) VALUES (1100, 'T', '[]')"
        )
        await db.execute(
            "INSERT INTO translations (book_id, chapter_index, target_language, "
            "paragraphs, provider, model, title_translation) VALUES "
            "(1100, 3, 'de', '[\"p\"]', 'gemini', 'flash', 'Titel')"
        )
        await db.execute(
            "INSERT INTO audio_cache (book_id, chapter_index, chunk_index, "
            "provider, voice, content_type, audio) VALUES "
            "(1100, 3, 1, 'gemini', 'v2', 'audio/mpeg', X'ABCDEF')"
        )
        await db.execute(
            "DELETE FROM schema_migrations WHERE version = '033_fk_translations_audio_cache'"
        )
        await db.commit()

    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT chapter_index, target_language, paragraphs, provider, model, title_translation "
            "FROM translations WHERE book_id = 1100"
        ) as cur:
            row = await cur.fetchone()
        assert row == (3, "de", '["p"]', "gemini", "flash", "Titel")

        async with db.execute(
            "SELECT chapter_index, chunk_index, provider, voice, content_type, audio "
            "FROM audio_cache WHERE book_id = 1100"
        ) as cur:
            row = await cur.fetchone()
        assert row == (3, 1, "gemini", "v2", "audio/mpeg", b"\xab\xcd\xef")


async def test_migration_033_preserves_primary_keys(tmp_db):
    """The composite PKs must survive the rewrite — duplicate inserts on the
    same (book_id, chapter_index, target_language) / (book_id, chapter_index,
    chunk_index, provider, voice) must still raise IntegrityError."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute("INSERT INTO books (id, title, images) VALUES (1200, 'T', '[]')")
        await db.execute(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
            "VALUES (1200, 0, 'de', '[\"a\"]')"
        )
        await db.commit()

        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
                "VALUES (1200, 0, 'de', '[\"b\"]')"
            )
            await db.commit()


async def test_migration_033_cascade_deletes_on_book_delete(tmp_db):
    """DELETE FROM books must cascade to translations and audio_cache via the
    new book_id FKs."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("INSERT INTO books (id, title, images) VALUES (1300, 'T', '[]')")
        await db.execute(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
            "VALUES (1300, 0, 'de', '[\"a\"]')"
        )
        await db.execute(
            "INSERT INTO audio_cache (book_id, chapter_index, provider, voice, content_type, audio) "
            "VALUES (1300, 0, 'gemini', 'v1', 'audio/mpeg', X'01')"
        )
        await db.commit()

        await db.execute("DELETE FROM books WHERE id = 1300")
        await db.commit()

        async with db.execute(
            "SELECT COUNT(*) FROM translations WHERE book_id = 1300"
        ) as cur:
            assert (await cur.fetchone())[0] == 0
        async with db.execute(
            "SELECT COUNT(*) FROM audio_cache WHERE book_id = 1300"
        ) as cur:
            assert (await cur.fetchone())[0] == 0


# ── 040_book_freeze (issue #2624 / docs/design/local-first-content.md) ────────

async def test_migration_040_book_freeze_tables_created(tmp_db):
    """Fresh DB: book_freeze and book_chapters exist with usable columns."""
    applied = await run_migrations(tmp_db)
    assert "040_book_freeze" in applied

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("INSERT INTO books (id, title, images) VALUES (1400, 'T', '[]')")
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, "
            "frozen_at, audited_by, content_sha256) "
            "VALUES (1400, 'html_preference', 'epub', '2026-08-06', 'alfmunny', 'abc')"
        )
        await db.execute(
            "INSERT INTO book_chapters (book_id, chapter_index, title, text) "
            "VALUES (1400, 0, 'Zueignung', 'Ihr naht euch wieder')"
        )
        await db.commit()

        async with db.execute(
            "SELECT splitter, chapter_source FROM book_freeze WHERE book_id = 1400"
        ) as cur:
            assert await cur.fetchone() == ("html_preference", "epub")
        async with db.execute(
            "SELECT title, text FROM book_chapters WHERE book_id = 1400"
        ) as cur:
            assert await cur.fetchone() == ("Zueignung", "Ihr naht euch wieder")


async def test_migration_040_primary_keys_enforced(tmp_db):
    """One freeze row per book; one chapter row per (book, index)."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("INSERT INTO books (id, title, images) VALUES (1401, 'T', '[]')")
        await db.execute(
            "INSERT INTO book_chapters (book_id, chapter_index, text) VALUES (1401, 0, 'a')"
        )
        await db.commit()
        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "INSERT INTO book_chapters (book_id, chapter_index, text) VALUES (1401, 0, 'b')"
            )
            await db.commit()


async def test_migration_040_cascade_deletes_on_book_delete(tmp_db):
    """DELETE FROM books must cascade to book_freeze and book_chapters."""
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("INSERT INTO books (id, title, images) VALUES (1402, 'T', '[]')")
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, "
            "frozen_at, audited_by, content_sha256) "
            "VALUES (1402, 'html_preference', 'text', '2026-08-06', 'alfmunny', 'abc')"
        )
        await db.execute(
            "INSERT INTO book_chapters (book_id, chapter_index, text) VALUES (1402, 0, 'a')"
        )
        await db.commit()

        await db.execute("DELETE FROM books WHERE id = 1402")
        await db.commit()

        for table in ("book_freeze", "book_chapters"):
            async with db.execute(
                f"SELECT COUNT(*) FROM {table} WHERE book_id = 1402"
            ) as cur:
                assert (await cur.fetchone())[0] == 0


# ── 042: merge inflected vocabulary entries into their base form (#2663) ──────

_M042 = "042_vocabulary_base_form_merge"


async def _seed_for_042(tmp_db, rows, extra=None):
    """Apply every migration, seed `rows` into vocabulary, then rewind 042.

    Each row is (id, user_id, word, lemma). `extra` runs additional seeding SQL
    before 042 is re-applied. Returns nothing; caller re-runs the migrations.
    """
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT INTO users (google_id, email, name, picture) VALUES ('g1','a@b.com','A','')"
        )
        await db.execute(
            "INSERT INTO users (google_id, email, name, picture) VALUES ('g2','b@b.com','B','')"
        )
        await db.execute("INSERT INTO books (id, title, images) VALUES (1500, 'T', '[]')")
        for vid, uid, word, lemma in rows:
            await db.execute(
                "INSERT INTO vocabulary (id, user_id, word, lemma, language) VALUES (?,?,?,?,'en')",
                (vid, uid, word, lemma),
            )
        for sql in (extra or []):
            await db.execute(sql)
        await db.execute("DELETE FROM schema_migrations WHERE version = ?", (_M042,))
        await db.commit()
    await run_migrations(tmp_db)


async def test_migration_042_merges_inflected_entry_into_base_form(tmp_db):
    await _seed_for_042(
        tmp_db,
        [(1, 1, "acknowledged", "acknowledge"), (2, 1, "acknowledge", "acknowledge")],
        ["INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text) "
         "VALUES (1, 1500, 0, 'universally acknowledged')"],
    )
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT word FROM vocabulary WHERE user_id = 1") as cur:
            assert [r[0] for r in await cur.fetchall()] == ["acknowledge"]
        # The occurrence moved rather than being cascade-deleted with its old row.
        async with db.execute(
            "SELECT vocabulary_id, sentence_text FROM word_occurrences"
        ) as cur:
            assert await cur.fetchall() == [(2, "universally acknowledged")]


async def test_migration_042_creates_the_base_entry_when_absent(tmp_db):
    """Only the inflected form was ever saved — the base entry is created."""
    await _seed_for_042(
        tmp_db,
        [(1, 1, "gegangen", "gehen")],
        ["INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text) "
         "VALUES (1, 1500, 2, 'Er ist gegangen')"],
    )
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT word, lemma FROM vocabulary WHERE user_id = 1") as cur:
            assert await cur.fetchall() == [("gehen", "gehen")]
        async with db.execute("SELECT sentence_text FROM word_occurrences") as cur:
            assert await cur.fetchall() == [("Er ist gegangen",)]


async def test_migration_042_dedupes_an_occurrence_both_entries_share(tmp_db):
    """Same sentence saved under both forms → one occurrence, none orphaned."""
    await _seed_for_042(
        tmp_db,
        [(1, 1, "acknowledged", "acknowledge"), (2, 1, "acknowledge", "acknowledge")],
        ["INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text) "
         "VALUES (1, 1500, 0, 'same sentence')",
         "INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text) "
         "VALUES (2, 1500, 0, 'same sentence')"],
    )
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT COUNT(*) FROM word_occurrences") as cur:
            assert (await cur.fetchone())[0] == 1
        async with db.execute("SELECT COUNT(*) FROM word_occurrences WHERE vocabulary_id = 2") as cur:
            assert (await cur.fetchone())[0] == 1


async def test_migration_042_preserves_spaced_repetition_history(tmp_db):
    """flashcard_reviews cascades off vocabulary(id) — a naive delete would wipe
    the user's SRS progress for every inflected word."""
    await _seed_for_042(
        tmp_db,
        [(1, 1, "acknowledged", "acknowledge")],
        ["INSERT INTO flashcard_reviews (user_id, vocabulary_id, interval_days, ease_factor, "
         "repetitions, due_date) VALUES (1, 1, 21, 2.6, 7, '2026-09-01')"],
    )
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT v.word, f.repetitions, f.interval_days FROM flashcard_reviews f "
            "JOIN vocabulary v ON v.id = f.vocabulary_id"
        ) as cur:
            assert await cur.fetchall() == [("acknowledge", 7, 21)]


async def test_migration_042_keeps_the_stronger_review_state_on_conflict(tmp_db):
    """Both entries have review history: the more-reviewed one survives."""
    await _seed_for_042(
        tmp_db,
        [(1, 1, "acknowledged", "acknowledge"), (2, 1, "acknowledge", "acknowledge")],
        ["INSERT INTO flashcard_reviews (user_id, vocabulary_id, repetitions, interval_days) "
         "VALUES (1, 1, 9, 30)",
         "INSERT INTO flashcard_reviews (user_id, vocabulary_id, repetitions, interval_days) "
         "VALUES (1, 2, 1, 1)"],
    )
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT vocabulary_id, repetitions, interval_days FROM flashcard_reviews"
        ) as cur:
            assert await cur.fetchall() == [(2, 9, 30)]


async def test_migration_042_keeps_base_review_state_when_it_is_stronger(tmp_db):
    await _seed_for_042(
        tmp_db,
        [(1, 1, "acknowledged", "acknowledge"), (2, 1, "acknowledge", "acknowledge")],
        ["INSERT INTO flashcard_reviews (user_id, vocabulary_id, repetitions, interval_days) "
         "VALUES (1, 1, 2, 3)",
         "INSERT INTO flashcard_reviews (user_id, vocabulary_id, repetitions, interval_days) "
         "VALUES (1, 2, 8, 40)"],
    )
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT vocabulary_id, repetitions, interval_days FROM flashcard_reviews"
        ) as cur:
            assert await cur.fetchall() == [(2, 8, 40)]


async def test_migration_042_preserves_tags_and_deck_membership(tmp_db):
    await _seed_for_042(
        tmp_db,
        [(1, 1, "acknowledged", "acknowledge")],
        ["INSERT INTO vocabulary_tags (user_id, vocabulary_id, tag) VALUES (1, 1, 'austen')",
         "INSERT INTO decks (id, user_id, name, mode) VALUES (5, 1, 'D', 'manual')",
         "INSERT INTO deck_members (deck_id, vocabulary_id) VALUES (5, 1)"],
    )
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT v.word, t.tag FROM vocabulary_tags t JOIN vocabulary v ON v.id = t.vocabulary_id"
        ) as cur:
            assert await cur.fetchall() == [("acknowledge", "austen")]
        async with db.execute(
            "SELECT v.word FROM deck_members m JOIN vocabulary v ON v.id = m.vocabulary_id"
        ) as cur:
            assert await cur.fetchall() == [("acknowledge",)]


async def test_migration_042_leaves_unresolved_and_base_entries_alone(tmp_db):
    """lemma IS NULL cannot be resolved offline; lemma == word is already a base."""
    await _seed_for_042(
        tmp_db,
        [(1, 1, "whale", None), (2, 1, "leviathan", "leviathan")],
    )
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT word FROM vocabulary WHERE user_id = 1 ORDER BY word") as cur:
            assert [r[0] for r in await cur.fetchall()] == ["leviathan", "whale"]


async def test_migration_042_skips_chains_rather_than_destroying_them(tmp_db):
    """word→y where y is itself inflected: merging would move rows onto an entry
    that is about to be deleted, so the chain is left intact instead."""
    await _seed_for_042(
        tmp_db,
        [(1, 1, "aaa", "bbb"), (2, 1, "bbb", "ccc")],
        ["INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text) "
         "VALUES (1, 1500, 0, 'chained')"],
    )
    async with aiosqlite.connect(tmp_db) as db:
        # "aaa" is not merged into "bbb" (which is itself inflected), so its
        # occurrence must still exist rather than having been cascade-deleted.
        async with db.execute("SELECT COUNT(*) FROM word_occurrences WHERE sentence_text = 'chained'") as cur:
            assert (await cur.fetchone())[0] == 1


async def test_migration_042_does_not_merge_across_users(tmp_db):
    await _seed_for_042(
        tmp_db,
        [(1, 1, "acknowledged", "acknowledge"), (2, 2, "acknowledge", "acknowledge")],
    )
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT user_id, word FROM vocabulary ORDER BY user_id") as cur:
            assert await cur.fetchall() == [(1, "acknowledge"), (2, "acknowledge")]


async def test_migration_042_is_idempotent(tmp_db):
    await _seed_for_042(
        tmp_db,
        [(1, 1, "acknowledged", "acknowledge")],
        ["INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text) "
         "VALUES (1, 1500, 0, 's')"],
    )
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("DELETE FROM schema_migrations WHERE version = ?", (_M042,))
        await db.commit()
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT word FROM vocabulary") as cur:
            assert [r[0] for r in await cur.fetchall()] == ["acknowledge"]
        async with db.execute("SELECT COUNT(*) FROM word_occurrences") as cur:
            assert (await cur.fetchone())[0] == 1


# ── 045: cross-session chapter-audit drafts ──────────────────────────────────

async def test_migration_045_adds_audit_draft_columns(tmp_db):
    """reviewed/updated_at let an audit resume in a later session."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT name FROM pragma_table_info('user_book_chapters')") as cur:
            cols = {r[0] for r in await cur.fetchall()}
    assert {"reviewed", "updated_at"} <= cols


async def test_migration_045_defaults_existing_rows_to_unreviewed(tmp_db):
    """Additive and defaulted — a draft written before 045 reads as untouched."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute("INSERT INTO books (id, title, images) VALUES (1600, 'T', '[]')")
        await db.execute(
            "INSERT INTO user_book_chapters (book_id, chapter_index, title, text, is_draft)"
            " VALUES (1600, 0, 'A', 'x', 1)"
        )
        await db.commit()
        async with db.execute(
            "SELECT reviewed, updated_at FROM user_book_chapters WHERE book_id=1600"
        ) as cur:
            assert await cur.fetchone() == (0, None)


async def test_migration_045_creates_the_recency_index(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='ubc_draft_recent'"
        ) as cur:
            assert await cur.fetchone() is not None


# ── 046: freezing no longer publishes ────────────────────────────────────────

_M046 = "046_book_publish_gate"


async def test_migration_046_adds_published_at(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT name FROM pragma_table_info('book_freeze')") as cur:
            assert "published_at" in {r[0] for r in await cur.fetchall()}


async def test_migration_046_backfills_existing_freezes_as_published(
    tmp_db, tmp_migrations, monkeypatch
):
    """The cleanup step. Books frozen before this migration are already visible to
    readers — without the backfill the library empties on deploy.

    Applies 001-045 first so a freeze row can exist *before* 046 runs, which is the
    only state where the backfill does anything.
    """
    real_dir = os.path.join(os.path.dirname(__file__), "..", "migrations")
    files = sorted(f for f in os.listdir(real_dir) if f.endswith(".sql"))
    for f in files:
        if f.startswith("046"):
            continue
        shutil.copy(os.path.join(real_dir, f), os.path.join(tmp_migrations, f))
    monkeypatch.setattr("services.migrations._MIGRATIONS_DIR", tmp_migrations)
    await run_migrations(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute("INSERT INTO books (id, title, images) VALUES (1700, 'T', '[]')")
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, frozen_at,"
            " audited_by, content_sha256) VALUES (1700, 's', 'epub', '2026-08-01', 'a', 'h')"
        )
        await db.commit()

    shutil.copy(
        os.path.join(real_dir, "046_book_publish_gate.sql"),
        os.path.join(tmp_migrations, "046_book_publish_gate.sql"),
    )
    applied = await run_migrations(tmp_db)
    assert "046_book_publish_gate" in applied

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT published_at FROM book_freeze WHERE book_id=1700") as cur:
            assert (await cur.fetchone())[0] == "2026-08-01"


async def test_migration_046_creates_the_published_index(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='book_freeze_published'"
        ) as cur:
            assert await cur.fetchone() is not None


# ── 052: apply the declared front-matter labels to existing rows ─────────────

_M052 = "052_label_frontmatter"


async def _seed_frontmatter_book(db, book_id: int, title: str):
    await db.execute("PRAGMA foreign_keys = OFF")
    await db.execute(
        "INSERT OR IGNORE INTO books (id, title, images) VALUES (?, 'T', '[]')", (book_id,)
    )
    await db.execute(
        "INSERT INTO book_chapters (book_id, chapter_index, title, text) VALUES (?, 0, ?, 'x')",
        (book_id, title),
    )
    await db.execute(
        "INSERT INTO book_chapters (book_id, chapter_index, title, text) VALUES (?, 1, 'Real', 'y')",
        (book_id,),
    )


async def _rerun_052(tmp_db):
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("DELETE FROM schema_migrations WHERE version = ?", (_M052,))
        await db.commit()
    await run_migrations(tmp_db)


async def test_migration_057_labels_the_declared_chapters(tmp_db):
    """Books ingested before #2763 carry NULL, so the Front matter group never
    appears for them — this is what makes the feature visible."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_frontmatter_book(db, 345, "TITLE PAGE")
        await _seed_frontmatter_book(db, 2554, "Translated By Constance Garnett")
        await _seed_frontmatter_book(db, 2701, "MOBY-DICK; or, THE WHALE.")
        await db.commit()

    await _rerun_052(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT book_id, role FROM book_chapters WHERE chapter_index = 0 ORDER BY book_id"
        ) as cur:
            assert await cur.fetchall() == [
                (345, "frontmatter"), (2554, "frontmatter"), (2701, "frontmatter"),
            ]


async def test_migration_057_leaves_the_body_alone(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_frontmatter_book(db, 345, "TITLE PAGE")
        await db.commit()
    await _rerun_052(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT role FROM book_chapters WHERE book_id = 345 AND chapter_index = 1"
        ) as cur:
            assert (await cur.fetchone())[0] is None


async def test_migration_057_labels_nothing_when_the_title_does_not_match(tmp_db):
    """The guard that matters. If a split shifted and index 0 is now a real
    chapter, labelling it would hide part of the work — far worse than leaving a
    title page visible."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_frontmatter_book(db, 345, "CHAPTER I JONATHAN HARKER'S JOURNAL")
        await db.commit()
    await _rerun_052(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT role FROM book_chapters WHERE book_id = 345") as cur:
            assert [r[0] for r in await cur.fetchall()] == [None, None]


async def test_migration_057_does_not_label_undeclared_books(tmp_db):
    """Only the audited set. Dorian Gray's PREFACE is Wilde's, part of the work."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_frontmatter_book(db, 174, "THE PREFACE")
        await db.commit()
    await _rerun_052(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT role FROM book_chapters WHERE book_id = 174") as cur:
            assert all(r[0] is None for r in await cur.fetchall())


async def test_migration_057_matches_the_declared_overrides(tmp_db):
    """The migration and chapter_split_overrides.py must not drift: a re-ingest
    rewrites role from the artifact, so a book declared in one and not the other
    would flip its label depending on which ran last."""
    from scripts.chapter_split_overrides import OVERRIDES

    declared = {
        (bid, entry["index"], entry["expect_title"])
        for bid, spec in OVERRIDES.items()
        for entry in spec.get("frontmatter", [])
    }
    path = os.path.join(os.path.dirname(__file__), "..", "migrations", "052_label_frontmatter.sql")
    sql = open(path, encoding="utf-8").read()
    for book_id, index, title in declared:
        assert f"book_id = {book_id} AND chapter_index = {index}" in sql, f"{book_id} missing"
        assert title.replace("'", "''") in sql, f"{book_id} title guard missing"


# ── 056: name Hamlet's acts for the scenes they contain ──────────────────────

_M056 = "056_hamlet_act_scene_titles"

_HAMLET_ACTS = [
    (0, "ACT I", "ACT I, SCENE I. Elsinore. A platform before the Castle."),
    (5, "ACT II", "ACT II, SCENE I. A room in Polonius’s house."),
    (7, "ACT III", "ACT III, SCENE I. A room in the Castle."),
    (11, "ACT IV", "ACT IV, SCENE I. A room in the Castle."),
    (18, "ACT V", "ACT V, SCENE I. A churchyard."),
]

_OLD_SHA = "933be729d90560ea85871be9d481dc5ce8772aea5f0d105ba0aeb69c9c796869"
_NEW_SHA = "26b228ab53ed94a54925886bbc95bb35197ad99904ceebc919e2e1770a1e1705"


async def _seed_hamlet(db, acts=_HAMLET_ACTS, sha=_OLD_SHA):
    await db.execute("PRAGMA foreign_keys = OFF")
    await db.execute(
        "INSERT OR IGNORE INTO books (id, title, images) VALUES (1524, 'Hamlet', '[]')"
    )
    for index, old, _new in acts:
        await db.execute(
            "INSERT INTO book_chapters (book_id, chapter_index, title, text)"
            " VALUES (1524, ?, ?, 'x')",
            (index, old),
        )
    # A scene chapter that must not be touched.
    await db.execute(
        "INSERT INTO book_chapters (book_id, chapter_index, title, text)"
        " VALUES (1524, 1, 'SCENE II. Elsinore. A room of state in the Castle.', 'y')"
    )
    await db.execute(
        "INSERT INTO book_freeze (book_id, splitter, chapter_source, frozen_at,"
        " audited_by, content_sha256) VALUES (1524, 'html_preference', 'text',"
        " '2026-08-26', 'architect-agent', ?)",
        (sha,),
    )


async def _rerun_056(tmp_db):
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("DELETE FROM schema_migrations WHERE version = ?", (_M056,))
        await db.commit()
    await run_migrations(tmp_db)


async def test_migration_057_names_each_act_for_its_scene(tmp_db):
    """The chapter titled 'ACT I' is Act I Scene I; the panel never said so."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_hamlet(db)
        await db.commit()

    await _rerun_056(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        for index, _old, new in _HAMLET_ACTS:
            row = await (await db.execute(
                "SELECT title FROM book_chapters WHERE book_id = 1524 AND chapter_index = ?",
                (index,),
            )).fetchone()
            assert row[0] == new, f"chapter {index}"


async def test_migration_057_leaves_the_scene_chapters_alone(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_hamlet(db)
        await db.commit()

    await _rerun_056(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        row = await (await db.execute(
            "SELECT title FROM book_chapters WHERE book_id = 1524 AND chapter_index = 1"
        )).fetchone()
        assert row[0] == "SCENE II. Elsinore. A room of state in the Castle."


async def test_migration_057_restamps_the_integrity_hash(tmp_db):
    """`title` sits inside content_sha256, unlike `role`. Leaving the old hash
    would make every row disagree with its own integrity stamp."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_hamlet(db)
        await db.commit()

    await _rerun_056(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        row = await (await db.execute(
            "SELECT content_sha256, audited_by FROM book_freeze WHERE book_id = 1524"
        )).fetchone()
        assert row[0] == _NEW_SHA
        assert "act/scene titling" in row[1]


async def test_migration_057_does_not_restamp_a_partial_match(tmp_db):
    """A split that has shifted must not be stamped with a hash describing a
    different chapter list — that would assert an integrity that isn't there."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        # Act IV is something else entirely: only four of five can match.
        moved = [a for a in _HAMLET_ACTS if a[0] != 11]
        moved.append((11, "SOMETHING ELSE", "SOMETHING ELSE"))
        await _seed_hamlet(db, acts=moved)
        await db.commit()

    await _rerun_056(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        row = await (await db.execute(
            "SELECT content_sha256 FROM book_freeze WHERE book_id = 1524"
        )).fetchone()
        assert row[0] == _OLD_SHA, "hash re-stamped despite a shifted split"
        untouched = await (await db.execute(
            "SELECT title FROM book_chapters WHERE book_id = 1524 AND chapter_index = 11"
        )).fetchone()
        assert untouched[0] == "SOMETHING ELSE"


async def test_migration_056_titles_are_exactly_what_059_supersedes(tmp_db):
    """Drift guard for the 056 → 059 chain.

    056 put the act into the title because the panel was flat; 059 moved it to
    the group header and stripped the prefix again. The committed artifact now
    reflects 059, so this no longer pins to the artifact — what must stay true
    is that every title 056 writes is exactly a title 059 expects to find. Edit
    one side alone and a database sitting between the two migrations is
    stranded, with 059's guards matching nothing and its re-stamp skipped.

    It also guards the bug 056 nearly shipped with: the source sets 'Polonius’s'
    with U+2019, and a straight ASCII apostrophe would write a title no artifact
    ever contained while silently failing the hash re-stamp.
    """
    def read(name):
        return open(os.path.join(os.path.dirname(__file__), "..", "migrations", name),
                    encoding="utf-8").read()

    sql_056 = read("056_hamlet_act_scene_titles.sql")
    sql_059 = read("059_hamlet_act_groups.sql")

    for index, _old, intermediate in _HAMLET_ACTS:
        escaped = intermediate.replace("'", "''")
        assert escaped in sql_056, f"chapter {index}: 056 no longer writes this title"
        assert escaped in sql_059, f"chapter {index}: 059 no longer expects what 056 writes"

    # 056 stamps its own hash; 059 stamps a different one over it.
    assert _NEW_SHA in sql_056
    assert _NEW_SHA not in sql_059


# ── 057: German noun capitals restored (#2768) ───────────────────────────────

async def _seed_vocab(db_path: str, rows: list[tuple[int, str, str]]) -> None:
    """Seed (user_id, word, language) vocabulary rows."""
    async with aiosqlite.connect(db_path) as db:
        await db.execute("INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (1,'g1','e1','n')")
        await db.execute("INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (2,'g2','e2','n')")
        await db.executemany(
            "INSERT INTO vocabulary (user_id, word, lemma, language) VALUES (?,?,?,?)",
            [(u, w, w, lang) for u, w, lang in rows],
        )
        await db.commit()


async def _words(db_path: str) -> list[str]:
    async with aiosqlite.connect(db_path) as db:
        async with db.execute("SELECT word FROM vocabulary ORDER BY word") as cur:
            return [r[0] for r in await cur.fetchall()]


async def _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch):
    """Run every migration except 057, so rows can exist before it lands."""
    real_dir = os.path.join(os.path.dirname(__file__), "..", "migrations")
    for f in sorted(x for x in os.listdir(real_dir) if x.endswith(".sql")):
        if not f.startswith("057"):
            shutil.copy(os.path.join(real_dir, f), os.path.join(tmp_migrations, f))
    monkeypatch.setattr("services.migrations._MIGRATIONS_DIR", tmp_migrations)
    await run_migrations(tmp_db)
    shutil.copy(os.path.join(real_dir, "057_vocabulary_restore_noun_capitals.sql"),
                os.path.join(tmp_migrations, "057_vocabulary_restore_noun_capitals.sql"))


async def test_migration_057_capitalises_the_five_nouns(tmp_db, tmp_migrations, monkeypatch):
    await _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch)
    await _seed_vocab(tmp_db, [(1, w, "de") for w in
                               ("gesell", "laffe", "leichnam", "pracht", "schalk")])

    await run_migrations(tmp_db)

    assert await _words(tmp_db) == ["Gesell", "Laffe", "Leichnam", "Pracht", "Schalk"]


async def test_migration_057_leaves_the_nominalised_verb_alone(tmp_db, tmp_migrations, monkeypatch):
    """`verheeren` appears capitalised in the text but its lemma is a verb."""
    await _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch)
    await _seed_vocab(tmp_db, [(1, "verheeren", "de"), (1, "zieren", "de")])

    await run_migrations(tmp_db)

    assert await _words(tmp_db) == ["verheeren", "zieren"]


async def test_migration_057_is_scoped_to_german(tmp_db, tmp_migrations, monkeypatch):
    """An identically-spelled word saved in another language is not ours to fix."""
    await _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch)
    await _seed_vocab(tmp_db, [(1, "pracht", "nl")])

    await run_migrations(tmp_db)

    assert await _words(tmp_db) == ["pracht"]


async def test_migration_057_does_not_collide_with_an_existing_capital(
    tmp_db, tmp_migrations, monkeypatch
):
    """Migration 051's index forbids two casings; the guard must skip, not crash."""
    await _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("DROP INDEX IF EXISTS idx_vocabulary_user_word_nocase")
        await db.commit()
    await _seed_vocab(tmp_db, [(1, "pracht", "de"), (1, "Pracht", "de")])

    await run_migrations(tmp_db)

    assert sorted(await _words(tmp_db)) == ["Pracht", "pracht"], "left alone, no collision"


async def _words(db_path: str) -> list[str]:
    async with aiosqlite.connect(db_path) as db:
        async with db.execute("SELECT word FROM vocabulary ORDER BY word") as cur:
            return [r[0] for r in await cur.fetchall()]


async def _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch):
    """Run every migration except 057, so rows can exist before it lands."""
    real_dir = os.path.join(os.path.dirname(__file__), "..", "migrations")
    for f in sorted(x for x in os.listdir(real_dir) if x.endswith(".sql")):
        if not f.startswith("057"):
            shutil.copy(os.path.join(real_dir, f), os.path.join(tmp_migrations, f))
    monkeypatch.setattr("services.migrations._MIGRATIONS_DIR", tmp_migrations)
    await run_migrations(tmp_db)
    shutil.copy(os.path.join(real_dir, "057_vocabulary_restore_noun_capitals.sql"),
                os.path.join(tmp_migrations, "057_vocabulary_restore_noun_capitals.sql"))


async def test_migration_057_capitalises_the_five_nouns(tmp_db, tmp_migrations, monkeypatch):
    await _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch)
    await _seed_vocab(tmp_db, [(1, w, "de") for w in
                               ("gesell", "laffe", "leichnam", "pracht", "schalk")])

    await run_migrations(tmp_db)

    assert await _words(tmp_db) == ["Gesell", "Laffe", "Leichnam", "Pracht", "Schalk"]


async def test_migration_057_leaves_the_nominalised_verb_alone(tmp_db, tmp_migrations, monkeypatch):
    """`verheeren` appears capitalised in the text but its lemma is a verb."""
    await _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch)
    await _seed_vocab(tmp_db, [(1, "verheeren", "de"), (1, "zieren", "de")])

    await run_migrations(tmp_db)

    assert await _words(tmp_db) == ["verheeren", "zieren"]


async def test_migration_057_is_scoped_to_german(tmp_db, tmp_migrations, monkeypatch):
    """An identically-spelled word saved in another language is not ours to fix."""
    await _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch)
    await _seed_vocab(tmp_db, [(1, "pracht", "nl")])

    await run_migrations(tmp_db)

    assert await _words(tmp_db) == ["pracht"]


async def test_migration_057_does_not_collide_with_an_existing_capital(
    tmp_db, tmp_migrations, monkeypatch
):
    """Migration 051's index forbids two casings; the guard must skip, not crash."""
    await _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("DROP INDEX IF EXISTS idx_vocabulary_user_word_nocase")
        await db.commit()
    await _seed_vocab(tmp_db, [(1, "pracht", "de"), (1, "Pracht", "de")])

    await run_migrations(tmp_db)

    assert sorted(await _words(tmp_db)) == ["Pracht", "pracht"], "left alone, no collision"


async def test_migration_057_corrects_every_user(tmp_db, tmp_migrations, monkeypatch):
    """The bug was in shared code, so it hit every reader's rows."""
    await _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch)
    await _seed_vocab(tmp_db, [(1, "pracht", "de"), (2, "pracht", "de")])

    await run_migrations(tmp_db)

    assert await _words(tmp_db) == ["Pracht", "Pracht"]


async def test_migration_057_is_idempotent(tmp_db, tmp_migrations, monkeypatch):
    await _apply_all_but_057(tmp_db, tmp_migrations, monkeypatch)
    await _seed_vocab(tmp_db, [(1, "pracht", "de")])

    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("DELETE FROM schema_migrations WHERE version LIKE '057%'")
        await db.commit()
    await run_migrations(tmp_db)

    assert await _words(tmp_db) == ["Pracht"]


# ── 058/059: part column, and Hamlet's acts as groups ────────────────────────

_M059 = "059_hamlet_act_groups"

_ACT_OF = {0: "ACT I", 1: "ACT I", 2: "ACT I", 3: "ACT I", 4: "ACT I",
           5: "ACT II", 6: "ACT II",
           7: "ACT III", 8: "ACT III", 9: "ACT III", 10: "ACT III",
           11: "ACT IV", 12: "ACT IV", 13: "ACT IV", 14: "ACT IV",
           15: "ACT IV", 16: "ACT IV", 17: "ACT IV",
           18: "ACT V", 19: "ACT V"}

# The five that 056 titled "ACT n, SCENE I. …" and 059 strips back.
_PREFIXED = {
    0: ("ACT I, SCENE I. Elsinore. A platform before the Castle.",
        "SCENE I. Elsinore. A platform before the Castle."),
    5: ("ACT II, SCENE I. A room in Polonius’s house.",
        "SCENE I. A room in Polonius’s house."),
    7: ("ACT III, SCENE I. A room in the Castle.",
        "SCENE I. A room in the Castle."),
    11: ("ACT IV, SCENE I. A room in the Castle.",
         "SCENE I. A room in the Castle."),
    18: ("ACT V, SCENE I. A churchyard.", "SCENE I. A churchyard."),
}

_SHA_056 = "26b228ab53ed94a54925886bbc95bb35197ad99904ceebc919e2e1770a1e1705"
_SHA_059 = "a7007bc694082795f4805fd2510dadfaad37c6ada7273d376cfac43b5bb9954c"


async def _seed_hamlet_acts(db, overrides=None, sha=_SHA_056):
    overrides = overrides or {}
    await db.execute("PRAGMA foreign_keys = OFF")
    await db.execute(
        "INSERT OR IGNORE INTO books (id, title, images) VALUES (1524, 'Hamlet', '[]')"
    )
    for index in range(20):
        title = overrides.get(
            index, _PREFIXED[index][0] if index in _PREFIXED else f"SCENE {index}"
        )
        await db.execute(
            "INSERT INTO book_chapters (book_id, chapter_index, title, text)"
            " VALUES (1524, ?, ?, 'x')",
            (index, title),
        )
    await db.execute(
        "INSERT INTO book_freeze (book_id, splitter, chapter_source, frozen_at,"
        " audited_by, content_sha256) VALUES (1524, 'html_preference', 'text',"
        " '2026-08-30', 'prior', ?)",
        (sha,),
    )


async def _rerun_059(tmp_db):
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("DELETE FROM schema_migrations WHERE version = ?", (_M059,))
        await db.commit()
    await run_migrations(tmp_db)


async def test_migration_058_adds_a_nullable_part_column(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        cols = {r[1] async for r in await db.execute("PRAGMA table_info(book_chapters)")}
    assert "part" in cols


async def test_migration_059_groups_every_scene_under_its_act(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_hamlet_acts(db)
        await db.commit()

    await _rerun_059(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        rows = await (await db.execute(
            "SELECT chapter_index, part FROM book_chapters WHERE book_id = 1524"
            " ORDER BY chapter_index"
        )).fetchall()
    assert {i: p for i, p in rows} == _ACT_OF


async def test_migration_059_drops_the_now_duplicated_act_prefix(tmp_db):
    """Under an ACT I header, 'ACT I, SCENE I. …' says ACT I twice."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_hamlet_acts(db)
        await db.commit()

    await _rerun_059(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        for index, (_old, new) in _PREFIXED.items():
            row = await (await db.execute(
                "SELECT title FROM book_chapters WHERE book_id = 1524 AND chapter_index = ?",
                (index,),
            )).fetchone()
            assert row[0] == new, f"chapter {index}"


async def test_migration_059_restamps_to_the_regenerated_artifact(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_hamlet_acts(db)
        await db.commit()

    await _rerun_059(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        row = await (await db.execute(
            "SELECT content_sha256 FROM book_freeze WHERE book_id = 1524"
        )).fetchone()
    assert row[0] == _SHA_059


async def test_migration_059_does_not_restamp_a_shifted_split(tmp_db):
    """Acts III and IV both open on 'SCENE I. A room in the Castle.', so a guard
    matching on title alone would let one act vouch for the other. Moving act IV
    must still block the re-stamp."""
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await _seed_hamlet_acts(db, overrides={11: "SOMETHING ELSE"})
        await db.commit()

    await _rerun_059(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        sha = await (await db.execute(
            "SELECT content_sha256 FROM book_freeze WHERE book_id = 1524"
        )).fetchone()
        act_iv = await (await db.execute(
            "SELECT part FROM book_chapters WHERE book_id = 1524 AND chapter_index = 11"
        )).fetchone()
    assert sha[0] == _SHA_056, "re-stamped despite a shifted split"
    assert act_iv[0] is None, "grouped an act whose boundary had moved"


async def test_migration_059_leaves_other_books_ungrouped(tmp_db):
    await run_migrations(tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            "INSERT OR IGNORE INTO books (id, title, images) VALUES (345, 'D', '[]')"
        )
        await db.execute(
            "INSERT INTO book_chapters (book_id, chapter_index, title, text)"
            " VALUES (345, 0, 'ACT I, SCENE I. Elsinore. A platform before the Castle.', 'x')"
        )
        await db.commit()

    await _rerun_059(tmp_db)

    async with aiosqlite.connect(tmp_db) as db:
        row = await (await db.execute(
            "SELECT title, part FROM book_chapters WHERE book_id = 345"
        )).fetchone()
    assert row[1] is None
    assert row[0].startswith("ACT I,"), "retitled a book the migration does not name"


async def test_migration_059_matches_the_committed_artifact(tmp_db):
    """Drift guard: the SQL and the artifact must agree byte-for-byte, including
    the U+2019 in Polonius’s."""
    import json
    artifact = json.load(open(os.path.join(
        os.path.dirname(__file__), "..", "..", "data", "books", "book_1524.json"
    ), encoding="utf-8"))
    sql = open(os.path.join(
        os.path.dirname(__file__), "..", "migrations", "059_hamlet_act_groups.sql"
    ), encoding="utf-8").read()

    assert artifact["split"]["content_sha256"] == _SHA_059
    assert _SHA_059 in sql
    for chapter in artifact["chapters"]:
        assert chapter["part"] == _ACT_OF[chapter["index"]]
    for index, (_old, new) in _PREFIXED.items():
        assert artifact["chapters"][index]["title"] == new
        assert new.replace("'", "''") in sql
