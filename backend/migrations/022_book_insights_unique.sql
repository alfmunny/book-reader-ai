-- Prevent duplicate insights for the same question in the same chapter
CREATE UNIQUE INDEX IF NOT EXISTS uq_book_insights_question
    ON book_insights (user_id, book_id, COALESCE(chapter_index, -1), question);
