# Design: Declared FKs on Soft `user_id` / `book_id` Columns (Issue #754)

**Status:** Draft — awaiting PM review
**Author:** Architect
**Date:** 2026-04-24
**Priority:** P3 — quality-of-life hardening; no user-visible bug today.
**Prior work:** #700 (design), #751 (PRAGMA enforcement), #774 (shadow-delete cleanup), #755 (remaining shadow-delete revert)

---

## Problem

PR #751 (closes #700) enabled `PRAGMA foreign_keys = ON` on every backend connection. From that moment on, every *declared* `ON DELETE CASCADE` started firing automatically and we were able to retire the first batch of shadow-cascade code (#774). But the schema still has many tables whose `user_id` / `book_id` columns are **soft references** — no `REFERENCES` clause at all — so SQLite cannot cascade them. Wherever those columns appear, we still carry manual cascade logic in `services/admin.delete_book` and `services/auth.delete_user`, and we remain one forgotten child table away from the class of bug that #700 was supposed to eliminate.

The #700 design doc explicitly punted this follow-up:

> Adding new declared FKs requires per-table table-rewrite migrations and deserves its own design doc.

This is that design doc.

### Tables still carrying soft references

From a schema audit (`grep -rnE 'user_id|book_id' backend/migrations/*.sql | grep -v REFERENCES`):

| Table                | Soft column(s)         | Parent        | Cascade      |
|----------------------|------------------------|---------------|--------------|
| `annotations`        | `user_id`, `book_id`   | users, books  | `ON DELETE CASCADE` |
| `vocabulary`         | `user_id`              | users         | `ON DELETE CASCADE` |
| `word_occurrences`   | `book_id`              | books         | `ON DELETE CASCADE` |
| `book_insights`      | `user_id`, `book_id`   | users, books  | `ON DELETE CASCADE` |
| `chapter_summaries`  | `book_id`              | books         | `ON DELETE CASCADE` |
| `translations`       | `book_id`              | books         | `ON DELETE CASCADE` |
| `audio_cache`        | `book_id`              | books         | `ON DELETE CASCADE` |
| `translation_queue`  | `book_id`, `queued_by` | books, users  | `ON DELETE CASCADE` |

Eight tables, ten soft FK columns total.

---

## Goals

1. Every column above carries a declared `REFERENCES <parent>(id) ON DELETE CASCADE` after this work lands.
2. `delete_user` and `admin.delete_book` collapse to their irreducible form — the parent delete and any non-cascading cleanups (audit logs, external files). Every manual child-delete currently executing to backfill a soft FK is removed in the **same** PR that introduces the corresponding declared FK, never before.
3. No data loss: orphan rows that would violate the new FK are audited and cleaned in the same migration that adds the constraint.
4. Rollback is documented, reviewed, and tested.

## Non-goals

- Changing the existing declared FKs (`flashcard_reviews`, `vocabulary_tags`, `deck_members`, `decks`). Those already cascade correctly and are untouched.
- Enforcing FKs during the migration runner's own `ALTER TABLE ... RENAME TO` step — that already runs with `PRAGMA foreign_keys = OFF` and continues to.
- Refactoring `delete_user` / `admin.delete_book` beyond removing the now-redundant manual cascades. Wider cleanup is out of scope.
- Adding FKs to columns that aren't on the soft-reference list (e.g. `annotations.chapter_index` is numeric metadata, not an id; it intentionally has no parent table).

---

## Solution

SQLite does not support `ALTER TABLE ... ADD CONSTRAINT`. The only supported path to add a `REFERENCES` clause to an existing column is the standard **table-rewrite** pattern:

```sql
-- 1. Orphan cleanup (required — see "Orphan audit" below).
DELETE FROM annotations WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM annotations WHERE book_id NOT IN (SELECT id FROM books);

-- 2. Create replacement with declared FKs.
CREATE TABLE annotations_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id        INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index  INTEGER NOT NULL,
    -- …rest of columns unchanged…
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Copy data and swap in.
INSERT INTO annotations_new SELECT * FROM annotations;
DROP TABLE annotations;
ALTER TABLE annotations_new RENAME TO annotations;

-- 4. Recreate indexes. (Indexes on the old name are dropped with the table.)
CREATE INDEX annotations_user_book_ix ON annotations(user_id, book_id);
CREATE INDEX annotations_book_chapter_ix ON annotations(book_id, chapter_index);
```

This follows the shape of `010_rate_limiter_per_model.sql` and the existing migration runner. Migrations already run with `PRAGMA foreign_keys = OFF`, so the inserts do not trigger the new FKs — a necessary property, because the new constraints are only meant to hold *after* the rewrite completes.

