-- Merge inflected vocabulary entries into their base form (#2663).
--
-- Entries used to be keyed on the surface form the reader clicked, with `lemma`
-- filled in afterwards by a best-effort background task. Saves now store the base
-- form directly, so this folds the historical inflected entries in: sightings of
-- "acknowledged", "acknowledging" and "acknowledge" become one entry.
--
-- Four tables cascade off vocabulary(id) — word_occurrences, flashcard_reviews,
-- vocabulary_tags and deck_members. Every one is repointed at the base entry
-- BEFORE the inflected entry is deleted; deleting first would cascade away the
-- user's spaced-repetition history, tags and deck membership.
--
-- Deliberately left untouched:
--   * lemma IS NULL — the base form cannot be resolved offline, and these
--     already display under their own word.
--   * chains (word→y where y is itself inflected) — the join below requires the
--     target to be a base entry, so a chain is skipped rather than merged into a
--     row that is about to be deleted.

-- 1. Ensure a base-form entry exists for every inflected one. created_at is
--    carried over so the word keeps its original "first saved" date.
INSERT OR IGNORE INTO vocabulary (user_id, word, lemma, language, created_at)
SELECT v.user_id, LOWER(TRIM(v.lemma)), LOWER(TRIM(v.lemma)), v.language, v.created_at
FROM vocabulary v
WHERE v.lemma IS NOT NULL
  AND TRIM(v.lemma) <> ''
  AND LOWER(TRIM(v.lemma)) <> LOWER(v.word);

-- 2. The merge set: inflected entry -> base entry. Materialised once so the
--    predicate cannot drift between the nine statements that follow, and so the
--    old->new mapping is stable while rows are being rewritten.
CREATE TEMP TABLE _base_form_merge AS
SELECT o.id AS old_id, b.id AS new_id
FROM vocabulary o
JOIN vocabulary b
  ON b.user_id = o.user_id
 AND b.word = LOWER(TRIM(o.lemma))
WHERE o.lemma IS NOT NULL
  AND TRIM(o.lemma) <> ''
  AND LOWER(TRIM(o.lemma)) <> LOWER(o.word)
  AND (b.lemma IS NULL OR TRIM(b.lemma) = '' OR LOWER(TRIM(b.lemma)) = LOWER(b.word));

-- 3. Keep the stronger spaced-repetition state. When both entries have review
--    history, the one with more repetitions wins: drop the base entry's row so
--    the inflected entry's row survives the move in step 4.
DELETE FROM flashcard_reviews
WHERE id IN (
    SELECT b.id
    FROM flashcard_reviews b
    JOIN _base_form_merge m ON m.new_id = b.vocabulary_id
    JOIN flashcard_reviews o ON o.vocabulary_id = m.old_id
    WHERE o.repetitions > b.repetitions
);

-- 4. Repoint every child at the base entry. OR IGNORE skips what the base entry
--    already has (same occurrence, same tag, same deck, a review row kept by
--    step 3); those leftovers are removed in step 5.
UPDATE OR IGNORE word_occurrences
SET vocabulary_id = (SELECT m.new_id FROM _base_form_merge m WHERE m.old_id = word_occurrences.vocabulary_id)
WHERE vocabulary_id IN (SELECT old_id FROM _base_form_merge);

UPDATE OR IGNORE flashcard_reviews
SET vocabulary_id = (SELECT m.new_id FROM _base_form_merge m WHERE m.old_id = flashcard_reviews.vocabulary_id)
WHERE vocabulary_id IN (SELECT old_id FROM _base_form_merge);

UPDATE OR IGNORE vocabulary_tags
SET vocabulary_id = (SELECT m.new_id FROM _base_form_merge m WHERE m.old_id = vocabulary_tags.vocabulary_id)
WHERE vocabulary_id IN (SELECT old_id FROM _base_form_merge);

UPDATE OR IGNORE deck_members
SET vocabulary_id = (SELECT m.new_id FROM _base_form_merge m WHERE m.old_id = deck_members.vocabulary_id)
WHERE vocabulary_id IN (SELECT old_id FROM _base_form_merge);

-- 5. Discard the duplicates that could not move, then the emptied inflected
--    entries. Explicit child deletes rather than relying on ON DELETE CASCADE,
--    which is a no-op when PRAGMA foreign_keys is off.
DELETE FROM word_occurrences WHERE vocabulary_id IN (SELECT old_id FROM _base_form_merge);
DELETE FROM flashcard_reviews WHERE vocabulary_id IN (SELECT old_id FROM _base_form_merge);
DELETE FROM vocabulary_tags  WHERE vocabulary_id IN (SELECT old_id FROM _base_form_merge);
DELETE FROM deck_members     WHERE vocabulary_id IN (SELECT old_id FROM _base_form_merge);
DELETE FROM vocabulary       WHERE id IN (SELECT old_id FROM _base_form_merge);

DROP TABLE _base_form_merge;
