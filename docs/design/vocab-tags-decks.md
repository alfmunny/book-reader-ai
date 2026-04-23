# Design: Vocabulary Tags & Custom Study Decks (Issue #645)

**Status:** Awaiting PM approval
**Author:** Architect
**Date:** 2026-04-23

---

## Problem

Users save hundreds of vocabulary words across books and languages, but the app provides no way to organize those words. Today:

- The vocabulary list at `/vocabulary` is flat — no grouping, no filtering beyond sort/group-by-language/book (PR #435).
- The SRS flashcard feature (`GET /vocabulary/flashcards/due`, PR #560) returns **all** due cards globally. Users cannot run a focused session on one topic.
- The Stats dashboard (PR #268) aggregates across the entire vocab corpus.

This matters because SRS pedagogy works best with focused decks — "studying 20 German phrasal verbs today" is more effective than "studying 20 arbitrary words across 5 languages."

---

## Solution

Two additive concepts, both user-owned:

1. **Tags** — free-text labels attached to a vocabulary word. Many-to-many.
2. **Decks** — named collections of vocabulary words for focused review. Two deck types:
   - **Manual decks** — user selects members explicitly.
   - **Smart decks** — rule-based, materialized at query time.

The SRS `GET /vocabulary/flashcards/due` endpoint gets an optional `deck_id` parameter. When present, the due-card query is filtered to vocabulary rows that are members of that deck.

Tags and decks are independent features — a user can use tags without ever creating a deck, or build manual decks without ever tagging a word. They compose: a smart deck can filter by tag.

---

## Database Schema

### Migration 027

> **Note:** Migration `025_user_book_chapters.sql` (issue #357) and `026_fts5_search.sql` (issue #592) are already reserved for in-flight design docs. This migration uses `027`.

```sql
-- Tags attached to vocabulary rows. Free text, user-scoped.
CREATE TABLE IF NOT EXISTS vocabulary_tags (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
    tag           TEXT    NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, vocabulary_id, tag)
);
CREATE INDEX IF NOT EXISTS vocab_tags_by_tag ON vocabulary_tags(user_id, tag);
CREATE INDEX IF NOT EXISTS vocab_tags_by_vocab ON vocabulary_tags(vocabulary_id);

-- Named, user-owned decks.
CREATE TABLE IF NOT EXISTS decks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    mode        TEXT    NOT NULL CHECK (mode IN ('manual', 'smart')),
    rules_json  TEXT,  -- only for mode='smart'; JSON-encoded filter rules (see below)
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- Members of a manual deck. Smart decks have no rows here — they resolve via rules_json.
CREATE TABLE IF NOT EXISTS deck_members (
    deck_id       INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
    added_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (deck_id, vocabulary_id)
);
CREATE INDEX IF NOT EXISTS deck_members_by_vocab ON deck_members(vocabulary_id);
```

### Why the shape is this way

- **`vocabulary_tags.user_id` is denormalized** from `vocabulary.user_id` for query performance: the "all my tags" list (drives the frontend autocomplete) reads a single indexed column without a JOIN. The `UNIQUE(user_id, vocabulary_id, tag)` ensures no duplicates, and the FK on `vocabulary_id` cascades deletions if the parent word is removed.
- **`decks.name` is `UNIQUE(user_id, name)`** — users expect deck names to be unique within their account; a global-unique would break multi-user semantics.
- **Smart deck rules are stored as JSON** rather than a normalized rule table. Rules are small (see below) and always evaluated server-side as SQL filters; a rule table would add complexity without measurable benefit.
- **`deck_members`** uses a composite primary key. No separate `id` column — there's nothing else to reference a membership row by.

### Smart deck rules_json schema

```json
{
  "language": "de",
  "book_ids": [1342, 2600],
  "tags_any": ["phrasal-verb", "idiom"],
  "tags_all": ["b2"],
  "saved_after": "2026-01-01",
  "saved_before": "2026-04-30"
}
```

All fields optional; the result set is the intersection of non-null filters. A deck with `{}` is equivalent to "all my vocabulary" (degenerate but legal).

Validation at the router: Pydantic model rejects unknown keys and length-caps every string field (`max_length=50` on tag strings, `max_length=20` on `language`, etc.) following the validation patterns from PRs #506–#533.

### Migration Policy Compliance

- No constraints added to existing rows in existing tables.
- No data cleanup step required.
- `test_migrations.py` still gets a DDL-correctness test verifying the tables, indexes, and cascade FKs exist after the migration applies.

---

## API

All endpoints require auth; every read is filtered by `user_id`.

### Tags

| Method | Path | Body / Query | Response |
|---|---|---|---|
| `GET`    | `/vocabulary/tags` | — | `[{tag, word_count}]` sorted alphabetically |
| `GET`    | `/vocabulary/{id}/tags` | — | `[{tag}]` |
| `POST`   | `/vocabulary/{id}/tags` | `{tag}` (max 50 chars) | `{tag}` |
| `DELETE` | `/vocabulary/{id}/tags/{tag}` | — | 204 |

Tag strings are trimmed, lowercased, max 50 characters, no empty strings, reject if matches `/^\s*$/`.

### Decks

| Method | Path | Body / Query | Response |
|---|---|---|---|
| `GET`    | `/decks` | — | `[{id, name, description, mode, member_count, due_today}]` |
| `POST`   | `/decks` | `{name, description?, mode, rules_json?}` | `{id, ...}` |
| `GET`    | `/decks/{id}` | — | `{id, name, description, mode, rules_json, members: [vocab_id...]}` |
| `PATCH`  | `/decks/{id}` | any of: `{name, description, rules_json}` | `{id, ...}` |
| `DELETE` | `/decks/{id}` | — | 204 (cascades deck_members) |
| `POST`   | `/decks/{id}/members` | `{vocabulary_id}` (manual mode only; 409 on smart) | `{vocabulary_id}` |
| `DELETE` | `/decks/{id}/members/{vocab_id}` | — | 204 |

### SRS integration

Existing `GET /vocabulary/flashcards/due` gains `?deck_id=<int>`. When present:

```sql
SELECT v.* FROM vocabulary v
JOIN flashcard_reviews fr ON fr.vocabulary_id = v.id
WHERE v.user_id = :user_id
  AND fr.user_id = :user_id
  AND fr.due_date <= date('now')
  AND v.id IN (
    -- manual deck members, OR smart deck rule resolution
    SELECT vocabulary_id FROM deck_members WHERE deck_id = :deck_id
    UNION
    SELECT id FROM vocabulary WHERE id = :user_id AND {smart_rules}
  )
ORDER BY fr.due_date ASC
LIMIT 100;
```

In practice this is built as two separate queries chosen by the deck's `mode` column — the UNION form above is illustrative only.

`GET /vocabulary/flashcards/stats` gains `?deck_id=<int>` with the same filter semantics.

---

## Service layer

New module: `backend/services/decks.py`.

```python
async def list_decks(user_id: int) -> list[dict]: ...
async def create_deck(user_id: int, name: str, description: str, mode: str,
                      rules_json: dict | None) -> dict: ...
async def get_deck(user_id: int, deck_id: int) -> dict: ...
async def update_deck(user_id: int, deck_id: int, patch: dict) -> dict: ...
async def delete_deck(user_id: int, deck_id: int) -> None: ...

async def resolve_deck_members(user_id: int, deck_id: int) -> list[int]:
    """Return vocabulary_ids that belong to a deck, regardless of mode."""
    ...

async def add_manual_member(user_id: int, deck_id: int, vocabulary_id: int) -> None: ...
async def remove_manual_member(user_id: int, deck_id: int, vocabulary_id: int) -> None: ...
```

Tag helpers live in `backend/services/vocabulary.py` (existing module):

```python
async def list_user_tags(user_id: int) -> list[dict]: ...
async def get_vocab_tags(user_id: int, vocabulary_id: int) -> list[str]: ...
async def add_vocab_tag(user_id: int, vocabulary_id: int, tag: str) -> str: ...
async def remove_vocab_tag(user_id: int, vocabulary_id: int, tag: str) -> None: ...
```

### Smart-rule resolution

`resolve_deck_members` for smart decks compiles `rules_json` into a SQL WHERE fragment with parameterized values. The available filter keys are exactly those listed in the rules_json schema; any unknown key causes a 400 at the create/patch endpoint. No user-supplied SQL ever reaches the query.

---

## Frontend

### New components

- `frontend/src/components/TagEditor.tsx` — inline editable chip list. Used on the vocab list item and the flashcard front (so users can tag while reviewing).
- `frontend/src/components/DeckCard.tsx` — card used on `/decks` list.
- `frontend/src/app/decks/page.tsx` — deck index.
- `frontend/src/app/decks/[id]/page.tsx` — deck detail + member management.
- `frontend/src/app/decks/new/page.tsx` — deck creation wizard (picks mode, then either manual member picker or smart-rule builder).

### Integration with existing pages

- **Vocabulary list** (`/vocabulary`): add a "Tags" filter chip row and a tag column on each item.
- **Flashcards page** (`/vocabulary/flashcards`): add a deck selector at the top. Selecting a deck re-fetches `/due?deck_id=...`. Remembered in `localStorage` as `lastDeckId` for session continuity.
- **Profile stats**: new panel showing "decks with due cards today" when the user has any decks.

### Icons

Add `TagIcon` and `DeckIcon` to `frontend/src/components/Icons.tsx` (SVG, `currentColor`, `aria-hidden="true"`). Follow the existing Icons.tsx patterns.

---

## File Scope

| File | Change |
|---|---|
| `backend/migrations/027_vocab_tags_decks.sql` | New tables + indexes |
| `backend/services/decks.py` | New service module |
| `backend/services/vocabulary.py` | Add tag helpers |
| `backend/routers/decks.py` | New router |
| `backend/routers/vocabulary.py` | Add tag endpoints |
| `backend/routers/flashcards.py` | Add `deck_id` query param (existing routes) |
| `backend/main.py` | Register decks router |
| `backend/tests/test_router_decks.py` | New |
| `backend/tests/test_router_vocabulary_tags.py` | New |
| `backend/tests/test_router_flashcards_deck_filter.py` | New |
| `backend/tests/test_migrations.py` | DDL correctness test |
| `frontend/src/components/Icons.tsx` | Add `TagIcon`, `DeckIcon` |
| `frontend/src/components/TagEditor.tsx` | New |
| `frontend/src/components/DeckCard.tsx` | New |
| `frontend/src/app/decks/page.tsx` | New |
| `frontend/src/app/decks/[id]/page.tsx` | New |
| `frontend/src/app/decks/new/page.tsx` | New |
| `frontend/src/app/vocabulary/page.tsx` | Tag filter chip row |
| `frontend/src/app/vocabulary/flashcards/page.tsx` | Deck selector |
| `frontend/src/__tests__/TagEditor.test.tsx` | New |
| `frontend/src/__tests__/DeckCard.test.tsx` | New |
| `frontend/src/__tests__/FlashcardsDeckFilter.test.tsx` | New |

Total: 21 files. Two new DB tables. No changes to existing schema.

---

## Testing

Per testing policy: every endpoint and service function gets at least one test. The failing-test-first rule applies for the frontend components and the new backend routes. Concrete test list:

**Backend**
- Tag CRUD happy path + user-scoping (user A cannot tag user B's word).
- Tag normalization: leading/trailing whitespace stripped; case-folded to lowercase before insert.
- Tag length cap (50 chars) enforced; empty string rejected.
- Cascade: delete vocabulary → all rows in `vocabulary_tags` and `deck_members` gone.
- Cascade: delete user → all decks + deck_members + vocabulary_tags gone.
- Deck creation: name uniqueness (per user), mode enum validation, rules_json Pydantic schema validation.
- Smart deck rules_json: rejected on unknown key, rejected on string length overflow, accepted for known keys.
- `/flashcards/due?deck_id=<manual>` returns only members of the deck.
- `/flashcards/due?deck_id=<smart>` returns rule-matching words.
- `/flashcards/due?deck_id=<not-mine>` returns 404 (user-scoping).
- Deck with `mode='smart'` rejects `POST /members` with 409.

**Frontend**
- `TagEditor` renders existing tags, supports add + remove, propagates via callback, filters duplicates.
- `DeckCard` renders name + member count + due-today badge; clickable for navigation.
- Flashcards page `deck_id` flow: selector updates URL, fetches correct due cards, persists to localStorage.
- Smart-deck rule builder: rules_json serializes correctly for all 6 rule keys.

**Migrations**
- `test_migrations.py`: applying `027_vocab_tags_decks.sql` on a DB with existing users + vocabulary leaves those rows intact, creates the new tables, indexes, and CHECK constraint on `decks.mode`.

---

## Open Questions

1. **Deck auto-tagging on save** — should saving a vocabulary word while reading optionally auto-tag it with the book's slug (e.g. `kafka-trial`)? This would materially improve the UX of smart decks by populating filters without manual effort. **Proposed:** Yes, but behind a user preference (`auto_tag_by_book`, default off). Document; implement only if PM confirms it's in scope for v1.

2. **Tag character set** — should tags allow spaces (`"phrasal verbs"`) or enforce hyphenation (`"phrasal-verbs"`)? Anki/Notion allow both. **Proposed:** allow spaces and store verbatim (after trim + lowercase). Autocomplete on the frontend compares case-insensitively.

3. **Smart-deck rule evaluation cost** — `resolve_deck_members` for a user with 1000+ vocabulary rows and a smart rule combining `tags_any` + `language` + `book_ids` issues a single indexed query. Worst-case cost is bounded by the user's vocab size. **Proposed:** accept current scaling; revisit only if we observe slow queries.

4. **Deck-level SRS scheduling** — should SM-2 state (`interval_days`, `ease_factor`) be per-deck instead of per-(user, word)? Anki supports this. Scope-creep for v1. **Proposed:** defer — `flashcard_reviews` stays per-(user, vocabulary_id) in v1; decks only filter which subset of cards is surfaced.

5. **Shared / community decks** — filtering a user's own words via another user's deck rules is tempting for "pre-built B2 vocab lists," but it adds a multi-user ACL model. **Out of scope** for v1; filed as a future proposal if this design ships successfully.

---

## Estimated Effort

~10 hours:
- Schema + service + migration test (2h)
- Tag routes + tests (1.5h)
- Deck routes (manual mode + smart rules) + tests (3h)
- Flashcard `deck_id` integration + tests (1h)
- Frontend TagEditor + vocab list chip filter (1.5h)
- Frontend decks pages (index + detail + create wizard) + tests (1h)

---

## Decision

**Awaiting PM approval.** Once the design doc merges, PM files an implementation issue labeled `feat` + `architecture` and implementation begins on `feat/vocab-tags-decks`.
