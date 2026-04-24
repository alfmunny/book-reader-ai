# Scripts reference

Operational CLI tools that live under `backend/scripts/`. Every script is a standalone Python module run via `python -m scripts.<name>` from the `backend/` directory.

!!! note "Auto-generation coming in PR B"

    This page is **hand-curated** in PR A (#864). **[PR B](../architecture/design-index.md)** replaces it with content auto-generated from each script's module docstring + argparse parser.

    Until then, expect this list to occasionally fall out of sync with the actual scripts folder — `ls backend/scripts/` is the source of truth.

## EPUB split quality audit — `epub_split_audit.py`

Diagnoses EPUB splitter regressions by comparing the character count, paragraph count, and structural signals between the EPUB path and the plain-text path for every book with a stored EPUB.

Flags three signal classes (exits `1` if any fires — safe for CI gating):

- **Char ratio** < threshold (default 0.5) — content-drop regressions (#758, #767).
- **Paragraph ratio** < threshold (default 0.8) — paragraph-count drops.
- **Structural speaker-cue collapse** — the #820 Faust pattern.

```bash
cd backend
DB_PATH=./books.db python -m scripts.epub_split_audit
DB_PATH=./books.db python -m scripts.epub_split_audit --book-id 2229
DB_PATH=./books.db python -m scripts.epub_split_audit --csv /tmp/audit.csv
```

See also: [EPUB audit reports](reports.md).

## EPUB backfill — `backfill_epubs.py`

Iterates Gutenberg books without a row in `book_epubs` and fetches the no-images EPUB via `services.gutenberg.get_book_epub`. Throttled (1.5 s default) to be polite to Project Gutenberg.

```bash
cd backend
DB_PATH=./books.db python -m scripts.backfill_epubs            # all missing
DB_PATH=./books.db python -m scripts.backfill_epubs --limit 20 # cap
DB_PATH=./books.db python -m scripts.backfill_epubs --dry-run  # log only
```

## Pre-translation — `preseed_translations.py`

Translates a specific `(book, chapter, language)` set ahead of time so users hitting those chapters get cached results. Typically kicked off by admins after an import; the always-on translation queue handles the steady state.

## Per-book translation — `translate_book.py`

Translates an entire book one chapter at a time. Use for small books; for larger books prefer the queue.

## Next untranslated chapter — `next_untranslated_chapter.py`

Reports the next chapter without a cached translation for a given `(book, language)`. Useful for scripting "translate up to chapter N" workflows.

## Book seeding — `seed_books.py`, `seed_translations.py`

Bulk-imports a list of Gutenberg books + translations for demo / benchmark environments. Not intended for production.

## Upload-chapter migration — `migrate_upload_chapters.py`

One-off script that moved existing uploaded-book chapters from the inline `books.text` column into the dedicated `user_book_chapters` table (migration 025, issue #357).

## Admin JWT generator — `gen_admin_jwt.py`

Prints a JWT for the admin user — handy for curl-based admin API exploration without logging in through the OAuth flow. Requires `JWT_SECRET` in your env.

## Docs site generator — `generate_docs.py` (coming in PR B)

Pre-build step that produces auto-generated doc pages (Scripts reference, Reports index, Design-doc index, Migration index, Daily journal stubs) before `mkdocs build` runs. See [docs site design doc](../design/docs-site.md).
