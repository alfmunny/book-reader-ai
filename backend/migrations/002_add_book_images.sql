-- Add images column to books table for Gutenberg illustration metadata.
-- Uses ALTER TABLE which is idempotent via IF NOT EXISTS on SQLite >= 3.35.

ALTER TABLE books ADD COLUMN images TEXT DEFAULT '[]';
