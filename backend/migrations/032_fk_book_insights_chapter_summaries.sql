-- Issue #754 / #841 / design doc: docs/design/declared-fks-schema.md
-- PR 2 of 4: declare REFERENCES … ON DELETE CASCADE on book_insights
-- (user_id, book_id) and chapter_summaries (book_id). These are AI-derived
-- per-chapter cache tables that had soft parent references — runtime FK
-- enforcement (#751) could not cascade their rows, so services/db.delete_user
-- and admin.delete_book had to clean them manually.
--
-- Same pattern as #851 (PR 1/4): orphan DELETE first (mandatory per
-- CLAUDE.md migration policy), then table rewrite, then recreate indexes.
-- Runner context: migrations run with PRAGMA foreign_keys = OFF, so the
-- INSERT … SELECT * step doesn't trigger the new FKs.


-- ── Orphan cleanup (mandatory per policy; near-zero today) ────────────────

DELETE FROM book_insights     WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM book_insights     WHERE book_id NOT IN (SELECT id FROM books);
DELETE FROM chapter_summaries WHERE book_id NOT IN (SELECT id FROM books);


-- ── book_insights: rewrite with declared FKs on user_id and book_id ──────
-- Column order preserved so INSERT … SELECT * works:
--   id, user_id, book_id, chapter_index, question, answer, created_at, context_text
-- (context_text was appended via migration 016.)

CREATE TABLE book_insights_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id        INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index  INTEGER,
    question       TEXT    NOT NULL,
    answer         TEXT    NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    context_text   TEXT
);

INSERT INTO book_insights_new SELECT * FROM book_insights;

DROP TABLE book_insights;

ALTER TABLE book_insights_new RENAME TO book_insights;

-- Recreate the UNIQUE expression index that migration 022 added — dropped
-- alongside the table. The COALESCE handles the book-level case where
-- chapter_index is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_book_insights_question
    ON book_insights (user_id, book_id, COALESCE(chapter_index, -1), question);


-- ── chapter_summaries: rewrite with declared FK on book_id ───────────────
-- No ALTERs since 020, so the column order is simply what 020 defines:
--   id, book_id, chapter_index, model, content, created_at
-- UNIQUE(book_id, chapter_index) is inline (table constraint) and preserved.

CREATE TABLE chapter_summaries_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id        INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index  INTEGER NOT NULL,
    model          TEXT,
    content        TEXT    NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(book_id, chapter_index)
);

INSERT INTO chapter_summaries_new SELECT * FROM chapter_summaries;

DROP TABLE chapter_summaries;

ALTER TABLE chapter_summaries_new RENAME TO chapter_summaries;
