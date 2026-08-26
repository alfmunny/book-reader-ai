-- Persist an in-progress chapter-split audit across sessions.
--
-- A long book cannot be audited in one sitting, so the draft has to survive a
-- closed tab and a changed device. Until now the chapter editor held everything
-- in React state and `confirm` was all-or-nothing: closing the tab lost the work.
--
--   reviewed    per-chapter tick, so the auditor can resume where they stopped
--   updated_at  last edit, so the shelf can say "last opened 2 days ago" and
--               order the in-progress list by recency
--
-- Purely additive and nullable/defaulted, so no cleanup step is required by the
-- migration policy: existing draft rows read as unreviewed and never-edited.

ALTER TABLE user_book_chapters ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_book_chapters ADD COLUMN updated_at TIMESTAMP;

-- The in-progress list asks "which of my books still have draft chapters, and
-- when did I last touch them" on every bookshelf render.
CREATE INDEX IF NOT EXISTS ubc_draft_recent
    ON user_book_chapters(book_id, is_draft, updated_at);
