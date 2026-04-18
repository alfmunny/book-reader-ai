-- Translate chapter titles too, so the reader can show e.g. "第一章"
-- in place of "CHAPTER I." when translation mode is on. Nullable so
-- pre-existing rows stay valid.
ALTER TABLE translations ADD COLUMN title_translation TEXT;
