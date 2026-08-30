-- A published translation deserves a blurb (owner, 2026-08-30, #2752): the
-- Community dialog shows who made a version and how, but not *why* — the
-- translator's own note about their approach. Additive nullable column, so
-- existing versions simply have no description; no cleanup step required.

ALTER TABLE translation_sessions ADD COLUMN description TEXT;
