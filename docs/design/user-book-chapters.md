# Design: user_book_chapters Table (Issue #357)

**Status:** PM approved 2026-04-23 ✅ — revised to resolve migration-runner question  
**Author:** Architect  
**Date:** 2026-04-23

---

## Problem

Uploaded book chapters are stored as a JSON blob inside `books.text`:

```json
{"draft": true, "chapters": [{"title": "...", "text": "..."}, ...]}
```

Gutenberg books use the same column for raw plain text. This creates three problems:

1. **No full-text search** — SQL `LIKE '%query%'` on `books.text` matches JSON structure for uploaded books, not content.
2. **Silent branching** — every code path that reads `books.text` must branch on `source='upload'` and parse JSON; this is not enforced by the schema and is easy to forget.
3. **Schema contract violation** — `books.text` was designed for plain text. Using it for JSON breaks that invariant silently.

Affected code paths today (all require a `source=='upload'` branch):
- `routers/books.py:261` — draft guard before enqueue
- `routers/books.py:468–484` — `GET /books/{id}/chapters`
- `routers/uploads.py:171` — `GET /books/{id}/chapters/draft`
- `routers/uploads.py:226` — `POST /books/{id}/chapters/confirm`
- `routers/admin.py:1119` — draft guard before admin bulk enqueue
- `services/book_chapters.py:52–60` — in-memory chapter cache resolves uploads by detecting `text.startswith("{")`

---

## Solution

Add a `user_book_chapters` table. Store uploaded chapters there instead of JSON-in-`books.text`. Clear `books.text` for uploaded books (set to `''`).

This eliminates every `source=='upload'` branch that touches `books.text`; code either reads from `user_book_chapters` (uploads) or splits `books.text` (Gutenberg) — the two paths are now governed by the schema, not runtime string inspection.

---

## Database Schema

### New table (migration 025)

> **Note:** Migration `024_flashcard_reviews.sql` is already merged. This migration uses `025`.

```sql
CREATE TABLE IF NOT EXISTS user_book_chapters (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index INTEGER NOT NULL,
    title         TEXT    NOT NULL DEFAULT '',
    text          TEXT    NOT NULL DEFAULT '',
    is_draft      INTEGER NOT NULL DEFAULT 1,  -- 1=draft, 0=confirmed
    UNIQUE(book_id, chapter_index)
);
CREATE INDEX IF NOT EXISTS ubc_book_draft ON user_book_chapters(book_id, is_draft);
```

### Data migration (same migration file)

Move any existing JSON blobs to the new table and clear `books.text`:

```sql
-- For each uploaded book, parse existing JSON and insert rows.
-- SQLite does not support JSON_EACH natively on all versions, so we use
-- a Python migration helper (see below) instead of pure SQL.
```

Because SQLite's `json_each` support varies, the data migration is a Python helper (not pure SQL). The existing migration runner processes `.sql` files only and has no hook for Python; teaching it to run Python would be a separate, larger change and risks running arbitrary code during startup.

**Decision: option (b) — manual ops step.**

