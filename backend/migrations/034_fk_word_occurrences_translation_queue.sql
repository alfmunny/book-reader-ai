-- Issue #754 / #843 / design doc: docs/design/declared-fks-schema.md
-- PR 4 of 4 (final): declare REFERENCES books(id) ON DELETE CASCADE on
-- word_occurrences(book_id) and translation_queue(book_id). Closes out
-- the declared-FK hardening series started in #700.
--
-- word_occurrences already has a declared FK on vocabulary_id (migration 014);
-- we preserve that and add the books FK alongside.
--
-- translation_queue.queued_by is free-form TEXT (admin email or NULL,
-- migration 009) — not a user_id reference — so no users FK is needed.
--
-- Same pattern as #851 / #858 / #975: orphan DELETE first (mandatory
-- per CLAUDE.md migration policy), then table rewrite, then recreate
-- indexes. Runner context: PRAGMA foreign_keys = OFF during migrations,
-- so the INSERT … SELECT step doesn't trigger the new FKs.


-- ── Orphan cleanup (mandatory per policy) ────────────────────────────────

DELETE FROM word_occurrences  WHERE book_id NOT IN (SELECT id FROM books);
DELETE FROM translation_queue WHERE book_id NOT IN (SELECT id FROM books);


-- ── word_occurrences: rewrite with declared FKs on vocabulary_id + book_id
-- Column order preserved so INSERT … SELECT works:
--   id, vocabulary_id, book_id, chapter_index, sentence_text, created_at
-- (No ALTERs since 014.)

CREATE TABLE word_occurrences_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    vocabulary_id  INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
    book_id        INTEGER NOT NULL REFERENCES books(id)      ON DELETE CASCADE,
    chapter_index  INTEGER NOT NULL,
    sentence_text  TEXT    NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Explicit column list (not SELECT *) for the same reason as migration 033:
-- bootstrap-created DBs may lack `created_at` on legacy schemas; the
-- explicit list lets the DEFAULT apply.
INSERT INTO word_occurrences_new
    (id, vocabulary_id, book_id, chapter_index, sentence_text, created_at)
SELECT id, vocabulary_id, book_id, chapter_index, sentence_text, created_at
FROM word_occurrences;

DROP TABLE word_occurrences;

ALTER TABLE word_occurrences_new RENAME TO word_occurrences;

-- Recreate the UNIQUE index from migration 015, dropped with the table.
CREATE UNIQUE INDEX IF NOT EXISTS uq_word_occurrences
    ON word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text);

-- FTS5 content triggers from migration 026 were dropped along with the old
-- word_occurrences table — SQLite ties triggers to their source table and
-- DROP TABLE removes them. Recreate so the word_occurrences_fts external
-- content index stays synchronised with INSERT/UPDATE/DELETE on the
-- renamed table, and rebuild the inverted index so already-saved
-- occurrences stay searchable after the rewrite.
DROP TRIGGER IF EXISTS word_occ_ai;
DROP TRIGGER IF EXISTS word_occ_ad;
DROP TRIGGER IF EXISTS word_occ_au;

CREATE TRIGGER word_occ_ai AFTER INSERT ON word_occurrences BEGIN
    INSERT INTO word_occurrences_fts(rowid, sentence_text)
    VALUES (new.id, new.sentence_text);
END;
CREATE TRIGGER word_occ_ad BEFORE DELETE ON word_occurrences BEGIN
    INSERT INTO word_occurrences_fts(word_occurrences_fts, rowid, sentence_text)
    VALUES ('delete', old.id, old.sentence_text);
END;
CREATE TRIGGER word_occ_au AFTER UPDATE ON word_occurrences BEGIN
    INSERT INTO word_occurrences_fts(word_occurrences_fts, rowid, sentence_text)
    VALUES ('delete', old.id, old.sentence_text);
    INSERT INTO word_occurrences_fts(rowid, sentence_text)
    VALUES (new.id, new.sentence_text);
END;

-- Rebuild the inverted index from current rows. (The index holds entries
-- for the OLD rowids from before the rewrite.)
INSERT INTO word_occurrences_fts(word_occurrences_fts) VALUES ('rebuild');


-- ── translation_queue: rewrite with declared FK on book_id ───────────────
-- Column order after migration 009 (queued_by appended):
--   id, book_id, chapter_index, target_language, status, priority,
--   attempts, last_error, created_at, updated_at, queued_by
-- UNIQUE (book_id, chapter_index, target_language) is inline and preserved.

CREATE TABLE translation_queue_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id           INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index     INTEGER NOT NULL,
    target_language   TEXT    NOT NULL,
    status            TEXT    NOT NULL DEFAULT 'pending',
    priority          INTEGER NOT NULL DEFAULT 100,
    attempts          INTEGER NOT NULL DEFAULT 0,
    last_error        TEXT,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    queued_by         TEXT,
    UNIQUE (book_id, chapter_index, target_language)
);

INSERT INTO translation_queue_new
    (id, book_id, chapter_index, target_language, status, priority,
     attempts, last_error, created_at, updated_at, queued_by)
SELECT id, book_id, chapter_index, target_language, status, priority,
       attempts, last_error, created_at, updated_at, queued_by
FROM translation_queue;

DROP TABLE translation_queue;

ALTER TABLE translation_queue_new RENAME TO translation_queue;

-- Recreate the index helpers from migration 008, dropped with the table.
CREATE INDEX IF NOT EXISTS idx_queue_status_priority
    ON translation_queue(status, priority, id);

CREATE INDEX IF NOT EXISTS idx_queue_book
    ON translation_queue(book_id, target_language);
