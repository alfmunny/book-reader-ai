<!-- THIS PAGE IS AUTO-GENERATED. Edit the source script or report, not this file. Re-run `python -m scripts.generate_docs` after changes. -->


# Migration index

Every migration file is numbered and self-describing. Full files live under `backend/migrations/`.

## 001 — `001_initial_schema.sql`

Initial schema: books cache, users, translations, audiobooks.
This captures the state of the database as of the first commit.

## 002 — `002_add_book_images.sql`

Add images column to books table for Gutenberg illustration metadata.
Uses ALTER TABLE which is idempotent via IF NOT EXISTS on SQLite >= 3.35.

## 003 — `003_create_audio_cache.sql`

Per-chunk TTS audio cache. One row per text chunk, keyed by
(book, chapter, chunk_index, provider, voice) so different voices
and providers cache independently.

## 004 — `004_user_roles_and_approval.sql`

Add role (admin/user) and approved (0/1) columns to users table.
The first user who signs up is automatically admin + approved.
All subsequent users start as role='user', approved=0 (pending).

## 005 — `005_add_github_id.sql`

Add GitHub OAuth support: users can sign in via GitHub in addition to Google.

## 006 — `006_add_apple_id.sql`

Add Apple OAuth support: users can sign in via Apple in addition to Google and GitHub.

## 006 — `006_bulk_translation_jobs.sql`

Bulk translation job state for admin-initiated background translations.
Holds one row per run so admins can see history + resume interrupted jobs.

## 007 — `007_translation_provider_info.sql`

Record the provider + model that produced each cached translation so the
reader can show "via gemini-3.1-flash" / "via google-translate" accordingly.

## 008 — `008_translation_queue.sql`

Always-on translation queue.

Each row represents "translate book B chapter C into target language L".
The queue worker pulls pending rows in priority order and processes them,
re-using the same per-batch translator the bulk job uses. Unlike a one-shot
bulk job, the queue is permanent — newly-saved books are auto-enqueued and
the worker just keeps draining.

## 009 — `009_queue_queued_by.sql`

Track who (or what) put each item on the translation queue.
NULL = auto-enqueued by save_book(). Otherwise the admin's email.

## 010 — `010_rate_limiter_per_model.sql`

Per-model RPD counters so each model in a fallback chain has its own
daily budget. Pre-existing rows are migrated under model='' so callers
that don't specify a model (legacy bulk_translate, etc.) keep working.

## 011 — `011_translation_title.sql`

Translate chapter titles too, so the reader can show e.g. "第一章"
in place of "CHAPTER I." when translation mode is on. Nullable so
pre-existing rows stay valid.

## 012 — `012_user_plan.sql`

_(no description comment in file)_

## 013 — `013_user_reading_progress.sql`

_(no description comment in file)_

## 014 — `014_annotations_vocabulary.sql`

_(no description comment in file)_

## 015 — `015_reading_companion_fixes.sql`

Prevent duplicate annotations for same sentence

## 016 — `016_insight_context.sql`

Store the passage/selected text that was used as context when the insight was generated

## 017 — `017_vocabulary_lemma_language.sql`

Add lemma (base/dictionary form) and language to vocabulary.
lemma is populated asynchronously by the Wiktionary lookup service.

## 018 — `018_drop_bulk_translation_jobs.sql`

Bulk translate system was removed in PR #257 (2026-04-22).
Drop the orphaned table so existing installs are cleaned up.

## 019 — `019_reading_history.sql`

Append-only log of chapter navigation events.
One row per chapter visited. Used to compute reading streak and activity heatmap.
The existing user_reading_progress table only keeps the latest chapter per book.
This table preserves the full timeline for analytics.

## 020 — `020_chapter_summaries.sql`

Cached AI-generated chapter summaries.
Shared across all users: first reader to request a summary pays the Gemini cost,
subsequent requests return the cached result instantly.

## 021 — `021_user_books.sql`

_(no description comment in file)_

## 022 — `022_book_insights_unique.sql`

Remove duplicate insights rows (keep lowest rowid per unique key) before
creating the index so this migration cannot fail with IntegrityError on
databases that already have duplicate questions in the same chapter.

## 023 — `023_book_epubs.sql`

Stores the downloaded EPUB binary for each Gutenberg book.
Used by split_with_html_preference as the primary chapter source
(preferred over on-demand HTML fetch and plain-text regex splitting).
Populated at book-add time for new books. Backfill script available
for books already in the DB.

## 024 — `024_flashcard_reviews.sql`

