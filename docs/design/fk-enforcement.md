# Design: Enable `PRAGMA foreign_keys` per connection (Issue #700)

**Status:** Shipped (design PR #742; impl PR #751, 2026-04-23)
**Author:** Architect
**Date:** 2026-04-23
**Priority:** P3 — quality-of-life hardening; no user-visible bug today.

---

## Problem

SQLite's `PRAGMA foreign_keys` defaults to **OFF** and must be set **per connection**. Our `aiosqlite.connect(...)` monkey-patch in `services/db.py` only sets `timeout=30`; it never turns FK enforcement on. As a result, every `ON DELETE CASCADE` constraint declared in the schema is **inert at runtime**.

This has directly caused three production bugs in the last month — each of which had to be patched by writing a manual `DELETE FROM child_table WHERE parent_id = ?` ahead of the parent delete:

| Bug | Fix PR | Site |
|---|---|---|
| Admin delete_book leaves flashcard_reviews orphaned | #687 | `routers/admin.py` |
| Vocabulary delete_word leaves flashcard_reviews orphaned | #693 | `routers/vocabulary.py` |
| delete_user leaves flashcard_reviews orphaned | #695 | `routers/admin.py` |

Every one of those `DELETE` statements duplicates behavior that SQLite's own `ON DELETE CASCADE` is supposed to provide — and every one is a landmine for the next developer who adds a new child table and forgets the shadow cleanup. FK enforcement would collapse this class of bug to "the schema is already right."

---

## Goals

1. Every `aiosqlite` connection in the backend runs `PRAGMA foreign_keys = ON` immediately after open.
2. Pre-existing orphan rows do not cause connection setup to fail.
3. The migration runner (and tests that patch `aiosqlite.connect`) continue to work unchanged.
4. Existing manual cascade-delete code (introduced in #687, #693, #695) is **removed** so there's only one source of truth.

## Non-goals

- **Adding new declared FKs** (e.g. `annotations.user_id → users.id`, which is currently a *soft* reference). That's a separate schema-rewrite exercise and will be scoped in its own issue. This design only makes the FKs we **already declared** actually fire.
- Enforcing FKs during SQLite's own `ALTER TABLE ... RENAME TO` backfill inside migration runs. Migrations stay FK-off (see "Migration compatibility" below).

---

## Solution

### Connection hook

Extend the existing monkey-patch in `services/db.py` so the returned `aiosqlite.Connection` issues `PRAGMA foreign_keys = ON` as soon as its backing `sqlite3.Connection` is open.

Approach:

```python
# services/db.py (conceptual — not final code)
_FK_ATTR = "_book_reader_ai_fk_patched"

if not getattr(aiosqlite.connect, _FK_ATTR, False):
    _original_connect = aiosqlite.connect  # already busy-timeout-patched above

    def _aiosqlite_connect_with_fk(database, **kwargs):
        kwargs.setdefault("timeout", 30)
        conn_cm = _original_connect(database, **kwargs)
        # Wrap __aenter__ to issue the pragma after the socket thread is live
        original_aenter = conn_cm.__aenter__

        async def _aenter_with_fk():
            db = await original_aenter()
            await db.execute("PRAGMA foreign_keys = ON")
            return db

        conn_cm.__aenter__ = _aenter_with_fk
        return conn_cm

    setattr(_aiosqlite_connect_with_fk, _FK_ATTR, True)
    aiosqlite.connect = _aiosqlite_connect_with_fk
```

The equivalent path for `await aiosqlite.connect(...)` (without `async with`) is handled by the same `__aenter__` wrapper because `aiosqlite.Connection.__await__` delegates to `__aenter__` in the version we pin.

This piggybacks on the existing busy-timeout patch — no new call sites, no sweeping `async with aiosqlite.connect(...) as db: await db.execute("PRAGMA foreign_keys = ON")` at the top of every handler.

### Orphan audit migration (`026_fk_orphan_cleanup.sql`)

Before FK enforcement ships we must delete any rows that would now fail FK checks on the first write after deploy. Empirically the offenders are the children that motivated this issue:

```sql
-- Delete flashcard_reviews whose vocabulary parent is gone
DELETE FROM flashcard_reviews
WHERE vocabulary_id NOT IN (SELECT id FROM vocabulary);

-- Delete flashcard_reviews whose user parent is gone
DELETE FROM flashcard_reviews
WHERE user_id NOT IN (SELECT id FROM users);

-- Delete word_occurrences whose vocabulary parent is gone
DELETE FROM word_occurrences
WHERE vocabulary_id NOT IN (SELECT id FROM vocabulary);

-- Delete user_reading_progress whose user or book parent is gone
DELETE FROM user_reading_progress WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM user_reading_progress WHERE book_id NOT IN (SELECT id FROM books);

-- Delete reading_history whose user parent is gone
DELETE FROM reading_history WHERE user_id NOT IN (SELECT id FROM users);

-- Delete user_books rows with missing parents
DELETE FROM user_books WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM user_books WHERE book_id NOT IN (SELECT id FROM books);

-- Delete book_epubs rows with missing parent book
DELETE FROM book_epubs WHERE book_id NOT IN (SELECT id FROM books);

-- Delete user_book_chapters rows with missing parent book
DELETE FROM user_book_chapters WHERE book_id NOT IN (SELECT id FROM books);

-- books.owner_user_id is nullable — clear rather than delete
UPDATE books
SET owner_user_id = NULL
WHERE owner_user_id IS NOT NULL
  AND owner_user_id NOT IN (SELECT id FROM users);
```

Per `CLAUDE.md` migration policy, this cleanup migration must include a `test_migrations.py` test that seeds each orphan class and asserts the cleanup removes them.

The cleanup runs **with FK enforcement OFF** (migrations always do — see below) so the deletes themselves don't re-trigger the constraints we're about to enable.

### Migration runner stays FK-off

Every migration file in the codebase today assumes FKs are off. The `010_rate_limiter_per_model.sql` migration does a classic `CREATE TABLE ..._new; INSERT SELECT; DROP old; RENAME new` rewrite that would fail a FK check mid-swap if enforcement were on. Future migrations may add more of these.

**Decision:** `services/migrations.run(...)` will explicitly `PRAGMA foreign_keys = OFF` at the top of its work and `PRAGMA foreign_keys = ON` at the bottom. This is the SQLite-recommended pattern for schema rewrites and is independent of the global default on normal connections.

With the monkey-patch on, every migration-runner connection will *start* with FKs on (from the patch) — the migration runner must then explicitly turn them off for its own lifetime. This is a one-line change in `services/migrations.run`.

### Remove duplicated cascade deletes

After the patch ships and the orphan-audit migration has run, delete the following lines that have been doing SQLite's job for it:

- `routers/admin.py::delete_book` — manual `DELETE FROM flashcard_reviews WHERE vocabulary_id IN (...)`
- `routers/vocabulary.py::delete_word` — same shape
- `routers/admin.py::delete_user` — same shape plus the other children

Each removed block stays covered by the existing `test_cascade_*` tests (which already assert the children are gone after the parent delete) — those tests will now prove the DB engine is doing the work.

---

## API Changes

None. This is a pure storage-layer change. No request/response schemas move.

---

## Test Strategy

### New tests

1. **`test_connection_fk_on.py`** — open a connection via the patched `aiosqlite.connect`, run `PRAGMA foreign_keys` and assert `1`. Covers both the `async with` and `await` call forms.
2. **`test_migrations.py::test_026_fk_orphan_cleanup`** — seed each of the nine orphan classes listed above on a fresh DB, run migrations, assert each orphan class is now empty.
3. **`test_cascade_fk.py`** — for each declared FK: insert parent + child, delete parent, assert child is gone **without any manual DELETE in the handler**. This is the regression test that proves `ON DELETE CASCADE` fires by itself.

### Existing tests

The `test_cascade_*` tests added in #687, #693, #695 keep passing — the patch removes the manual DELETE and the DB engine now does the work. If any of them silently relied on the manual DELETE instead of the cascade, this is precisely the surface we want to expose.

`test_translation_queue_branches.py` monkey-patches `aiosqlite.connect` with its own `_patched_connect`. That patch wraps `original_connect = aiosqlite.connect`, which after this design doc ships is the **already-FK-patched** version — so the wrapper inherits FK-on for free. No change required there.

### Full-suite expectation

Full backend suite (1236+ tests) passes with FK enforcement on. Any test that implicitly assumed a child row could exist without its parent is a bug uncovered, not a test to skip.

---

## Migration compatibility & rollout

1. Ship migration `026_fk_orphan_cleanup.sql` **in the same PR** as the connection patch. The migration runs *before* any application code sees FK-on connections because `init_db()` runs migrations first.
2. `services/migrations.run` flips FKs off for its own work and on at the end. Migrations already applied in prod are not re-run — only migration 026 will run in prod once.
3. Deploy: Railway backend picks up 026, cleans orphans, then serves requests with FK-on connections. Zero downtime — FK-on only affects writes that were already invalid.

### Rollback plan

If FK-on causes unforeseen prod write failures: revert the monkey-patch change. The orphan-audit migration stays applied (its deletes are correct regardless of enforcement). The manual cascade DELETEs that were removed in this PR would need to be restored alongside the revert — so the revert PR must put them back. This is the only reason the cleanup of duplicated cascade-delete code should land in a separate commit within the PR: to make a clean partial revert possible.

---

## Open Questions (for PM review)

1. **Do we need a read-only mirror of orphaned rows before the audit migration deletes them?** In theory a flashcard_review with a vocabulary_id pointing to a vocabulary that no longer exists is review history we might want to preserve. Proposed answer: no — the flashcard review is unreachable via any existing endpoint once the parent vocabulary is gone, so preserving it is a non-goal.
2. **Do we want to add the missing declared FKs** (`annotations.user_id`, `vocabulary.user_id`, `word_occurrences.book_id`, etc.) **as part of this PR?** Proposed answer: **no, separate issue**. SQLite can't ALTER a table to add a FK — it requires the CREATE-new/INSERT-SELECT/DROP-old/RENAME dance per table, which is its own migration-risk surface and deserves its own design doc.
3. **Should the monkey-patch live in `services/db.py` or a new `services/connection.py`?** Proposed answer: keep it in `services/db.py` next to the existing busy-timeout patch — they share the same idempotency pattern and belong together.
4. **Anyaudit migration timing concern for big DBs?** Each `DELETE … NOT IN (SELECT id …)` is a correlated scan. Our current `books`/`users`/`vocabulary` rowcounts are small (< 100k each), so this is milliseconds. If the DB ever grows by 100×, the audit becomes a one-shot load-time cost, still bounded.

---

## Size estimate

~3 hours: monkey-patch extension (15 min) + migration 026 (30 min) + three test files (1h) + remove three manual cascade blocks and verify existing cascade tests still pass (30 min) + full backend suite (30 min wall-clock).
