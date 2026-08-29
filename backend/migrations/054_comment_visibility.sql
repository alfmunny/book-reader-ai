-- Per-note visibility (owner, 2026-08-30, #2752): a note on a translation
-- can be kept to yourself. Existing notes were written under public-only
-- semantics, so the default preserves their meaning — additive column, no
-- cleanup step required per migration policy.

ALTER TABLE story_comments ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';
