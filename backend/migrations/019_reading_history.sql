-- Append-only log of chapter navigation events.
-- One row per chapter visited. Used to compute reading streak and activity heatmap.
-- The existing user_reading_progress table only keeps the latest chapter per book.
-- This table preserves the full timeline for analytics.
CREATE TABLE IF NOT EXISTS reading_history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id       INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    read_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS reading_history_user_date ON reading_history(user_id, read_at);
