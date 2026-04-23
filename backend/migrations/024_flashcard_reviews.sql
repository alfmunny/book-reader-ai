-- Spaced repetition state for vocabulary flashcards (SM-2 algorithm).
-- One row per (user, vocabulary word). New words are seeded with due_date=today
-- by the GET /vocabulary/flashcards/due endpoint on first access.
CREATE TABLE IF NOT EXISTS flashcard_reviews (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vocabulary_id    INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
    interval_days    INTEGER NOT NULL DEFAULT 1,
    ease_factor      REAL    NOT NULL DEFAULT 2.5,
    repetitions      INTEGER NOT NULL DEFAULT 0,
    due_date         DATE    NOT NULL DEFAULT (date('now')),
    last_reviewed_at TIMESTAMP,
    UNIQUE(user_id, vocabulary_id)
);
CREATE INDEX IF NOT EXISTS flashcard_reviews_due ON flashcard_reviews(user_id, due_date);
