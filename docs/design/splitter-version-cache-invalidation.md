# Splitter-Version Cache Invalidation + `resplit_book.py` CLI

**Status:** Draft
**Author:** Architect
**Date:** 2026-04-27
**Priority:** P2
**Prior work:** #1221 (issue), #964 / #1055 (parent splitter rewrite + design doc `docs/design/epub-ncx-fragment-anchors.md`), #780 / #783 (prior cache-misalignment incidents — Faust + Kafka), `reports/architect_session_report_2026_04_25.md` §"Not done / follow-ups" item 3

## Problem

`build_chapters_from_epub` is now correct (#1055, post-#964) — the new splitter segments NCX fragment-anchor books that the old splitter collapsed. But the fix only applies to **new EPUB imports**. Books already in the catalog still hold every chapter-indexed cache row (`translations`, `audio_cache`, `chapter_summaries`, `book_insights`, `annotations`, `word_occurrences`, `user_reading_progress`, …) keyed to **the original splitter's chapter boundaries**.

Three things are missing:

1. We have no machinery to record which splitter version produced a book's chapters. So we can't ask the basic question "is this book's cache aligned with the current splitter?".
2. We have no way to dry-run a re-split and see the diff before committing.
3. We have no documented cache-invalidation policy for the cross-cutting effect of changing chapter boundaries on a single book.

The #964 design doc explicitly punted this:

> 1. **Version the cache.** Add `splitter_version` column to `books` table; stamp rows on import. Any chapter-indexed cache read checks the version and invalidates on mismatch. *(Out of scope for this design, but called out — ship in a follow-up before re-splitting anything.)*
> 3. Ship splitter-version cache gate (separate issue + PR, **prerequisite before any re-split tool**)

The 2026-04-25 architect rescue of Faust (#2229) — a one-off `/tmp/translate_faust.py` script that wiped and re-translated every chapter against the new splitter — was the ad-hoc workaround. It rescued one book; we have 90+ more in the catalog and no path other than "do the same thing every time" without this design.

## Why Path B

- New column on `books` — schema change, migration with backfill rules, lives forever.
- Cross-cutting: every chapter-indexed cache table needs an explicit, documented invalidation policy. There are nine such tables. Getting it wrong silently misaligns translations / audio / annotations against the rendered text — exactly the failure mode of #780 / #783, which the user has already paid for once.
- New CLI in `backend/scripts/` with diff-then-confirm semantics; impacts admin-only operations.
- Default for the system on a parser bump must be **fail-safe** (do nothing automatically) rather than fail-fast (re-split on next read). This design has to spell that out.

## Proposed solution

### 1. Schema change — `books.splitter_version`

Migration `036_books_splitter_version.sql`:

```sql
ALTER TABLE books ADD COLUMN splitter_version INTEGER NOT NULL DEFAULT 0;
```

- `0` = legacy. Any row that existed before this migration is stamped 0. We do **not** know what splitter version produced these chapters; we only know it was "whatever was in `services/splitter.py` when the EPUB was first imported".
- `1` = the post-#1055 NCX-fragment-anchor splitter, current as of 2026-04-27.
- Future versions (`2`, `3`, …) bump monotonically every time `build_chapters_from_epub` changes its output for any input.

The bump rule is "any change to splitter behaviour that could move a chapter boundary on any book". A pure refactor that produces byte-identical output for every book in the test corpus does **not** require a bump. A heuristic tweak that changes one book's boundaries **does**.

`books.splitter_version = 0` is the "needs investigation" sentinel. Books at the current version are aligned. Books behind the current version are candidates for re-split. Books ahead of the current version cannot exist (would indicate a downgrade — not supported; would require a manual data fix).

### 2. Splitter version constant

In `backend/services/splitter.py`, near the top of the module:

```python
# Bump every time build_chapters_from_epub's output changes for any input.
# See docs/design/splitter-version-cache-invalidation.md for the version contract.
CURRENT_SPLITTER_VERSION = 1
```

A short docstring above the constant lists the version → release mapping (1 = post-#1055, etc.) so the bump history is in-source rather than in git log.

### 3. Stamping at import

Every code path that creates a `books` row from a fresh EPUB blob — `services.book_epubs.cache_epub`, `services.gutenberg.fetch_book`, the `cache_books_locally.py` script, the upload path for user-imported EPUBs — sets `splitter_version = CURRENT_SPLITTER_VERSION` at insert time.

`books` rows that exist today (created before this migration) stay at `0`. They are not auto-bumped on next read; the only way a row leaves 0 is via `resplit_book.py --confirm` or via manual SQL.

### 4. Cache-invalidation policy per chapter-indexed table

This is the heart of the design. Every table whose primary key includes `(book_id, chapter_index)` — or whose rows otherwise reference a specific chapter of a specific book — has a documented behaviour on resplit. The CLI in §5 cascades these in a single transaction.

| Table | Action on resplit | Why |
|---|---|---|
| `translations` | DELETE WHERE book_id = ? | Paragraph-aligned; new chapter boundaries shift content. Translations are the most expensive cache and the most user-visible failure (this is the one the Faust rescue chased). |
| `audio_cache` | DELETE WHERE book_id = ? | Audio is chunk-and-time aligned to the *old* chapter content; new boundaries invalidate every chunk for the book. |
| `chapter_summaries` | DELETE WHERE book_id = ? | Summary is generated from the old chapter content; new boundaries make every summary stale. |
| `book_insights` | DELETE WHERE book_id = ? AND chapter_index IS NOT NULL | Insight rows pinned to a chapter become misaligned. Book-level insights (`chapter_index IS NULL`) survive. |
| `translation_queue` | DELETE WHERE book_id = ? | In-flight queue rows for old chapter indices; the queue is restartable so dropping is safe. |
| `chat_messages` | KEEP unchanged | No chapter_index column (book-level scope). |
| `reading_history` | KEEP unchanged | Analytics rows; the chapter_index becomes lossy historical data, but streak / heatmap behaviour is unaffected because they aggregate on date, not chapter. Documented as a known data-loss-equivalent (the chapter_index value no longer points at the same content, but the row's existence still counts toward the streak). |
| `user_reading_progress` | UPDATE … SET current_chapter = MIN(current_chapter, new_max_chapter_index) WHERE book_id = ? | Clamp into bounds. The user keeps their bookmark even if the chapter count drops; if it rises, no clamp needed. |
| `annotations` | DELETE WHERE book_id = ? | sentence_text might still match somewhere in the new text, but the chapter_index is the key the reader uses to jump to the highlight. The honest failure mode is "we drop the highlight"; pretending to remap is worse. The CLI's pre-confirm summary surfaces the count so the operator decides knowingly. |
| `word_occurrences` | DELETE WHERE book_id = ? | Each row pins (vocabulary_id, book_id, chapter_index, sentence_text). Reseeded the next time the user reads the book. The parent `vocabulary` row (no chapter_index) survives, so the user does not lose their saved word. |
| `user_book_chapters` | N/A — uploads | Uploaded books are the source of truth for their own chapters; resplit doesn't apply. The CLI rejects an upload book_id with an explicit error. |

In-memory state:

- `services.book_chapters._chapter_cache[book_id]` is invalidated after the resplit transaction commits.

The DELETE rules are deliberately blunt — book-level wipes — because:

- The user has 91 books in the catalog today. Per-chapter-index surgery is more code, more test surface, more failure modes; book-level wipes are auditable in one line each.
- The expensive caches (translations, audio_cache) are the ones that re-fill on demand; "drop and re-translate the popular chapters" is the same cost shape as "leave the misaligned ones in place and live with breakage".
- The cheap caches (summaries, word_occurrences) re-fill in seconds.

### 5. The CLI — `backend/scripts/resplit_book.py`

```
python -m backend.scripts.resplit_book --book-id 2229            # default = dry-run
python -m backend.scripts.resplit_book --book-id 2229 --confirm  # writes
python -m backend.scripts.resplit_book --book-id 2229 --confirm --bump-version-only  # for already-aligned books
```

**Dry-run output** (default):

```
Book #2229 — "Faust: Der Tragödie erster Teil"
  current splitter_version: 0
  target splitter_version : 1

Re-running build_chapters_from_epub on cached blob (book_epubs.id=…) …

Diff:
  chapters: 27 → 28  (+1)
  index 0 title: "FAUST: Der Tragödie erster Teil" → "Zueignung"   ⚠ shift
  index 3 title: "FAUST: Der Tragödie erster Teil" → "Nacht"       ⚠ shift
  index 9 title: "Hexenküche"                       → "Studierzimmer (II)"  ⚠ shift
  …

Cache rows that will be deleted on --confirm:
  translations          : 27 rows  (de:9, en:9, fr:9, zh:0)
  audio_cache           : 0 rows
  chapter_summaries     : 0 rows
  book_insights         : 4 rows  (chapter-pinned)
  translation_queue     : 0 rows
  annotations           : 0 rows
  word_occurrences      : 12 rows
Cache rows that will be UPDATED on --confirm:
  user_reading_progress : 1 row clamped to MIN(current_chapter, 27)

Use --confirm to apply. This is irreversible.
```

**Confirm mode** wraps every DELETE/UPDATE plus the `splitter_version` bump in a single transaction. On failure, nothing changes.

**`--bump-version-only`** is the escape hatch for books where the operator has manually verified that the chapters are aligned with the current splitter even though the version stamp is `0` (e.g. books imported under old code that happened to produce identical output to v1). It bumps the column and skips every cache wipe. The CLI prints a warning and requires the operator to type `yes` to proceed.

The CLI rejects book_ids whose `book_epubs` blob is missing (no source to resplit from) and uploaded books (the chapter source is `user_book_chapters`, not the splitter).

### 6. No automatic resplit

The reader path (`services.book_chapters.get_book_chapters`) does **not** check `splitter_version`. A book stays at its stamped version forever, until an admin runs the CLI. The reasons:

- Auto-resplit on-read implicitly invalidates user data (annotations, vocabulary occurrences, in-flight translations) without an audit trail. Doing that silently is exactly the #780 / #783 failure mode in a different shape.
- The "right" version for a book is sometimes "stay on 0" — e.g. an EPUB whose new-splitter output is *worse* (over-fragmentation). The admin needs to be in the loop.
- Re-splitting the popular books in one batch is a one-time operation, not an ongoing concern. CLI is enough.

A read-time *warning* (one log line per book per process) when `splitter_version != CURRENT_SPLITTER_VERSION` is acceptable and useful for operators; that's the only on-read signal.

### 7. Admin visibility — deferred

Surfacing "this book has cache misaligned with the current splitter" in the admin Books / Uploads view is a natural follow-up but **out of scope** for this design. File as a separate issue (`enhancement` + `architecture`-tagged if it adds an endpoint, otherwise `enhancement` + `ui`) once this design ships.

### 8. Logging and audit trail

Every `--confirm` run writes a single line to a new logger `services.resplit_audit`:

```
2026-04-27T12:34:56  book_id=2229  v0->v1  translations=-27  audio=-0  summaries=-0  insights=-4  occ=-12  prog=clamp:1
```

No DB table for this — the admin grep is enough; we don't need yet-another `*_log` table for an operation that runs by hand a handful of times a year.

## Migration / rollout

1. **Migration `036`**: add the column, default `0`. No data movement; trivial.
2. **Splitter constant** lands in the same PR as the migration. Both are inert without the CLI.
3. **CLI `resplit_book.py`** lands in the implementation PR. New backend tests in `backend/tests/test_resplit_book_script.py`:

   - dry-run produces the expected diff for a seeded test book whose splitter version is `0`,
   - confirm wipes the seven targeted tables in one transaction,
   - confirm bumps `splitter_version` only on transaction success,
   - rejecting an upload book_id raises `SystemExit` with a clear message,
   - `--bump-version-only` doesn't touch any cache table.

   Plus a migration test seeding rows pre-`036` and asserting backfill stamps `0`.

4. **First production use** (after merge): `--dry-run` against #2229 (Faust) and the next ~10 most-popular non-Chinese books. Confirm one at a time, in priority order.

## Test plan

| Test | Asserts |
|---|---|
| `test_migration_036_backfill_zero` | rows existing pre-migration get `splitter_version = 0`; new INSERTs without an explicit value still get `0` because the migration default is `0`, *not* `CURRENT_SPLITTER_VERSION`. |
| `test_cache_epub_stamps_current_version` | `services.book_epubs.cache_epub` (or whatever the import call is) sets `splitter_version = CURRENT_SPLITTER_VERSION` on every new row. |
| `test_resplit_dry_run_produces_diff` | dry-run on a seeded test book reports the right table-by-table delete counts. |
| `test_resplit_confirm_atomic` | confirm wipes all seven targeted tables and bumps the version in a single transaction; raising mid-transaction (forced via test hook) leaves every row intact. |
| `test_resplit_clamps_reading_progress` | `user_reading_progress.current_chapter > new_max` is clamped to `new_max`, not deleted. |
| `test_resplit_keeps_chat_messages` | chat_messages rows for the book are untouched. |
| `test_resplit_keeps_book_level_insights` | `book_insights WHERE chapter_index IS NULL` rows survive. |
| `test_resplit_rejects_uploaded_book` | book_id pointing at `user_book_chapters` is rejected without touching the DB. |
| `test_resplit_bump_version_only` | does not touch any cache table; only updates `splitter_version`. |
| `test_in_memory_chapter_cache_invalidated` | `services.book_chapters._chapter_cache[book_id]` is dropped after a confirmed resplit. |

All tests run against the in-memory SQLite test fixture; no real EPUB downloads.

## Risks / open questions

1. **Annotation loss is the user-visible cost.** A user who has highlighted sentences in a book will lose every highlight on resplit. The CLI surfaces the count pre-confirm; the operator should communicate to that user (or batch the resplit on a quiet day for that book). Alternative considered: try to remap annotations by `sentence_text` lookup against the new chapter content. Rejected because (a) the same sentence can appear in multiple new chapters, (b) the remap can silently drop legitimate matches, (c) the CLI is admin-only and runs rarely; honest deletion plus the count report is the better operator experience.

2. **Reading-history stays misaligned-but-present.** A row that records "user read chapter 9 on date X" stays in the table after the resplit changes the meaning of "chapter 9". The streak / heatmap behaviour is unaffected because they aggregate on date, not chapter content. The chapter-level granularity becomes lossy, but the table is analytics, not a source of truth.

3. **Vocabulary survives, occurrences don't.** A user's saved word list (`vocabulary` table) has no chapter_index, so the words themselves are kept. Their `word_occurrences` for the resplit book are dropped and reseeded on the next read.

4. **Stamping uploaded EPUBs.** Uploaded books that came in via the EPUB-upload path (PR #1696's parent flow, now in production) get a `book_epubs` blob too. They should be stamped `CURRENT_SPLITTER_VERSION` on import like any other EPUB, and they are *also* governed by `user_book_chapters` once their chapters are extracted. The CLI rejects them not because the version doesn't apply, but because the chapters are not produced by the splitter at read time — re-splitting an upload would diverge from the stored `user_book_chapters` rows. Leaving the column populated is fine and informative; the CLI just refuses to act.

5. **Future bumps and old books.** If we bump `CURRENT_SPLITTER_VERSION` from 1 → 2 some months from now, every book stamped `1` joins the resplit-candidate pool alongside the long tail still at `0`. The CLI handles all these the same way. Operators triage "version-N candidates" in popularity order.

6. **Concurrent reader during resplit.** A reader who is mid-chapter on a book the operator is resplitting could see a chapter-count change between requests. The chance is negligible (single-operator CLI, run rarely, transaction is fast), but the behaviour is "the next request renders fresh content from the new splitter; the user's bookmark gets clamped on next save". No locks needed.

7. **`splitter_version` on `book_epubs` rather than `books`?** Considered. Rejected because the version describes the chapters produced from the blob (a property of `(blob_bytes, splitter_code)` → chapter list), and `books` is the single source of truth for "this book is in the catalog". `book_epubs` is the binary cache; if we ever switch to a different blob source for the same book the `books` row stays. Putting the column on `books` is more durable.

8. **Why not `splitter_version TEXT` (e.g. git SHA)?** Considered. Rejected because (a) the test corpus snapshot — "v1 = post-#1055" — is a code release boundary the operator already understands, (b) integer comparison is simpler at every read site, (c) we don't expect the catalog to ever care about more than a handful of distinct versions in flight at once.

## Acceptance

- Migration ships with a test that seeds a `v0` book and verifies the column behaviour after backfill.
- Splitter constant `CURRENT_SPLITTER_VERSION = 1` lands.
- `resplit_book.py --book-id 2229 --dry-run` reproduces the chapter-count delta the ad-hoc Faust script proved (27 → 28) on local fixture data.
- `--confirm` against a seeded test book deletes the seven targeted-table rows and bumps `splitter_version` in one transaction.
- `docs/architecture/` (or an extension to the parent splitter doc) describes the version contract.

## Path B gate

This design doc PR will land with `needs-user-approval` per CLAUDE.md gate layer 2. PM reviews for readiness and applies `pm-approved`; the user is the sole approver and removes `needs-user-approval` + applies `user-approved` to release the merge. Implementation is filed as a follow-up issue (or as a conversion of #1221) once this design is merged.
