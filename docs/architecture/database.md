# Database

The app runs on a single SQLite file. Migrations are numbered, forward-only, and live under `backend/migrations/NNN_<name>.sql`.

## Key tables

| Table | Purpose | Notes |
|---|---|---|
| `users` | One row per signed-in user | Supports Google + GitHub + Apple OAuth |
| `books` | Gutenberg + uploaded book catalogue | `source='upload'` flags user-uploaded books |
| `book_epubs` | EPUB blob per book | 80–300 KB typical; 11 MB for some picture books |
| `user_book_chapters` | Per-book chapter rows for uploaded books | See [#357 design](../design/user-book-chapters.md) |
| `translations` | Cached AI translations, keyed by `(book, chapter, language)` | |
| `audio_cache` | TTS audio BLOBs, keyed per chunk | |
| `annotations` | User highlights + notes | FTS5-indexed since #592 |
| `vocabulary` + `word_occurrences` | Saved words and their occurrences | |
| `vocabulary_tags` | Free-text tags on vocabulary | See [#645 design](../design/vocab-tags-decks.md) |
| `decks` + `deck_members` | User-owned study decks (manual / smart) | Same design |
| `flashcard_reviews` | SM-2 spaced repetition state | |
| `book_insights` | Saved AI Q&A + context | |
| `chapter_summaries` | Cached AI per-chapter summaries | Shared across users |
| `reading_history` + `user_reading_progress` | Per-user reading state | Drives profile stats + heatmap |
| `translation_queue` | Background worker queue rows | |
| `rate_limiter_usage` | Per-provider / per-model / per-day request counter | Per-model since migration 010 |

## Migration index

Every migration file is numbered and self-describing. The full list is under [`backend/migrations/`](https://github.com/alfmunny/book-reader-ai/tree/main/backend/migrations):

```text
001_initial_schema.sql          # books, users, translations, audiobooks
...
028_fk_orphan_cleanup.sql       # pre-#751 orphan cleanup
029_invalidate_shifted_chapter_cache.sql
030_invalidate_chapter0_cache.sql
031_fk_annotations_vocabulary.sql       # #754 PR 1/4 (shipped)
032_fk_book_insights_chapter_summaries.sql  # #754 PR 2/4 (shipped)
```

## Migration policy

Every migration that adds a constraint to a table with existing data **must** include a data-cleanup step first. See [Development → Migrations](../development/migrations.md) for the checklist and examples.

## Runtime FK enforcement

SQLite's `PRAGMA foreign_keys` defaults to OFF and must be set per connection. The backend's `services/db.py` monkey-patches `aiosqlite.Connection.__aenter__` to issue `PRAGMA foreign_keys = ON` on every open connection. See [FK enforcement design (#700)](../design/fk-enforcement.md).

## Backup and rollback

- **Production backups**: Railway snapshots the persistent volume automatically. 30-day retention at the time of writing.
- **Rollback on bad migration**: the migration runner rolls back the failed transaction and re-raises. The app container fails liveness on schema mismatch, so traffic stays on the previous image. Railway redeploy restores the prior image; DB rollback is the snapshot restore.

See the [declared-FKs design doc](../design/declared-fks-schema.md) "Rollback strategy" section for the full three-layer policy.
