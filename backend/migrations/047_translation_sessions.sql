-- Per-user translation sessions (design: docs/design/user-translations.md,
-- user-approved 2026-08-26; issue #2734, impl tracker #2740).
--
-- The unit of work is a NAMED, BOOK-SCOPED session: the user starts
-- translating a book under a name they choose ("诗意版"), all work lands in
-- that session across chapters, and they switch or create sessions freely.
-- Paragraph rows (not one JSON blob) make partial coverage and mixed
-- provider provenance first-class. Additive tables, no constraint on
-- existing data — no cleanup step required per migration policy.

CREATE TABLE IF NOT EXISTS translation_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id         INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    name            TEXT    NOT NULL,
    target_language TEXT    NOT NULL,
    style_prompt    TEXT,
    provider        TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'private',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, book_id, name)
);

CREATE TABLE IF NOT EXISTS translation_session_paragraphs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES translation_sessions(id) ON DELETE CASCADE,
    chapter_index   INTEGER NOT NULL,
    paragraph_index INTEGER NOT NULL,
    text            TEXT    NOT NULL,
    provider        TEXT    NOT NULL,
    model           TEXT    NOT NULL,
    edited_by_user  INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, chapter_index, paragraph_index)
);

CREATE INDEX IF NOT EXISTS ts_paragraphs_by_chapter
    ON translation_session_paragraphs(session_id, chapter_index, paragraph_index);
