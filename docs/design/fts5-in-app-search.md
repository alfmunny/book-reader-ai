# Design: In-App Full-Text Search via FTS5 (Issue #592)

**Status:** Shipped (PR #733, 2026-04-23)  
**Author:** Architect  
**Date:** 2026-04-23  
**Depends on:** #357 (user_book_chapters) implementation must merge before the implementation PR for this design is opened.

---

## Problem

The app's only search is `GET /api/books/search`, which calls the external Gutendex API to search the Gutenberg catalog by title/author metadata. There is no way to search within the user's own content:

- Annotations and highlighted sentences they've written
- Vocabulary context sentences they've saved
- Chapters of books they've uploaded

A user who remembers "I annotated something about foreshadowing in Kafka" has no mechanism to find it. This gap was explicitly identified as a future feature in the design doc for issue #357 (user_book_chapters).

**Note:** The design doc for #357 incorrectly labels its migration as `024`. Migration `024_flashcard_reviews.sql` is already merged. The #357 implementation will use migration `025`. FTS5 will use migration `026`.

---

## Solution

Add SQLite FTS5 virtual tables (external content mode) for three user content domains:

| Table | FTS columns | Content origin |
|---|---|---|
| `annotations_fts` | `sentence_text`, `note_text` | `annotations` table |
| `word_occurrences_fts` | `sentence_text` | `word_occurrences` table |
| `user_chapters_fts` | `title`, `text` | `user_book_chapters` (requires #357) |

External content mode stores only the FTS index (no duplicate text storage), with the source tables as the content provider. SQLite `snippet()` generates highlighted excerpts at query time.

A new `GET /api/search` endpoint fans out across all three FTS tables (filtered to the requesting user's data), merges results, and returns them ranked by relevance.

---

## Database Schema

### Migration 026 (depends on 025 existing)

```sql
-- FTS5 for user annotations
CREATE VIRTUAL TABLE IF NOT EXISTS annotations_fts USING fts5(
    sentence_text,
    note_text,
    content='annotations',
    content_rowid='id',
    tokenize='unicode61'
);

-- Populate from existing rows (one-time seed)
INSERT INTO annotations_fts(rowid, sentence_text, note_text)
SELECT id, sentence_text, note_text FROM annotations;

-- Keep in sync
CREATE TRIGGER annotations_ai AFTER INSERT ON annotations BEGIN
    INSERT INTO annotations_fts(rowid, sentence_text, note_text)
    VALUES (new.id, new.sentence_text, new.note_text);
END;
CREATE TRIGGER annotations_ad BEFORE DELETE ON annotations BEGIN
    INSERT INTO annotations_fts(annotations_fts, rowid, sentence_text, note_text)
    VALUES ('delete', old.id, old.sentence_text, old.note_text);
END;
CREATE TRIGGER annotations_au AFTER UPDATE ON annotations BEGIN
    INSERT INTO annotations_fts(annotations_fts, rowid, sentence_text, note_text)
    VALUES ('delete', old.id, old.sentence_text, old.note_text);
    INSERT INTO annotations_fts(rowid, sentence_text, note_text)
    VALUES (new.id, new.sentence_text, new.note_text);
END;

-- FTS5 for vocabulary context sentences
CREATE VIRTUAL TABLE IF NOT EXISTS word_occurrences_fts USING fts5(
    sentence_text,
    content='word_occurrences',
    content_rowid='id',
    tokenize='unicode61'
);

INSERT INTO word_occurrences_fts(rowid, sentence_text)
SELECT id, sentence_text FROM word_occurrences;

CREATE TRIGGER word_occ_ai AFTER INSERT ON word_occurrences BEGIN
    INSERT INTO word_occurrences_fts(rowid, sentence_text)
    VALUES (new.id, new.sentence_text);
END;
CREATE TRIGGER word_occ_ad BEFORE DELETE ON word_occurrences BEGIN
    INSERT INTO word_occurrences_fts(word_occurrences_fts, rowid, sentence_text)
    VALUES ('delete', old.id, old.sentence_text);
END;
CREATE TRIGGER word_occ_au AFTER UPDATE ON word_occurrences BEGIN
    INSERT INTO word_occurrences_fts(word_occurrences_fts, rowid, sentence_text)
    VALUES ('delete', old.id, old.sentence_text);
    INSERT INTO word_occurrences_fts(rowid, sentence_text)
    VALUES (new.id, new.sentence_text);
END;

-- FTS5 for uploaded book chapters (depends on 025_user_book_chapters)
CREATE VIRTUAL TABLE IF NOT EXISTS user_chapters_fts USING fts5(
    title,
    text,
    content='user_book_chapters',
    content_rowid='id',
    tokenize='unicode61'
);

-- Only seed confirmed (non-draft) chapters
INSERT INTO user_chapters_fts(rowid, title, text)
SELECT id, title, text FROM user_book_chapters WHERE is_draft = 0;

-- Triggers keep the FTS in sync ONLY for confirmed rows (is_draft = 0).
-- Draft rows must not appear in the index — users haven't finalized them yet
-- and the search router additionally filters `is_draft = 0` as a belt-and-braces guard.

-- New row: only index if it lands already confirmed (rare; typical path is insert-draft, then confirm).
CREATE TRIGGER user_chapters_ai AFTER INSERT ON user_book_chapters
WHEN NEW.is_draft = 0
BEGIN
    INSERT INTO user_chapters_fts(rowid, title, text)
    VALUES (new.id, new.title, new.text);
END;

-- Delete: only remove from FTS if the row was indexed (i.e. was confirmed).
CREATE TRIGGER user_chapters_ad BEFORE DELETE ON user_book_chapters
WHEN OLD.is_draft = 0
BEGIN
    INSERT INTO user_chapters_fts(user_chapters_fts, rowid, title, text)
    VALUES ('delete', old.id, old.title, old.text);
END;

-- Update is split into two triggers that compose to cover all four transitions:
--   0 → 0  : delete old + insert new = re-index (title/text edited on confirmed row)
--   0 → 1  : delete old only         = row removed from index (defensive; un-confirm)
--   1 → 0  : insert new only         = added to index on confirm
--   1 → 1  : neither fires           = draft-only edit stays out of index
CREATE TRIGGER user_chapters_au_del AFTER UPDATE ON user_book_chapters
WHEN OLD.is_draft = 0
BEGIN
    INSERT INTO user_chapters_fts(user_chapters_fts, rowid, title, text)
    VALUES ('delete', old.id, old.title, old.text);
END;
CREATE TRIGGER user_chapters_au_ins AFTER UPDATE ON user_book_chapters
WHEN NEW.is_draft = 0
BEGIN
    INSERT INTO user_chapters_fts(rowid, title, text)
    VALUES (new.id, new.title, new.text);
END;
```

### Why external content mode?

The `annotations`, `word_occurrences`, and `user_book_chapters` tables are the source of truth. External content FTS5 stores only the inverted index (~5–10% of text size), avoiding duplication. The tradeoff: queries require a JOIN back to the source table — acceptable for our result counts (users won't have millions of annotations).

---

## API

### `GET /api/search`

**Auth:** Required (results are user-scoped)

**Query parameters:**
| Param | Type | Default | Description |
|---|---|---|---|
| `q` | string, max 200 chars | required | Full-text query |
| `scope` | comma-list | `annotations,vocabulary,chapters` | Which domains to search |
| `limit` | int, 1–50 | 20 | Max results per scope |

**Response:**
```json
{
  "query": "foreshadowing Kafka",
  "results": [
    {
      "type": "annotation",
      "id": 42,
      "book_id": 1234,
      "book_title": "The Trial",
      "chapter_index": 3,
      "snippet": "...the <b>foreshadowing</b> is clear...",
      "note_text": "K's first encounter with the court"
    },
    {
      "type": "vocabulary",
      "word": "Weltschmerz",
      "occurrence_id": 23,
      "book_id": 1234,
      "book_title": "The Trial",
      "chapter_index": 2,
      "snippet": "...context sentence with <b>match</b>..."
    },
    {
      "type": "chapter",
      "id": 5,
      "book_id": 78066,
      "book_title": "My Uploaded Novel",
      "chapter_index": 1,
      "chapter_title": "Chapter One",
      "snippet": "...passage excerpt..."
    }
  ],
  "total": 3
}
```

**Implementation sketch (`services/search.py`):**
```python
async def search_content(user_id: int, q: str, scope: list[str], limit: int) -> list[dict]:
    results = []

    if "annotations" in scope:
        rows = await db.fetchall("""
            SELECT a.id, a.book_id, b.title, a.chapter_index, a.note_text,
                   snippet(annotations_fts, 0, '<b>', '</b>', '…', 20) AS snippet
            FROM annotations_fts
            JOIN annotations a ON annotations_fts.rowid = a.id
            JOIN books b ON a.book_id = b.id
            WHERE annotations_fts MATCH ? AND a.user_id = ?
            ORDER BY rank LIMIT ?
        """, (q, user_id, limit))
        results += [{"type": "annotation", ...} for r in rows]

    if "vocabulary" in scope:
        rows = await db.fetchall("""
            SELECT v.word, wo.id, wo.book_id, b.title, wo.chapter_index,
                   snippet(word_occurrences_fts, 0, '<b>', '</b>', '…', 20) AS snippet
            FROM word_occurrences_fts
            JOIN word_occurrences wo ON word_occurrences_fts.rowid = wo.id
            JOIN vocabulary v ON wo.vocabulary_id = v.id
            JOIN books b ON wo.book_id = b.id
            WHERE word_occurrences_fts MATCH ? AND v.user_id = ?
            ORDER BY rank LIMIT ?
        """, (q, user_id, limit))
        results += [{"type": "vocabulary", ...} for r in rows]

    if "chapters" in scope:
        rows = await db.fetchall("""
            SELECT uc.id, uc.book_id, b.title, uc.chapter_index, uc.title AS chapter_title,
                   snippet(user_chapters_fts, 1, '<b>', '</b>', '…', 30) AS snippet
            FROM user_chapters_fts
            JOIN user_book_chapters uc ON user_chapters_fts.rowid = uc.id
            JOIN books b ON uc.book_id = b.id
            WHERE user_chapters_fts MATCH ? AND b.owner_user_id = ? AND uc.is_draft = 0
            ORDER BY rank LIMIT ?
        """, (q, user_id, limit))
        results += [{"type": "chapter", ...} for r in rows]

    return results
```

---

## Frontend

### New route: `/search`

`frontend/src/app/search/page.tsx` — renders search results. Reads `?q=` from the URL search params.

### `SearchBar` component

`frontend/src/components/SearchBar.tsx`:
- Icon button (magnifying glass SVG from `Icons.tsx` — new icon to add) in the app header
- Expands to a text input on click, collapses on Escape or blur with no query
- On submit: `router.push('/search?q=' + encodeURIComponent(query))`
- Keyboard shortcut: `/` focuses the search bar when not in a text input

### Search results page

Three sections (one per scope type), each with distinct card designs:
- **Annotation card:** Book title + chapter, highlighted snippet, note text, link → reader at that chapter
- **Vocabulary card:** Word (bold), context sentence with match highlighted, link → vocabulary page
- **Chapter card:** Book title + chapter title, text snippet, link → reader at that chapter

Empty state if no results. Loading skeleton while fetching.

### Header integration

Add `<SearchBar />` to the app layout header, between the title and the profile button.

---

## Migration Policy Compliance

Migration 026 uses `INSERT INTO fts ... SELECT` to seed existing data — this is not a constraint migration (no `NOT NULL`, `UNIQUE`, or `CHECK` added to existing tables). However, per the migration policy:

> Every migration that modifies existing data must include a data-cleanup step if adding constraints.

This migration adds no constraints to existing tables. The FTS seed is additive. **No cleanup step required.**

Tests required per testing policy:
- `test_migrations.py`: seed an annotation + vocabulary occurrence + uploaded chapter, run migration, verify FTS returns matches.
- `test_router_search.py`:
  - draft chapter is not indexed on insert (`is_draft = 1`) and does not appear in search results.
  - draft chapter becomes searchable only after `UPDATE ... SET is_draft = 0` (confirm transition).
  - un-confirm transition (0 → 1, defensive) removes the chapter from the index.
  - content edit on a confirmed chapter updates the FTS snippet.
  - `word_occurrences` sentence_text update re-indexes correctly (covers `word_occ_au`).

---

## File Scope

| File | Change |
|---|---|
| `backend/migrations/026_fts5_search.sql` | FTS5 tables, triggers, seed |
| `backend/services/search.py` | `search_content(user_id, q, scope, limit)` |
| `backend/routers/search.py` | `GET /search` endpoint |
| `backend/main.py` | Register search router |
| `frontend/src/components/Icons.tsx` | Add `SearchIcon` SVG |
| `frontend/src/components/SearchBar.tsx` | Collapsible search input |
| `frontend/src/app/search/page.tsx` | Results page |
| `frontend/src/app/layout.tsx` | Add `<SearchBar />` to header |
| `backend/tests/test_router_search.py` | Unit + integration tests |
| `backend/tests/test_migrations.py` | FTS seed test |
| `frontend/src/__tests__/SearchBar.test.tsx` | Component tests |

Total: 11 files. No schema changes to existing tables.

---

## Open Questions

1. **Snippet HTML injection** — `snippet()` returns `<b>...</b>` tags. The frontend must render these safely (dangerouslySetInnerHTML with the HTML stripped of everything except `<b>` tags, or via a whitelist). **Proposed:** strip all tags except `<b>` server-side before returning; front end can use dangerouslySetInnerHTML.

2. **Query sanitisation** — FTS5 MATCH queries can use special syntax (`AND`, `OR`, `"phrase"`, `*`). Unescaped user input could produce parse errors. **Proposed:** wrap query in double quotes on the server (`'"' + q.replace('"', '""') + '"'`) to treat it as a phrase search. Advanced syntax opt-in is a follow-up.

3. **`user_book_chapters` dependency** — If migration 026 runs before 025, it fails because `user_book_chapters` doesn't exist. **Proposed:** Migration runner already applies migrations in order; 025 will always precede 026. Add a comment to 026 to document the dependency.

4. **Gutenberg chapter indexing** — Out of scope for this design. Gutenberg books store full text in `books.text`; indexing them requires chapter-splitting before insert, which is a separate architectural concern. Filed as potential follow-up.

---

## Estimated Effort

~6 hours: migration + triggers (1h) · search service (1h) · search router (0.5h) · frontend SearchBar (1h) · search results page (1.5h) · tests (1h)

---

## Decision

**PM approved 2026-04-23 ✅** with three revision items (addressed in this revision):
1. `word_occ_au` trigger added — `word_occurrences` is not guaranteed insert-only long-term; a defensive AU trigger keeps the FTS index consistent if sentence_text is ever updated.
2. Draft-chapter leak fixed — all `user_chapters_*` triggers are now gated by `WHEN … is_draft = 0` and compose cleanly over the four draft/confirm transitions. An explicit confirm transition (1 → 0) adds the row to the FTS index.
3. **Implementation order lock-in:** the implementation PR for #592 **MUST NOT** be opened until the implementation of #357 (user_book_chapters) is merged and deployed. `user_chapters_fts` references the `user_book_chapters` table; migration 026 will fail to apply without it. PM will file the implementation issue (labeled `feat` + `architecture`) once #357 implementation ships.

Implementation begins on `feat/fts5-in-app-search` only after the PM-filed implementation issue appears.
