-- Remove duplicate insights rows (keep lowest rowid per unique key) before
-- creating the index so this migration cannot fail with IntegrityError on
-- databases that already have duplicate questions in the same chapter.
DELETE FROM book_insights
WHERE rowid NOT IN (
    SELECT MIN(rowid)
    FROM book_insights
    GROUP BY user_id, book_id, COALESCE(chapter_index, -1), question
);

-- Prevent duplicate insights for the same question in the same chapter
CREATE UNIQUE INDEX IF NOT EXISTS uq_book_insights_question
    ON book_insights (user_id, book_id, COALESCE(chapter_index, -1), question);
