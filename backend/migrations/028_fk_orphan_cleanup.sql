-- Clean up rows that violate declared FK constraints BEFORE PRAGMA
-- foreign_keys = ON starts firing on every connection. Runs once. After
-- this, the engine prevents new orphans from ever being written.
--
-- Issue #700 / #748 / design doc docs/design/fk-enforcement.md.
--
-- Migration 028 is applied with FK enforcement OFF (the migration runner
-- explicitly toggles PRAGMA foreign_keys), so these DELETEs don't re-trigger
-- the very constraints we're enabling.

-- flashcard_reviews.vocabulary_id / user_id
DELETE FROM flashcard_reviews
 WHERE vocabulary_id NOT IN (SELECT id FROM vocabulary);

DELETE FROM flashcard_reviews
 WHERE user_id NOT IN (SELECT id FROM users);

-- word_occurrences.vocabulary_id
DELETE FROM word_occurrences
 WHERE vocabulary_id NOT IN (SELECT id FROM vocabulary);

-- user_reading_progress.{user_id, book_id}
DELETE FROM user_reading_progress
 WHERE user_id NOT IN (SELECT id FROM users);

DELETE FROM user_reading_progress
 WHERE book_id NOT IN (SELECT id FROM books);

-- reading_history.user_id (book_id has no declared FK)
DELETE FROM reading_history
 WHERE user_id NOT IN (SELECT id FROM users);

-- book_uploads.{user_id, book_id}
DELETE FROM book_uploads
 WHERE user_id NOT IN (SELECT id FROM users);

DELETE FROM book_uploads
 WHERE book_id NOT IN (SELECT id FROM books);

-- book_epubs.book_id
DELETE FROM book_epubs
 WHERE book_id NOT IN (SELECT id FROM books);

-- user_book_chapters.book_id
DELETE FROM user_book_chapters
 WHERE book_id NOT IN (SELECT id FROM books);

-- books.owner_user_id is NULLable — clear, don't delete the book row.
UPDATE books
   SET owner_user_id = NULL
 WHERE owner_user_id IS NOT NULL
   AND owner_user_id NOT IN (SELECT id FROM users);
