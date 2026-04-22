"""
Versioned SQL migration runner for SQLite.

On every backend startup, `run()` is called from `init_db()`. It:

1. Creates a `schema_migrations(version, applied_at)` table if it doesn't exist.
2. Lists all `.sql` files in the `migrations/` directory, sorted by filename.
3. For each file whose version (filename without the .sql extension) is NOT
   already in `schema_migrations`, applies the SQL inside a transaction and
   records the version.
4. Skips files that have already been applied — running twice is a no-op.

Migration files are plain SQL. Each file may contain multiple statements
separated by `;`. Migrations are applied in filename order (that's why
they're numbered 001, 002, etc.).

This module has no external dependencies beyond `aiosqlite`.
"""

import os
import aiosqlite


# Relative to the directory that contains services/ — i.e. the backend root.
_MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "migrations")


async def run(db_path: str) -> list[str]:
    """Apply all pending migrations and return the list of versions applied.

    Returns an empty list if the database is already up-to-date.

    Raises on any SQL error so the caller (init_db) can surface it — a
    failed migration should be a hard stop, not a silent swallow.
    """
    applied: list[str] = []

    async with aiosqlite.connect(db_path) as db:
        # Ensure the tracking table exists.
        await db.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version    TEXT PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()

        # Which versions have already been applied?
        already: set[str] = set()
        async with db.execute("SELECT version FROM schema_migrations") as cursor:
            async for row in cursor:
                already.add(row[0])

        # Bootstrap for existing databases that predate the migration system.
        # Each bootstrap version is only marked as applied if the feature it
        # would create ALREADY EXISTS in the DB. This handles both:
        #   - A pre-migration-system DB (all features exist, nothing tracked)
        #   - A partial-run (001 applied, crashed on 002 — but the feature
        #     was already present from the old init_db)
        # Without this, non-idempotent SQL like ALTER TABLE ADD COLUMN would
        # crash with "duplicate column" on startup.
        bootstrap_checks = [
            # (version, SQL to check if the feature exists — returns a row if yes)
            ("001_initial_schema",
             "SELECT name FROM sqlite_master WHERE type='table' AND name='books'"),
            ("002_add_book_images",
             "SELECT 1 FROM pragma_table_info('books') WHERE name='images'"),
            ("003_create_audio_cache",
             "SELECT name FROM sqlite_master WHERE type='table' AND name='audio_cache'"),
            ("004_user_roles_and_approval",
             "SELECT 1 FROM pragma_table_info('users') WHERE name='role'"),
            ("005_add_github_id",
             "SELECT 1 FROM pragma_table_info('users') WHERE name='github_id'"),
            ("006_add_apple_id",
             "SELECT 1 FROM pragma_table_info('users') WHERE name='apple_id'"),
            ("006_bulk_translation_jobs",
             "SELECT name FROM sqlite_master WHERE type='table' AND name='bulk_translation_jobs'"),
            ("007_translation_provider_info",
             "SELECT 1 FROM pragma_table_info('translations') WHERE name='provider'"),
            ("008_translation_queue",
             "SELECT name FROM sqlite_master WHERE type='table' AND name='translation_queue'"),
            ("009_queue_queued_by",
             "SELECT 1 FROM pragma_table_info('translation_queue') WHERE name='queued_by'"),
            ("010_rate_limiter_per_model",
             "SELECT 1 FROM pragma_table_info('rate_limiter_usage') WHERE name='model'"),
            ("011_translation_title",
             "SELECT 1 FROM pragma_table_info('translations') WHERE name='title_translation'"),
            ("012_user_plan",
             "SELECT 1 FROM pragma_table_info('users') WHERE name='plan'"),
            ("014_annotations_vocabulary",
             "SELECT name FROM sqlite_master WHERE type='table' AND name='annotations'"),
            ("016_insight_context",
             "SELECT 1 FROM pragma_table_info('book_insights') WHERE name='context_text'"),
            ("017_vocabulary_lemma_language",
             "SELECT 1 FROM pragma_table_info('vocabulary') WHERE name='lemma'"),
            ("020_chapter_summaries",
             "SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_summaries'"),
            ("019_reading_history",
             "SELECT name FROM sqlite_master WHERE type='table' AND name='reading_history'"),
        ]
        bootstrapped: list[str] = []
        for version, check_sql in bootstrap_checks:
            if version in already:
                continue
            async with db.execute(check_sql) as cursor:
                if await cursor.fetchone():
                    bootstrapped.append(version)

        if bootstrapped:
            for v in bootstrapped:
                await db.execute(
                    "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
                    (v,),
                )
            await db.commit()
            already.update(bootstrapped)

        # Find all .sql migration files, sorted by name.
        if not os.path.isdir(_MIGRATIONS_DIR):
            return applied

        files = sorted(
            f for f in os.listdir(_MIGRATIONS_DIR)
            if f.endswith(".sql")
        )

        for filename in files:
            version = filename.removesuffix(".sql")
            if version in already:
                continue

            filepath = os.path.join(_MIGRATIONS_DIR, filename)
            sql = open(filepath, encoding="utf-8").read().strip()  # noqa: SIM115
            if not sql:
                continue

            # Apply each statement in the migration file inside one transaction.
            # We split on `;` (with a trailing strip) because aiosqlite's
            # execute() only runs one statement at a time.
            try:
                for statement in sql.split(";"):
                    stmt = statement.strip()
                    if stmt:
                        await db.execute(stmt)

                # Record this version as applied.
                await db.execute(
                    "INSERT INTO schema_migrations (version) VALUES (?)",
                    (version,),
                )
                await db.commit()
                applied.append(version)
            except Exception:
                # Roll back the partially-applied migration and re-raise.
                # The caller (init_db) will see the error and the backend
                # startup will fail loudly — better than silently running
                # with a broken schema.
                await db.rollback()
                raise

    return applied