### Migration numbering

At the time of writing, `030_invalidate_chapter0_cache.sql` (#818) is in flight, so this series begins at **`031`** and runs through **`034`**. The exact numbers are not load-bearing — if other migrations land in the meantime, every implementation PR rebases and picks the next free slot. What matters is the ordering *within* this series (orphan cleanup before rewrite, highest-volume tables last), not the absolute number.

### Migration split (one PR per migration, four PRs total)

PM's guidance in #754 was to split into "one migration per logical group to keep each migration reviewable." Grouping by parent relationship and data volume:

| PR | Migration file                               | Tables rewritten                                             | Rationale |
|----|----------------------------------------------|--------------------------------------------------------------|-----------|
| 1  | `031_fk_annotations_vocabulary.sql`          | `annotations`, `vocabulary`                                  | User-owned content with highest write volume. Small, easily reviewable. |
| 2  | `032_fk_book_insights_chapter_summaries.sql` | `book_insights`, `chapter_summaries`                         | AI-derived per-chapter caches. |
| 3  | `033_fk_translations_audio_cache.sql`        | `translations`, `audio_cache`                                | Read-heavy caches; largest row counts — isolate to contain lock time. |
| 4  | `034_fk_word_occurrences_translation_queue.sql` | `word_occurrences`, `translation_queue`                    | Queue + word index; last PR in the series also removes the remaining manual cascades in `delete_user` / `admin.delete_book`. |

Each PR stands alone: it declares the FKs for its tables, removes any now-redundant shadow cleanup for those tables only, and includes its own test coverage. No PR depends on any later PR. If review shows we should split further (e.g. `audio_cache` turns out to be too large to rewrite without user-visible latency on a resource-constrained Railway instance), we split; nothing in this design forbids per-table migrations. Implementation PRs pick the next free migration number at rebase time rather than hard-coding `031..034` — if more migrations land in between, the relative ordering of this series is what matters, not the absolute numbers.

### Parent cleanup in `delete_user` / `admin.delete_book`

The manual `DELETE FROM <child> WHERE user_id = ?` / `WHERE book_id = ?` lines added in #687 / #693 / #695 / #408 are removed **in the same PR** that declares the corresponding FK, never earlier. PR ordering:

- PR 1 removes: `annotations`, `vocabulary` cleanups.
- PR 2 removes: `book_insights`, `chapter_summaries` cleanups.
- PR 3 removes: `translations`, `audio_cache` cleanups.
- PR 4 removes: `word_occurrences`, `translation_queue` cleanups **and** the residual `delete_user` / `admin.delete_book` comments/doclets that describe shadow cascades.

After PR 4 both functions collapse to, roughly:

```python
async def delete_user(user_id: int) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        # every child table now declares ON DELETE CASCADE against users(id).
        await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await db.commit()
```

---

## Orphan audit

### Methodology

Per CLAUDE.md's migration policy ("every constraint migration must include a data-cleanup step first"), each migration runs orphan-deletes before the rewrite. Orphan counts today are expected to be near zero — #774 and #755 explicitly cleaned the same rows — but the `DELETE` must run unconditionally, and the test must assert that seeded orphans get cleaned.

Before each migration's `CREATE TABLE <t>_new`:

```sql
-- For every soft column being promoted in this migration:
DELETE FROM <table> WHERE <col> NOT IN (SELECT id FROM <parent>);
```

### Per-table expected counts (from prod snapshot 2026-04-23)

Architect should re-run this audit against a fresh prod snapshot at the start of each implementation PR; numbers below are illustrative of the expected magnitude, not a commitment.

| Table                | Orphans expected | Notes |
|----------------------|------------------|-------|
| `annotations`        | 0                | #774 cleaned these. |
| `vocabulary`         | 0                | Always cascade-tied via PRAGMA since #751. |
| `word_occurrences`   | 0                | Cleaned by `admin.delete_book` manual cascade. |
| `book_insights`      | 0                | Cleaned by #774. |
| `chapter_summaries`  | 0                | Ditto. |
| `translations`       | Small (<100)     | Oldest cache; pre-#408 deletions may leak rows. |
| `audio_cache`        | 0                | Book-scoped only; cleaned in admin cascade. |
| `translation_queue`  | Small            | Historic queued entries for books that were later deleted before #408. |

"Small" here means the orphan DELETE step is not the data-loss risk; the rewrite lock is. See "Risks" below.

---

## Testing

### Per-migration test (goes in `backend/tests/test_migrations.py`)

For each migration PR, two tests:

1. **Seeded-orphan cleanup.** Insert rows with bogus `user_id` / `book_id`, run the migration, assert orphans are gone and parent-linked rows survive.
2. **FK declared correctly after migration.** Inspect `PRAGMA foreign_key_list(<table>)` and assert each expected `(from_col, to_table, to_col, on_delete='CASCADE')` tuple is present.

### Integration test (goes in `backend/tests/test_router_admin.py` and `test_router_auth.py`)

For each PR that removes a manual cascade, a test that:

1. Seeds parent + child rows.
2. Deletes the parent via the live endpoint (`DELETE /admin/users/{id}` / `DELETE /admin/books/{id}`).
3. Asserts child rows are gone.

These tests already exist in some form (#687, #693, #695 all added cascade tests); this design extends them to cover the newly declared FKs. The existing cascade tests continue to pass by construction — declaring an FK adds behavior, doesn't remove it.

### Coverage

Each PR must keep `pytest --cov backend` at or above the current baseline. `test_migrations.py` already has ~20 tests; this series adds ~16 more (2 per migration × 4 migrations + a few boundary cases).

---

## Rollback strategy

The migration runner is forward-only; there is no automated `downgrade` path. Rollback is handled at three layers:

1. **Pre-merge:** every migration PR is reviewed against a copy of prod data (`sqlite3 prod.db < 03N_fk_*.sql` on a disposable clone) before CI merges it. If the rewrite fails or orphan counts look surprising, the PR is pulled.
2. **Post-merge, pre-deploy:** the Railway deploy gate is the migration itself. If a migration aborts at startup, the container fails liveness and traffic stays on the previous image. The partial `*_new` table is dropped by the runner's exception handler; the original table is unchanged.
3. **Post-deploy rollback:** if a rewrite completes but downstream code turns out to be broken, the revert is **restore from Railway snapshot + re-apply migrations up to the prior number**. The `*_new` + `DROP + RENAME` sequence is atomic within a transaction, so a half-rewritten table is not possible; either the whole rewrite committed or none of it did. Revert the PR that introduced the code, keep the schema at its new version.

A "reverse migration" that drops the FK and recreates the old table is explicitly **not** in scope. SQLite table rewrites lose original rowids and index ordering; a reverse migration would break downstream assumptions that already read the post-migration table.

### Snapshot policy for the series

The Architect takes a Railway DB snapshot immediately before each implementation PR merges and attaches the snapshot id to the PR description. Snapshots are kept for 30 days per Railway's retention. The snapshot id is the recovery anchor if anything downstream breaks.

---

## Risks

| Risk | Likelihood | Severity | Mitigation |
|------|------------|----------|------------|
| Rewrite holds a write lock long enough to time out readers | Low | Medium | Tables are small (largest is `translations` at ~100k rows on prod today). Rewrite time is tens of milliseconds. Migration runs at startup so users are not mid-session. |
| Unexpected orphans cause cascade delete to remove real rows | Low | High | Orphan audit runs in a staging clone first; if the count exceeds a threshold (say, 1% of table) the PR is blocked. |
| Index recreation forgotten, degrading a hot query path | Low | Low | Each migration has an explicit `CREATE INDEX` block that mirrors the original schema. Test PR-gate: index list must match pre/post via `PRAGMA index_list(<table>)`. |
| `INSERT INTO <t>_new SELECT * FROM <t>` breaks if column order changes | Low | High | The design deliberately preserves column order in the new table definition. Each PR includes a `PRAGMA table_info(<table>)` comparison test. |
| Concurrent writes during migration corrupt rewrite | N/A | — | Migrations run before the HTTP server starts accepting connections. No concurrent writers. |

---

## Open questions

1. **Split threshold.** Should PR 3 (`translations` + `audio_cache`) further split into two PRs? `translations` has the highest expected row count, and bundling `audio_cache` with it widens the rewrite lock. Proposed: land as a two-table migration; split only if the staging rewrite exceeds 500 ms.
2. **`translation_queue.queued_by` rename.** That column is a user id but the name does not say so. Rename to `queued_by_user_id` while rewriting? **Proposed: no.** Rename widens the blast radius (touches callers in `services/translation_queue.py` and `routers/admin.py`) for aesthetic gain. Keep the name; declare the FK.
3. **Coordination with #755.** #755 is cleaning up more shadow-cascade code. It removes shadow deletes whose parent FK is already declared (e.g. `flashcard_reviews`), so it is independent of this design. Either can land first; no ordering dependency.

---

## Out of scope for this doc

- Full schema rationalization (naming, consolidated audit columns, etc.) — tracked separately if at all.
- Moving to a different database (Postgres etc.) — not on the roadmap.
- Adding FKs to columns that are not listed in the "Tables" table above — those are either already declared, or they are not foreign keys at all.
