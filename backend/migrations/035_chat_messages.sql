-- Issue #907 / design doc: docs/design/insightchat-history-persistence.md
-- Persist InsightChat conversation history on the backend so threads
-- carry across browsers / devices / cache clears. See the design for
-- the "why a separate table vs reusing book_insights" decision.
--
-- Declared FKs from day one per the #754 policy: ON DELETE CASCADE
-- means delete_user and admin.delete_book need no shadow-cleanup.

CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    role       TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT    NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Primary read pattern is "all messages for (user, book) ordered by time",
-- reverse-paginated via `before_id`. This composite index covers it.
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_book
    ON chat_messages (user_id, book_id, created_at);
