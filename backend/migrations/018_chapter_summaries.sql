-- Cached AI-generated chapter summaries.
-- Shared across all users: first reader to request a summary pays the Gemini cost,
-- subsequent requests return the cached result instantly.
CREATE TABLE IF NOT EXISTS chapter_summaries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id       INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    model         TEXT,
    content       TEXT    NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(book_id, chapter_index)
);
