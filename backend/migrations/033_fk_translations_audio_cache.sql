-- Issue #754 / #842 / design doc: docs/design/declared-fks-schema.md
-- PR 3 of 4: declare REFERENCES books(id) ON DELETE CASCADE on
-- translations(book_id) and audio_cache(book_id). These are read-heavy
-- cache tables with the largest row counts in the series; isolating them
-- to their own migration keeps transaction lock time contained on
-- Railway's resource-constrained SQLite instance.
--
-- Same pattern as #851 (PR 1/4) and #858 (PR 2/4): orphan DELETE first
-- (mandatory per CLAUDE.md migration policy), then table rewrite, then
-- recreate indexes. Runner context: migrations run with
-- PRAGMA foreign_keys = OFF, so the INSERT … SELECT * step doesn't
-- trigger the new FKs.


-- ── Orphan cleanup (mandatory per policy) ────────────────────────────────

DELETE FROM translations WHERE book_id NOT IN (SELECT id FROM books);
DELETE FROM audio_cache  WHERE book_id NOT IN (SELECT id FROM books);


-- ── translations: rewrite with declared FK on book_id ────────────────────
-- Column order preserved so INSERT … SELECT * works:
--   book_id, chapter_index, target_language, paragraphs, created_at,
--   provider, model, title_translation
-- (provider/model added in 007, title_translation in 011.)
-- PRIMARY KEY (book_id, chapter_index, target_language) is inline and
-- preserved.

CREATE TABLE translations_new (
    book_id           INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index     INTEGER NOT NULL,
    target_language   TEXT    NOT NULL,
    paragraphs        TEXT    NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    provider          TEXT,
    model             TEXT,
    title_translation TEXT,
    PRIMARY KEY (book_id, chapter_index, target_language)
);

-- Explicit column list (not SELECT *) because bootstrap-created DBs created
-- by the legacy init_db() may lack the default `created_at` timestamp on
-- translations (some fake/test schemas omit it too). The explicit names let
-- the missing columns fall through to their DEFAULTs / NULL.
INSERT INTO translations_new
    (book_id, chapter_index, target_language, paragraphs,
     provider, model, title_translation)
SELECT book_id, chapter_index, target_language, paragraphs,
       provider, model, title_translation
FROM translations;

DROP TABLE translations;

ALTER TABLE translations_new RENAME TO translations;


-- ── audio_cache: rewrite with declared FK on book_id ─────────────────────
-- No ALTERs since 003, so the column order is exactly 003's:
--   book_id, chapter_index, chunk_index, provider, voice, content_type,
--   audio, created_at
-- PRIMARY KEY (book_id, chapter_index, chunk_index, provider, voice) is
-- inline and preserved.

CREATE TABLE audio_cache_new (
    book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index INTEGER NOT NULL,
    chunk_index   INTEGER NOT NULL DEFAULT 0,
    provider      TEXT    NOT NULL,
    voice         TEXT    NOT NULL,
    content_type  TEXT    NOT NULL,
    audio         BLOB    NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (book_id, chapter_index, chunk_index, provider, voice)
);

-- Explicit column list (same reasoning as above).
INSERT INTO audio_cache_new
    (book_id, chapter_index, chunk_index, provider, voice, content_type, audio)
SELECT book_id, chapter_index, chunk_index, provider, voice, content_type, audio
FROM audio_cache;

DROP TABLE audio_cache;

ALTER TABLE audio_cache_new RENAME TO audio_cache;
