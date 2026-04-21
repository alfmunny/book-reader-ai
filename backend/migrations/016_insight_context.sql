-- Store the passage/selected text that was used as context when the insight was generated
ALTER TABLE book_insights ADD COLUMN context_text TEXT;
