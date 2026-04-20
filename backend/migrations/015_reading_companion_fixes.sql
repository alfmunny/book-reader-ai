-- Prevent duplicate annotations for same sentence
CREATE UNIQUE INDEX IF NOT EXISTS uq_annotations_sentence
    ON annotations (user_id, book_id, chapter_index, sentence_text);

-- Prevent duplicate word occurrences for same sentence in same chapter
CREATE UNIQUE INDEX IF NOT EXISTS uq_word_occurrences
    ON word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text);

-- Book insights: saved Q&A from the AI reading companion
CREATE TABLE IF NOT EXISTS book_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    chapter_index INTEGER,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