- Migration `025_user_book_chapters.sql` creates the table and indexes (pure SQL, runs automatically via the existing runner).
- `backend/scripts/migrate_upload_chapters.py` is run **once, manually by ops**, after the `025` migration applies and before the router code that reads from `user_book_chapters` is deployed. The script is idempotent (see [Migration Script](#migration-script)), so re-running it is safe.

Rationale:
- Simpler and lower-risk — no migration-runner change.
- The script runs under full application config (ENV, DB URL, encryption keys) with a normal Python import path — easier to debug than a migration-runner-invoked script.
- It runs exactly once in the project's lifetime; paying the ergonomics cost for a permanent runner hook is not justified by a single-use script.

**Deployment checklist (documented in the implementation PR):**
1. Deploy backend with migration `025` + new services but **old router code** still reading from `books.text`. The `025` SQL runs on startup; the new table exists but is empty.
2. Operator runs `python -m backend.scripts.migrate_upload_chapters` against the production DB. Idempotent; prints a count of rows migrated.
3. Deploy router code that reads from `user_book_chapters`. The old code path keeps working until this deploy because step 2 did not clear `books.text` yet — see script note below.
4. After step 3 is stable, the operator runs the same script with `--finalize` to UPDATE `books.text=''` on migrated rows (a separate idempotent phase).

The two-phase design keeps the rollback path clean: if step 3 fails, the old router still reads `books.text` intact. The script's UPDATE step is gated behind `--finalize` so a premature first run cannot strand the old code path.

---

## API Surface Changes

All public endpoints remain **unchanged** in shape. Only internal implementation changes.

| Endpoint | Current | After |
|---|---|---|
| `GET /books/{id}/chapters` | Parses JSON from `books.text` for uploads | Reads from `user_book_chapters` |
| `GET /books/{id}/chapters/draft` | Parses JSON from `books.text` | Reads from `user_book_chapters WHERE is_draft=1` |
| `POST /books/{id}/chapters/confirm` | Writes confirmed JSON back to `books.text` | Sets `is_draft=0` and updates rows in `user_book_chapters` |
| `POST /books/upload` | Writes draft JSON to `books.text` | Inserts draft rows into `user_book_chapters`; sets `books.text=''` |
| `DELETE /books/upload/{id}` | Cascades via `books.id` FK | Same (FK cascade covers `user_book_chapters`) |

The draft guard in enqueue endpoints (`books.py:261`, `admin.py:1119`) becomes:

```python
# Before (fragile JSON parse)
_data = json.loads(book_meta.get("text") or "{}")
if _data.get("draft"): raise ...

# After (schema-enforced)
draft_count = await db.fetchone(
    "SELECT COUNT(*) FROM user_book_chapters WHERE book_id=? AND is_draft=1", (book_id,)
)
if draft_count[0] > 0: raise ...
```

---

## Migration Script

The data migration is a Python helper, not pure SQL, because we need to parse arbitrary-length JSON. It runs manually and is idempotent. The script has two phases controlled by a `--finalize` flag so the old router code path stays intact during the router deploy (see Deployment checklist above):

```python
# backend/scripts/migrate_upload_chapters.py
"""One-time migration: move JSON chapters from books.text to user_book_chapters."""
import argparse, json, asyncio
from db import get_db

async def copy_phase(db):
    rows = await db.fetchall(
        "SELECT id, text FROM books WHERE source='upload' AND text LIKE '{%'"
    )
    copied = 0
    for book_id, text in rows:
        try:
            data = json.loads(text)
        except (ValueError, TypeError):
            continue
        chapters = data.get("chapters", [])
        is_draft = 1 if data.get("draft") else 0
        for i, ch in enumerate(chapters):
            await db.execute(
                """INSERT OR IGNORE INTO user_book_chapters
                   (book_id, chapter_index, title, text, is_draft)
                   VALUES (?, ?, ?, ?, ?)""",
                (book_id, i, ch.get("title", ""), ch.get("text", ""), is_draft)
            )
        copied += 1
    return copied

async def finalize_phase(db):
    # Only clear books.text for uploads that already have rows in user_book_chapters.
    await db.execute("""
        UPDATE books SET text = ''
        WHERE source = 'upload'
          AND text LIKE '{%'
          AND EXISTS (SELECT 1 FROM user_book_chapters WHERE book_id = books.id)
    """)

async def run(finalize: bool):
    async with get_db() as db:
        copied = await copy_phase(db)
        print(f"copy phase: {copied} upload book(s) processed")
        if finalize:
            await finalize_phase(db)
            print("finalize phase: books.text cleared for migrated uploads")
        await db.commit()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--finalize", action="store_true",
                        help="Clear books.text for uploads after router deploy is stable.")
    args = parser.parse_args()
    asyncio.run(run(args.finalize))
```

The migration is idempotent in both phases:
- Copy phase: `INSERT OR IGNORE` skips already-migrated rows; rows whose `books.text` is `''` are skipped by `text LIKE '{%'`.
- Finalize phase: guarded by `EXISTS (SELECT 1 FROM user_book_chapters …)`; running it twice on an already-cleared row is a no-op.

---

## Migration Policy Compliance

This migration adds a new table and performs a data move — no constraints are added to existing rows. However, the migration policy requires a test for any migration that modifies existing data:

- **Test required (SQL runner):** `test_migrations.py` — apply `025_user_book_chapters.sql` on a DB that seeds an uploaded book with JSON in `books.text`. Verify: the table + index exist, the FK cascade is active, and `books.text` is still intact (the SQL alone does not touch `books.text`).
- **Test required (Python helper):** `test_migrate_upload_chapters.py` — seed one book with JSON + one book already cleared + one legacy (non-upload) book. Run `copy_phase`: upload JSON copied; pre-cleared row skipped; legacy row untouched. Run `copy_phase` again (idempotency): no duplicate rows inserted. Run `finalize_phase`: `books.text` cleared only for the copied upload; legacy row untouched. Run `finalize_phase` again (idempotency): no rows changed.

---

## File Scope

Files changed:

| File | Change |
|---|---|
| `backend/migrations/025_user_book_chapters.sql` | New table DDL |
| `backend/scripts/migrate_upload_chapters.py` | One-time data migration |
| `backend/services/book_chapters.py` | Remove JSON-detect branch; query `user_book_chapters` for uploads |
| `backend/routers/uploads.py` | Write to / read from `user_book_chapters` instead of `books.text` |
| `backend/routers/books.py` | Remove JSON-parse branch; read from `user_book_chapters` for uploads |
| `backend/routers/admin.py` | Remove JSON-parse draft guard |
| `backend/tests/test_router_uploads.py` | Update fixtures; add migration test |
| `backend/tests/test_router_books.py` | Update upload chapter tests |
| `backend/tests/test_migrations.py` | New test: data migration correctness |

Total: 9 files, 4 services. No frontend changes needed.

---

## Open Questions

1. **`books.text` for uploads** — Should we set it to `''` (empty string) or `NULL`? Empty string is safer (avoids nullable column change); NULL would require a schema migration to allow NULLs. **Proposed:** empty string for now.

2. **Gutenberg chapter caching** — Gutenberg uses `services/book_chapters.py` (in-memory + EPUB cache) rather than `user_book_chapters`. Should we unify chapter storage for all sources? **Proposed:** No — scope creep. Keep Gutenberg caching separate; this design only fixes uploaded books.

3. **Search** — Issue mentions full-text search as a motivation. Should this design include a FTS5 virtual table on `user_book_chapters.text`? **Proposed:** No — defer to a separate search issue. This design unblocks search; it doesn't implement it.

---

## Estimated Effort

~4 hours: migration (1h), router updates (1.5h), test updates (1.5h).

---

## Decision

**PM approved 2026-04-23 ✅** with one clarification item, now resolved:

- **Migration-runner question (resolved):** chose option (b). The existing SQL-only migration runner is not extended to execute Python. Instead, ops runs `backend/scripts/migrate_upload_chapters.py` manually in two phases (`copy` and `--finalize`). Rationale and deployment checklist are documented in the Data migration + Migration Script sections above.

Implementation begins on `feat/user-book-chapters` once this design doc merges.
