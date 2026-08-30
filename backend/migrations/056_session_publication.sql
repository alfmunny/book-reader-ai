-- Track B — whole-book publication (design: docs/design/user-translations.md
-- phase 2, issue #2752). A version reaches status='published' only through
-- the completeness gate: every paragraph of every chapter translated, so
-- visitors get a coherent full translation or nothing. published_at is
-- stamped at that moment. Additive column — no cleanup step required.

ALTER TABLE translation_sessions ADD COLUMN published_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS translation_sessions_published
    ON translation_sessions(book_id, status);
