-- Record the exact form met in the text ("verhöhnt") alongside the base-form
-- vocabulary entry ("verhöhnen") — a two-way form↔lemma mapping: the reader
-- underlines saved words deterministically by surface form (no stemming
-- needed for new saves, including ablaut forms like sah→sehen), and the
-- vocabulary page groups all forms under their base. NULL for occurrences
-- saved before this migration; the reader keeps a stem-matching fallback
-- for those, and a re-save of the same sentence backfills the value.
-- Additive column, no constraint — no data cleanup required.
ALTER TABLE word_occurrences ADD COLUMN surface_form TEXT;
