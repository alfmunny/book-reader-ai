<!-- THIS PAGE IS AUTO-GENERATED. Edit the source script or report, not this file. Re-run `python -m scripts.generate_docs` after changes. -->


# Scripts reference

Operational CLI tools under `backend/scripts/`. Every script runs as `python -m <module>` from the `backend/` directory.

## `backfill_epubs.py`

Backfill stored EPUBs for Gutenberg books that don't have one yet.

Motivation
----------
The EPUB audit (`scripts/epub_split_audit.py`, #832 + #839) only scans books
with a row in `book_epubs`. As of 2026-04-24, 1 of 122 Gutenberg books has a
stored EPUB — the rest won't contribute signal until someone opens them in
the reader and `_background_fetch_epub` fires.

This script iterates Gutenberg books with no stored EPUB, fetches the
no-images edition via `services.gutenberg.get_book_epub`, and persists it
via `services.db.save_book_epub`. Books where Gutenberg has no EPUB at all
are skipped silently.

Usage
-----
    python -m scripts.backfill_epubs                 # all missing books
    python -m scripts.backfill_epubs --limit 20      # cap to first 20
    python -m scripts.backfill_epubs --delay 2.0     # sleep between fetches
    python -m scripts.backfill_epubs --dry-run       # log only, no writes

Exits 0 on success.

### Flags

| Flag | Description |
|---|---|
| `--limit` | Cap the number of books to process (default: all missing). |
| `--delay` | — |
| `--dry-run` | Fetch and report sizes, but don't write to the DB. |

```bash
python -m scripts.backfill_epubs
```

## `check_translation_alignment.py`

Verify source-vs-translation structural alignment for any cached book.

Generalised from `/tmp/check_faust_alignment.py` per the design doc at
`docs/design/translation-alignment-checker.md` (issue #1073).

What it checks per chapter:

    1. Row existence       — one translations row per splitter chapter.
    2. Paragraph count     — src paragraph count == translated paragraph count.
    3. Paragraph line drift — for paragraphs with ≥4 lines, |src_lines − tr_lines|
                              must be 0. Catches Opus's typical off-by-one drop
                              on chunked input (the 18 drifts in Rilke/zh that
                              the original Faust-only checker found).
    4. Stanza line count   — for paragraphs flagged as VERSE by the classifier,
                              src and translated lines must match exactly.
    5. Speaker cues        — per-source-language detector (de/fr/en/ru) flags
                              source cues; checker requires a translated cue at
                              the same line position.
    6. Title (informational) — null `title_translation` is reported but does
                              not fail the check.

Usage:
    python -m scripts.check_translation_alignment --book-id 24288 --target-lang zh
    python -m scripts.check_translation_alignment --all-books --target-lang zh
    python -m scripts.check_translation_alignment --book-id 24288 --target-lang zh         --format json --severity-threshold error

Exit code 0 when no issues at the requested severity threshold; non-zero
otherwise. Output is markdown by default (issue-body friendly), JSON via
`--format json` for CI gating.

### Flags

| Flag | Description |
|---|---|
| `--book-id` | Single book id |
| `--all-books` | Check all books with translations in the target language |
| `--target-lang` | Target language code (default: zh) |
| `--format` | — |
| `--severity-threshold` | Issues at or above this severity affect the exit code (default: error) |

```bash
python -m scripts.check_translation_alignment
```

## `epub_split_audit.py`

EPUB split quality audit (issues #769, #834).

Compares the **character count** and **paragraph count** produced by the
EPUB-path splitter and the plain-text-path splitter for every book with a
stored EPUB, and surfaces a third **structural** signal for the specific
"verse-collapse" pattern that bit us in #820 — paragraphs where an embedded
newline is followed by an all-caps speaker cue, indicating the EPUB path
collapsed poetry / drama into a single visual block.

Three signals, independently flagged:

- **Character ratio** (#769 / #758 / #767) — EPUB chars drop substantially
  below the plain-text baseline. Default gate: < 50%.
- **Paragraph ratio** (#834) — EPUB paragraphs fewer than the plain-text
  paragraph count. Invisible to the char-count check. Default gate: < 80%.
- **Structural speaker-cue collapse** (#834 / #820) — a paragraph exceeds
  `--structural-paragraph-len` characters AND contains an embedded newline
  followed by an all-caps name + period (`\n  HELENA.`). No plain-text
  baseline needed.

Usage:
    python -m scripts.epub_split_audit                      # all books, stdout
    python -m scripts.epub_split_audit --book-id 69327      # single book
    python -m scripts.epub_split_audit --csv out.csv        # write CSV report
    python -m scripts.epub_split_audit --threshold 0.7      # stricter char gate
    python -m scripts.epub_split_audit --para-threshold 0.9 # stricter para gate

Exit code is 1 when at least one book is flagged by any of the three
signals — the script can be wired into CI as a data-quality gate.

### Flags

| Flag | Description |
|---|---|
| `--book-id` | Audit a single book by id. |
| `--threshold` | Char ratio below which a book is flagged (default: 0.5). |
| `--para-threshold` | Paragraph ratio below which a book is flagged (default: 0.8). |
| `--structural-paragraph-len` | Min paragraph length (chars) to consider for the structural speaker-cue check (default: 400). |
| `--csv` | Optional CSV output path. |

```bash
python -m scripts.epub_split_audit
```

## `expire_subscriptions.py`

Daily cron: defensively downgrade users whose paid period has ended.

PR D of the pricing-plans series (#1790 / docs/design/pricing-plans.md).

The Stripe webhook (PR C2) handles `customer.subscription.deleted` by
clearing `stripe_subscription_id` and leaving the tier alone — the user
paid through `tier_period_end`, so they keep paid features until then.
This script enforces the actual downgrade: any user whose
`tier_period_end < now()` AND has no active subscription gets bumped
back to `'free'`.

Belt-and-suspenders for two failure modes:
  1. Stripe webhook drop — the .deleted event never arrived; we still
     downgrade based on the period end alone.
  2. Active subscription with expired period — Stripe should have sent
     subscription.updated to extend the period; if it didn't, this
     script catches the gap.

Usage
-----
    python -m backend.scripts.expire_subscriptions          # default
    python -m backend.scripts.expire_subscriptions --dry-run  # report only

Schedule: daily at an off-minute (e.g. 03:17 UTC). Cheap query, indexed
on tier_period_end via the existing users PRIMARY KEY scan.

### Flags

| Flag | Description |
|---|---|
| `--dry-run` | Print users that would be downgraded; don't write. |

```bash
python -m scripts.expire_subscriptions
```

## `freeze_book.py`

Fossilize a book: freeze its chapter split into a committed artifact.

Slice 1 of the fossilized-content architecture (#2624 /
docs/design/local-first-content.md). Chapter boundaries are computed at
request time but translations and annotations are durably keyed to them —
this script makes the split *data*: it writes data/books/book_<id>.json
holding the book's metadata, the frozen chapter split (paragraph arrays),
and every existing translation for the book, merged from both legacy
export conventions. The artifact carries a content_sha256 over the
chapters so any later hand-edit to the frozen split fails loudly at
ingest (scripts/ingest_book.py).

Freezing is a one-way door per book: once annotations anchor to a frozen
split, re-splitting requires migrating them. --audited-by is therefore a
required attestation that a human (or agent session) has reviewed the
chapter list against the source. A mechanical pre-filter flags obvious
junk chapters (TOC fragments, ISBN notices, stray headings) and blocks
the write unless --force is given.

When to use: the first time a book acquires something that must stay
aligned (a translation or an annotation), or when resuming the
big_translate pipeline on a book (freeze before translating).

Example
-------
    cd backend
    python -m scripts.freeze_book --book-id 2229 --audited-by alfmunny
    python -m scripts.freeze_book --book-id 2229 --audited-by alfmunny --dry-run

### Flags

| Flag | Description |
|---|---|
| `--book-id` | — |
| `--audited-by` | Attestation: who reviewed the chapter list against the source |
| `--dry-run` | — |
| `--force` | Proceed despite audit findings or an existing freeze |

```bash
python -m scripts.freeze_book
```

## `ingest_book.py`

Ingest a fossilized book artifact into the local database.

Slice 1 of the fossilized-content architecture (#2624 /
docs/design/local-first-content.md). Reads data/books/book_<id>.json
(written by scripts/freeze_book.py), verifies its content_sha256 over the
chapters array — aborting loudly on mismatch, exit code 2, nothing
written — and populates the content tables: the books row (from the
artifact's meta), book_chapters + book_freeze (the frozen split), and
translations for every language in the artifact. Runs in one transaction
per book. Touches ONLY content tables — never annotations, vocabulary,
reading_history, or any other user table.

When to use: after freezing a book, after `git pull` brings new/updated
artifacts, or when rebuilding the content cache from data/ (slice 2's
rebuild script drives this per book).

Example
-------
    cd backend
    python -m scripts.ingest_book --book-id 2229
    python -m scripts.ingest_book --all

Ingest is non-destructive by default (#2631): if the DB holds more
translation rows for a language than the artifact carries, it aborts
with the missing chapter indices instead of deleting them. Pass
--allow-shrink to override deliberately.

Note: a running server holds a process-local chapter cache; restart it
(or wait for the next deploy) to serve freshly ingested content.

### Flags

| Flag | Description |
|---|---|
| `--book-id` | — |
| `--all` | Ingest every artifact under data/books/ |
| `--allow-shrink` | Permit an artifact to replace a language with fewer rows than the DB holds (#2631 guard) |

```bash
python -m scripts.ingest_book
```

## `migrate_upload_chapters.py`

One-time migration: move JSON chapters from books.text to user_book_chapters.

Run in two phases (both idempotent):

    # Phase 1 — copy rows into the new table (books.text untouched)
    python -m backend.scripts.migrate_upload_chapters

    # Phase 2 — clear books.text after the new router code is stable
    python -m backend.scripts.migrate_upload_chapters --finalize

The two-phase split keeps the rollback path safe: if the router deploy that
reads from user_book_chapters fails, books.text is still intact and the old
code path keeps working.

See docs/design/user-book-chapters.md for the full deployment checklist.

### Flags

| Flag | Description |
|---|---|
| `--finalize` | After the new router deploy is stable, clear books.text for migrated uploads. |
| `--db-path` | SQLite file (defaults to $DB_PATH or backend/books.db) |

```bash
python -m scripts.migrate_upload_chapters
```

## `next_untranslated_chapter.py`

Print the next (chapter_index, paragraphs_json) for book 1342 → zh
that has no cached translation yet. Used by the self-paced translation
loop so each tick can pick up where the previous one left off.

Prints one JSON object per line to stdout. Exits with code 0 and
prints `{"done": true}` when every chapter is translated.

Usage:
    PYTHONPATH=backend backend/venv/bin/python \
        backend/scripts/next_untranslated_chapter.py --book-id 1342 --lang zh

### Flags

| Flag | Description |
|---|---|
| `--book-id` | — |
| `--lang` | — |
| `--count` | How many not-yet-translated chapters to print (default 2). |

```bash
python -m scripts.next_untranslated_chapter
```

## `preseed_translations.py`

Pre-populate the `translations` table for every cached book.

Walks every book in the DB, splits it into chapters using the same
`services.splitter.build_chapters` the reader uses, and writes a cached
translation for every chapter into the shared cache. Users hit the cache
instantly the first time they open a chapter — no API spend at runtime.

Idempotent: chapters that already have a translation for the target
language are skipped. Books that are already in the target language are
skipped entirely.

Usage:
    # Default — free Google Translate, target Chinese
    python scripts/preseed_translations.py

    # Use Gemini with a key from env var (best literary quality, free tier)
    GEMINI_API_KEY=AIza... python scripts/preseed_translations.py --provider gemini

    # Different target language
    python scripts/preseed_translations.py --target de

    # Just one book (useful for testing)
    python scripts/preseed_translations.py --book-id 2229

    # See what would be done without calling any API
    python scripts/preseed_translations.py --dry-run

    # Bump concurrency (default 3 — Gemini free tier RPM is low)
    python scripts/preseed_translations.py --concurrency 5

### Flags

| Flag | Description |
|---|---|
| `--target` | Target language code (default: zh) |
| `--provider` | Translation backend (default: google — free, no key) |
| `--gemini-key` | Gemini API key (or set GEMINI_API_KEY env var) |
| `--book-id` | Only process this one book |
| `--concurrency` | Max in-flight translations (default: 3) |
| `--dry-run` | Print what would be done without calling any API |

```bash
python -m scripts.preseed_translations
```

## `save_translation.py`

Save an in-session literary translation to local DB and append to JSON backup.

Companion tool for in-session literary translation: when the assistant produces a
chapter translation directly in conversation (no API call to a model provider),
pipe the JSON entry to this script. It will:

    1. Write the row to the local `translations` table so the local reader serves
       it immediately on the next request.
    2. Append the entry to a JSON backup at
       `backend/data/translations/{book_id}_{target_language}.json` so the work
       survives DB wipes.

The backup is the durable record. Hard-coded chapter-cache invalidation
migrations (e.g. 029_invalidate_shifted_chapter_cache, 030_invalidate_chapter0_cache)
have wiped Faust translations once already; the JSON backup is what lets us
re-seed without paying for the work twice. The backup is also the input
for `scripts/seed_translations.py`, which pushes the rows to production.

End-to-end workflow for translating a new book/language:

    # 1. Dump source chapters via the splitter (one-time, ad hoc):
    DB_PATH=backend/books.db python -c "
        import asyncio, json
        from services.book_chapters import split_with_html_preference
        from services.db import get_cached_book
        async def m():
            b = await get_cached_book(BOOK_ID)
            chs = await split_with_html_preference(BOOK_ID, b['text'])
            json.dump([{'index': i, 'title': c.title, 'text': c.text}
                       for i, c in enumerate(chs)],
                      open('/tmp/src.json','w'), ensure_ascii=False, indent=2)
        asyncio.run(m())"

    # 2. For each chapter, the assistant produces translation in conversation
    #    and pipes a JSON entry through this script:
    echo '{"book_id":2229,"chapter_index":0,"target_language":"zh",
           "paragraphs":["..."],"provider":"anthropic",
           "model":"claude-opus-4-7 (in-session)",
           "title_translation":"献辞"}'       | python scripts/save_translation.py

    # 3. After all chapters are saved, push to prod:
    BACKEND_URL=... ADMIN_JWT=... python scripts/seed_translations.py         --file backend/data/translations/2229_zh.json

Required JSON fields (read from stdin):
    book_id          int          Gutenberg book ID
    chapter_index    int          0-based, must align with the live splitter
    target_language  str          e.g. "zh", "en", "fr" — short code, no region
    paragraphs       list[str]    one entry per source paragraph (\n\n-separated
                                  block); within a paragraph, \n line breaks are
                                  preserved as-is — important for drama / verse

Optional JSON fields:
    provider           str        default "anthropic"
    model              str        default "claude-opus-4-7 (in-session)"
    title_translation  str | null translated chapter title (drives reader chrome)

Idempotency:
    Re-running with the same (book_id, chapter_index, target_language) replaces
    both the DB row (INSERT OR REPLACE) and the backup entry — safe to re-run.

Environment overrides:
    DB_PATH     Path to the sqlite DB the local backend serves
                (default: backend/books.db relative to this script).
    BACKUP_DIR  Path to the backup directory
                (default: backend/data/translations relative to this script).

```bash
python -m scripts.save_translation
```

## `seed_books.py`

Seed the database with popular Project Gutenberg books.

Downloads the top N books (by download count) for each language and caches
them in the local SQLite database. Idempotent — skips books already cached.

Usage:
    python scripts/seed_books.py                    # default: 100 books, en+de+fr
    python scripts/seed_books.py --count 50         # fewer books
    python scripts/seed_books.py --languages en,de  # specific languages
    python scripts/seed_books.py --dry-run           # just list, don't download

On Railway:
    railway run python scripts/seed_books.py

### Flags

| Flag | Description |
|---|---|
| `--count` | — |
| `--languages` | — |
| `--dry-run` | Just list the books without downloading |
| `--append` | Merge into the existing popular_books.json (keep old entries, add new ones by ID). Default behaviour replaces the manifest. |
| `--manifest-only` | Fetch metadata from Gutendex and write popular_books.json only; skip downloading full text to the database. |
| `--collections` | Build the multi-language collections manifest used by the Discover page (all/en/de/fr/ja). Implies --manifest-only. |

```bash
python -m scripts.seed_books
```

## `seed_translations.py`

Upload a `translate_book.py` JSON export to the admin `translations/import`
endpoint so production gets the pre-translated cache rows.

Usage:
  ADMIN_JWT=eyJ...  python scripts/seed_translations.py \
      --file translations_1342_zh.json \
      --api-url https://api.book-reader.railway.app/api

The admin JWT comes from signing in to the admin panel and copying the
Bearer token from a network request (or generating one via the auth
service). Keep it short-lived.

### Flags

| Flag | Description |
|---|---|
| `--file` | Path to the JSON file produced by translate_book.py --output |
| `--api-url` | Prod API base URL, e.g. https://api.book-reader.railway.app/api (or set BACKEND_URL env var) |
| `--token` | Admin Bearer JWT (or set ADMIN_JWT env var) |
| `--chunk` | Upload in chunks of N entries per request (default 50). Keeps request bodies under proxy limits for big books. Ignored when --overwrite is set (all entries sent in one request). |
| `--overwrite` | Atomically replace all translations for each (book_id, language) pair in the file. Sends the entire file in a single request — safe because the server rolls back on failure. |

```bash
python -m scripts.seed_translations
```

## `translate_book.py`

Translate a single cached book chapter-by-chapter via Gemini and either:

  - write the translation rows to the local `translations` table (so the
    reader shows it immediately), and/or
  - export the rows to a JSON file for uploading to production via
    `seed_translations.py`.

Why this exists:
  The queue worker is great for production throughput, but when you want
  to pre-translate a book offline (Pride and Prejudice → zh, say) and
  then seed the prod DB, a one-shot CLI is simpler: no queue to manage,
  deterministic ordering, prior-context carried across chapters for
  style consistency.

Alignment discipline:
  Uses the same `split_with_html_preference` the reader uses, so chapter
  indices match what the user sees. Uses `translate_chapters_batch` so
  we inherit its paragraph-preservation prompt, oversized-chapter
  chunking, and BLOCK_NONE safety settings. After each chapter we
  verify the translated paragraph count matches the source. Strict
  mode (the default) fails the whole chapter on mismatch; pass
  `--allow-misaligned` to save partial results anyway.

Usage:

  GEMINI_API_KEY=AIza... python scripts/translate_book.py \
      --book-id 1342 --lang zh \
      --output translations_1342_zh.json --write-local

  # Seed prod from the exported JSON
  ADMIN_JWT=eyJ... python scripts/seed_translations.py \
      --file translations_1342_zh.json \
      --api-url https://api.book-reader.railway.app/api

### Flags

| Flag | Description |
|---|---|
| `--book-id` | — |
| `--lang` | Target language code (e.g. zh, en, de, fr) |
| `--model` | Gemini model ID (default: gemini-2.5-flash) |
| `--output` | Export translations to this JSON file (for prod seeding) |
| `--write-local` | Also insert rows into the local DB's translations table |
| `--skip-cached` | Skip chapters that already have a cached translation (default) |
| `--force` | Re-translate chapters that are already cached |
| `--allow-misaligned` | Save chapters even when paragraph counts don't match the source (default: skip mismatched chapters) |
| `--gemini-key` | Gemini API key (or set GEMINI_API_KEY env var) |

```bash
python -m scripts.translate_book
```

## `translation_alignment_detectors.py`

Per-source-language speaker-cue detectors for the translation alignment
checker (issue #1073, design doc `docs/design/translation-alignment-checker.md`).

Each detector is a pair of pure functions:

    is_cue(line: str) -> bool
        True iff the source-language line is a speaker cue (a stage-play line
        like "FAUST." in Goethe, "Le Roi." in classical French theatre).

    is_translated_cue(line: str, target_language: str) -> bool
        True iff the translated line preserves the speaker-cue typography
        for the given target language. Currently only zh is wired up
        (heuristic: ≤20 chars, ends with "。"), but the signature leaves
        room for future targets.

Detectors are looked up by source-language ISO code (`de`, `fr`, `en`, `ru`).
Languages without a registered detector fall through to `no_cue_detector`,
which makes the cue check a no-op (every line passes).

Adding a language: implement the two functions and register in DETECTORS.

```bash
python -m scripts.translation_alignment_detectors
```

## `translation_alignment_overrides.py`

Per-book overrides for the translation alignment checker (#1073).

The checker's verse-vs-prose classifier is heuristic. Some books legitimately
need explicit per-book pinning — Faust is verse-and-prose mixed, Moby Dick
has occasional inset hymns inside prose chapters, etc. This registry lets us
encode that knowledge as code without bloating the heuristic.

Books not in the registry fall through to the heuristic (zero-config for new
books).

Schema:
    OVERRIDES[book_id] = {
        'source_language': 'de' | 'fr' | 'en' | 'ru' | …,
        'verse_chapters': 'all' | list[int] | None,
            # 'all'   = every chapter is verse
            # [3, 8] = chapter indices 3 and 8 are verse, others heuristic
            # None  = pure heuristic (default)
        'verse_paragraph_indices': dict[int, list[int]] | None,
            # per-chapter verse paragraph index list. Wins over `verse_chapters`
            # for those chapters. e.g. {42: [3, 7]} means in chapter 42,
            # paragraphs 3 and 7 are verse, the rest is prose.
    }

Adding a book: append an entry. Keep entries minimal — only override what
the heuristic gets wrong.

```bash
python -m scripts.translation_alignment_overrides
```
