# Design: user_book_chapters Table (Issue #357)

**Status:** Awaiting PM approval  
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

### New table (migration 024)

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

Because SQLite's `json_each` support varies, the data migration runs as a Python script called from the migration runner (or as a one-time admin script). See [Migration Script](#migration-script) below.

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

The data migration is a Python helper, not pure SQL, because we need to parse arbitrary-length JSON. It runs once and is idempotent:

```python
# backend/scripts/migrate_upload_chapters.py
"""One-time migration: move JSON chapters from books.text to user_book_chapters."""
import json, asyncio
from db import get_db

async def run():
    async with get_db() as db:
        rows = await db.fetchall(
            "SELECT id, text FROM books WHERE source='upload' AND text LIKE '{%'"
        )
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
            await db.execute("UPDATE books SET text='' WHERE id=?", (book_id,))
        await db.commit()

asyncio.run(run())
```

The migration is idempotent: `INSERT OR IGNORE` skips already-migrated rows; the `text LIKE '{%'` filter skips already-cleared rows.

---

## Migration Policy Compliance

This migration adds a new table and performs a data move — no constraints are added to existing rows. However, the migration policy requires a test for any migration that modifies existing data:

- **Test required:** `test_migrations.py` — seed an uploaded book with JSON in `books.text`, run the migration script, verify rows appear in `user_book_chapters` and `books.text` is cleared.

---

## File Scope

Files changed:

| File | Change |
|---|---|
| `backend/migrations/024_user_book_chapters.sql` | New table DDL |
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

**Awaiting PM approval.** Once the design doc is merged, implementation can begin on a `feat/user-book-chapters` branch.
