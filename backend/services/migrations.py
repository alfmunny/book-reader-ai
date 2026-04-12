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
        # If `schema_migrations` is empty but the `books` table already exists,
        # this is an existing DB that had its schema created by the old inline
        # init_db(). Mark all migrations up to and including the current schema
        # as already applied so we don't try to re-run them (especially the
        # ALTER TABLE that would fail with "duplicate column").
        if not already:
            async with db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='books'"
            ) as cursor:
                existing_books = await cursor.fetchone()
            if existing_books:
                bootstrap_versions = [
                    "001_initial_schema",
                    "002_add_book_images",
                    "003_create_audio_cache",
                ]
                for v in bootstrap_versions:
                    await db.execute(
                        "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
                        (v,),
                    )
                await db.commit()
                already.update(bootstrap_versions)

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
