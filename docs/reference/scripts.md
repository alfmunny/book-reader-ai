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
| `--chunk` | Upload in chunks of N entries per request (default 50). Keeps request bodies under proxy limits for big books. |

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
