-- Notes anchor to the whole paragraph, so a note carries the passage its
-- author had selected (owner, 2026-08-30, #2752) — readers can tell which
-- sentence is being discussed. Additive nullable column, no cleanup needed.

ALTER TABLE story_comments ADD COLUMN quote TEXT;
