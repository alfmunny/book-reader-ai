<!-- THIS PAGE IS AUTO-GENERATED. Edit the source script or report, not this file. Re-run `python -m scripts.generate_docs` after changes. -->


# Design docs index

Every significant architectural change in Book Reader AI lands as a merged design doc under `docs/design/`. Auto-generated list below.

| Design doc | Status | Summary |
|---|---|---|
| [Design: Accelerate CI pipeline — Issue #885](../design/ci-speedup.md) | Draft — awaiting PM review, then user approval | Every PR sits in `BLOCKED` for 5–8 minutes while four heavy CI jobs run: Frontend Jest (+ `next build`), Frontend E2E (Playwright), Backend pytest, Verify Docker build. A workflow-/docs-only PR like #… |
| [Design: Declared FKs on Soft `user_id` / `book_id` Columns (Issue #754)](../design/declared-fks-schema.md) | Draft — awaiting PM review | PR #751 (closes #700) enabled `PRAGMA foreign_keys = ON` on every backend connection. From that moment on, every *declared* `ON DELETE CASCADE` started firing automatically and we were able to retire … |
| [Design: GitHub Pages Documentation Site (MkDocs + Material) — Issue #864](../design/docs-site.md) | Draft — awaiting PM review, then user approval | Our docs live in three disconnected places: `docs/design/*.md`, `docs/FEATURES.md` + scattered top-level files, and the development journal smeared across `product/review-state.md`, `CLAUDE.md`, and c… |
| [Design: EPUB speaker-cue / verse paragraph collapse fix — Issue #888](../design/epub-speaker-cue-fix.md) | Draft — awaiting PM review, then user approval | The post-backfill audit flagged 17 books where the EPUB path produces paragraphs that pack multiple speaker turns (or verse lines) into a single visual block. Faust (#820) was the canonical case; 16 m… |
| [Design: Enable `PRAGMA foreign_keys` per connection (Issue #700)](../design/fk-enforcement.md) | Draft — awaiting PM review | SQLite's `PRAGMA foreign_keys` defaults to **OFF** and must be set **per connection**. Our `aiosqlite.connect(...)` monkey-patch in `services/db.py` only sets `timeout=30`; it never turns FK enforceme… |
| [Design: In-App Full-Text Search via FTS5 (Issue #592)](../design/fts5-in-app-search.md) | PM approved 2026-04-23 ✅ — revised per review notes | The app's only search is `GET /api/books/search`, which calls the external Gutendex API to search the Gutenberg catalog by title/author metadata. There is no way to search within the user's own conten… |
| [Design: user_book_chapters Table (Issue #357)](../design/user-book-chapters.md) | PM approved 2026-04-23 ✅ — revised to resolve migration-runner question | Uploaded book chapters are stored as a JSON blob inside `books.text`: |
| [Design: Vocabulary Tags & Custom Study Decks (Issue #645)](../design/vocab-tags-decks.md) | Awaiting PM approval | Users save hundreds of vocabulary words across books and languages, but the app provides no way to organize those words. Today: |
