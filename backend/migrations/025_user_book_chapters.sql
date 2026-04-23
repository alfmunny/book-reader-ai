-- Dedicated table for uploaded-book chapter content. Replaces the previous
-- JSON-in-books.text encoding (issue #357, design doc docs/design/user-book-chapters.md).
--
-- Ops step: after this migration applies, run
--   python -m backend.scripts.migrate_upload_chapters
-- once to copy existing JSON content into this table, then
--   python -m backend.scripts.migrate_upload_chapters --finalize
-- once the new router code is deployed and stable to clear books.text.

CREATE TABLE IF NOT EXISTS user_book_chapters (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index INTEGER NOT NULL,
    title         TEXT    NOT NULL DEFAULT '',
    text          TEXT    NOT NULL DEFAULT '',
    is_draft      INTEGER NOT NULL DEFAULT 1,
    UNIQUE(book_id, chapter_index)
);

CREATE INDEX IF NOT EXISTS ubc_book_draft ON user_book_chapters(book_id, is_draft);
