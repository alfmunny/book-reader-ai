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
        # book_insights already has context_text (as if 016 was applied manually)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS book_insights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
                chapter_index INTEGER NOT NULL, insight TEXT NOT NULL,
                context_text TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    assert cols == {"id", "book_id", "chapter_index", "title", "text", "is_draft"}


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
