-- One vocabulary entry per word regardless of casing (#2748).
--
-- Words used to be force-lowercased on save, so `UNIQUE(user_id, word)` was
-- enough: `Pracht` could never reach the table. Now the canonical form is
-- stored — German nouns are capitalised, and `pracht` is a misspelling, not a
-- variant — so that constraint would happily accept `Pracht` and `pracht` as
-- two separate entries.
--
-- Case folding here is SQLite's LOWER(), which is ASCII-only. That covers the
-- case this is about: German nouns differ from their misspelling in the first
-- letter, and initial letters are ASCII for every word in the corpus. A word
-- beginning with an umlaut (Ärger/ärger) would still slip through — noted
-- rather than solved, because fixing it needs ICU and there is no such word to
-- fix today.
--
-- Cleanup first, per the migration policy: a UNIQUE index cannot be created
-- over existing duplicates. Nothing in the live database violates it (all 12
-- rows are lowercase, a legacy of the bug), but a database that has already
-- served a mixed-case save must not be bricked by this migration.
--
-- Keeping the lowest rowid keeps the earliest save, which is the one whose id
-- other tables reference: word_occurrences, flashcard_reviews, vocabulary_tags
-- and deck_members all cascade off vocabulary(id). Deleting the newer twin
-- discards at most a duplicate occurrence.

DELETE FROM vocabulary
 WHERE rowid NOT IN (
   SELECT MIN(rowid) FROM vocabulary GROUP BY user_id, LOWER(word)
 );

CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_user_word_nocase
    ON vocabulary(user_id, LOWER(word));
