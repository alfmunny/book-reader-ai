-- Comment threads, one level deeper (owner design, 2026-08-30, #2752):
-- every displayed translation paragraph is a comment anchor — including
-- EDITORIAL paragraphs, which have no story/session row — and comments can
-- carry replies (the comment's own discussion thread).
-- Additive nullable columns — no cleanup step required per migration policy.

ALTER TABLE story_comments ADD COLUMN parent_comment_id INTEGER REFERENCES story_comments(id) ON DELETE CASCADE;
ALTER TABLE story_comments ADD COLUMN book_id INTEGER REFERENCES books(id) ON DELETE CASCADE;
ALTER TABLE story_comments ADD COLUMN target_language TEXT;

CREATE INDEX IF NOT EXISTS story_comments_editorial
    ON story_comments(book_id, target_language, chapter_index, paragraph_index);