Spaced repetition state for vocabulary flashcards (SM-2 algorithm).
One row per (user, vocabulary word). New words are seeded with due_date=today
by the GET /vocabulary/flashcards/due endpoint on first access.

## 025 — `025_user_book_chapters.sql`

Dedicated table for uploaded-book chapter content. Replaces the previous
JSON-in-books.text encoding (issue #357, design doc docs/design/user-book-chapters.md).

Ops step: after this migration applies, run
  python -m backend.scripts.migrate_upload_chapters
once to copy existing JSON content into this table, then
  python -m backend.scripts.migrate_upload_chapters --finalize
once the new router code is deployed and stable to clear books.text.

## 026 — `026_fts5_search.sql`

FTS5 full-text search indexes for user content (issue #592, design doc
docs/design/fts5-in-app-search.md). External content mode: the FTS5 virtual
tables store only the inverted index; the source tables remain authoritative.

## 027 — `027_vocab_tags_decks.sql`

Vocabulary tags & custom study decks (issue #645 / design doc:
docs/design/vocab-tags-decks.md). Additive: no existing rows touched.

## 028 — `028_fk_orphan_cleanup.sql`

Clean up rows that violate declared FK constraints BEFORE PRAGMA
foreign_keys = ON starts firing on every connection. Runs once. After
this, the engine prevents new orphans from ever being written.

Issue #700 / #748 / design doc docs/design/fk-enforcement.md.

Migration 028 is applied with FK enforcement OFF (the migration runner
explicitly toggles PRAGMA foreign_keys), so these DELETEs don't re-trigger
the very constraints we're enabling.

## 029 — `029_invalidate_shifted_chapter_cache.sql`

Invalidate chapter-indexed cache rows for Faust (Gutenberg #2229) and
Der Prozess / Kafka (Gutenberg #69327) after PR #780 corrected the EPUB
splitter to drop the rogue chapter-0 frontmatter. All cached rows with
chapter_index >= 1 are now off by one and must be cleared so readers
see correct content on re-request.

Issue #783.

## 030 — `030_invalidate_chapter0_cache.sql`

Defensively clear any chapter_index = 0 cache rows for Faust (Gutenberg #2229)
and Der Prozess / Kafka (Gutenberg #69327).

Migration 029 cleared chapter_index >= 1 rows after PR #780 fixed the EPUB
splitter to drop the rogue frontmatter chapter. However, if any user translated
the old rogue chapter 0 (frontmatter/TOC page) before #780, that cached row
at chapter_index = 0 would now misalign with the new chapter 0 content.
This migration removes those potentially-stale rows as a defensive cleanup.

Issue #800.

## 031 — `031_fk_annotations_vocabulary.sql`

Issue #754 / design doc: docs/design/declared-fks-schema.md
PR 1 of 4: declare REFERENCES … ON DELETE CASCADE on annotations and
vocabulary. Both tables had soft user_id / book_id columns (no FK clause),
so runtime FK enforcement (#751) never cascaded deletions for them — we
were carrying manual shadow cascades in delete_user and admin.delete_book
instead.

Per CLAUDE.md migration policy this runs unconditional orphan DELETEs
before the rewrite, even though #774 already cleaned these tables. If the
counts are zero the DELETEs are no-ops; if something slipped the net, we
still produce a consistent post-state for the new FKs to accept.

Runner context: migrations run with PRAGMA foreign_keys = OFF, so
  - INSERT INTO …_new SELECT * FROM … does not validate FKs yet
  - DROP TABLE does not cascade to children
  - ALTER TABLE … RENAME updates FK clauses in other tables by name

Existing FKs that already point at vocabulary(id) keep working after the
drop+rename because references are resolved by parent table name:
  word_occurrences, flashcard_reviews, vocabulary_tags, deck_members.

## 032 — `032_fk_book_insights_chapter_summaries.sql`

Issue #754 / #841 / design doc: docs/design/declared-fks-schema.md
PR 2 of 4: declare REFERENCES … ON DELETE CASCADE on book_insights
(user_id, book_id) and chapter_summaries (book_id). These are AI-derived
per-chapter cache tables that had soft parent references — runtime FK
enforcement (#751) could not cascade their rows, so services/db.delete_user
and admin.delete_book had to clean them manually.

Same pattern as #851 (PR 1/4): orphan DELETE first (mandatory per
CLAUDE.md migration policy), then table rewrite, then recreate indexes.
Runner context: migrations run with PRAGMA foreign_keys = OFF, so the
INSERT … SELECT * step doesn't trigger the new FKs.
