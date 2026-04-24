# Migration policy

**Every migration that adds a constraint to a table with existing data must include a data-cleanup step first.**

| Constraint type | Required cleanup step |
|---|---|
| `CREATE UNIQUE INDEX` | `DELETE` duplicate rows first (keep lowest `rowid`) |
| `ADD COLUMN … NOT NULL` | `UPDATE` to set a default value on existing rows first |
| `CHECK` constraint | `DELETE` or `UPDATE` rows that would violate it |
| `FOREIGN KEY` enforcement | Delete orphaned rows first |

## Test requirement

Every constraint migration **must** include a test in `test_migrations.py` that:

1. Seeds rows that would violate the constraint.
2. Re-runs the migration (after deleting its `schema_migrations` row).
3. Asserts the violating rows are cleaned and the constraint is now enforced.

Root cause: PR #503 + production outage #526 (2026-04-23). Cleanup-first-then-constraint was the specific fix.

## Table-rewrite pattern

SQLite doesn't support `ALTER TABLE ... ADD CONSTRAINT`. When you need to add a declared FK, rewrite the table:

```sql
-- 1. Orphan cleanup (mandatory per policy).
DELETE FROM <table> WHERE <col> NOT IN (SELECT id FROM <parent>);

-- 2. Create replacement with the new constraint.
CREATE TABLE <table>_new (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    <col>        INTEGER NOT NULL REFERENCES <parent>(id) ON DELETE CASCADE,
    -- …other columns unchanged…
);

-- 3. Copy, swap, recreate indexes + triggers.
INSERT INTO <table>_new SELECT * FROM <table>;
DROP TABLE <table>;
ALTER TABLE <table>_new RENAME TO <table>;
CREATE UNIQUE INDEX IF NOT EXISTS uq_<col> ON <table>(<col>);
CREATE TRIGGER <table>_ai AFTER INSERT ON <table> ...;  -- if FTS5 triggers existed
```

Migrations run with `PRAGMA foreign_keys = OFF` so the `INSERT SELECT *` does not validate FKs during the rewrite.

## Examples

- **[Declared FKs schema (#754)](../design/declared-fks-schema.md)** — eight tables rewritten across four PRs.
- **Migration 010** (`010_rate_limiter_per_model.sql`) — archetype table-rewrite pattern.
- **Migration 028** (`028_fk_orphan_cleanup.sql`) — orphan cleanup before the #751 FK enforcement switch.
- **Migration 029, 030** — cache invalidation patterns (delete stale rows when upstream logic changes).

## Numbering

Migration filenames are `NNN_<name>.sql` with three-digit zero-padded numbers. **Pick the next free number at rebase time** — if multiple PRs are in flight, the numbering can shift. The migration runner applies files in sorted order; the relative order matters, the absolute number doesn't.
