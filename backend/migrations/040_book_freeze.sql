-- Issue #2624 / design doc: docs/design/local-first-content.md
-- PR 1 of the fossilized-content slice-1 series. Chapter boundaries are
-- currently recomputed at request time while translations and annotations
-- are durably keyed to chapter_index — splitter drift silently misaligns
-- them (Faust #2229; migrations 029/030 are the scar tissue).
--
-- book_freeze: one row per fossilized book. The row's existence IS the
-- frozen flag; content_sha256 is the integrity hash over the artifact's
-- chapters array, verified on every ingest so hand-edits to a frozen
-- split fail loudly. chapter_source preserves what get_chapter_source
-- reported at freeze time ("epub" | "text") so the reader badge is
-- unchanged for frozen books.
--
-- book_chapters: the stored serving text per chapter, populated from the
-- committed artifact by scripts/ingest_book.py. Distinct from
-- user_book_chapters on purpose: that table is upload-flow-specific
-- (drafts, FTS triggers) and scheduled for deletion in slice 5.
--
-- Both tables are content tables — 100% derived from data/books/*.json,
-- wiped and rebuilt freely, never holding user data. Additive migration:
-- new tables only, no cleanup step required.

CREATE TABLE IF NOT EXISTS book_freeze (
    book_id        INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    splitter       TEXT NOT NULL,
    chapter_source TEXT NOT NULL,
    frozen_at      TEXT NOT NULL,
    audited_by     TEXT NOT NULL,
    content_sha256 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS book_chapters (
    book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index INTEGER NOT NULL,
    title         TEXT NOT NULL DEFAULT '',
    text          TEXT NOT NULL,
    PRIMARY KEY (book_id, chapter_index)
);
