-- Restore the capitals on German nouns saved before the casing fix (#2748/#2768).
--
-- Words were force-lowercased on save until #2766, so five saved nouns are
-- misspelled. This corrects them by name. Five hand-checked rows, not a rule.
--
-- Why not a script that re-asks the dictionary: Wiktionary answers for whatever
-- string you give it — `lookup("pracht")` returns the lemma `pracht`, and
-- `lookup("Pracht")` returns `Pracht`. It cannot tell you which is right, so a
-- re-ask corrects nothing (measured: 14 rows checked, 0 corrected).
--
-- The evidence is the book text. `word_occurrences.sentence_text` is stored
-- verbatim, and each of these appears mid-sentence — so the capital is lexical,
-- not a sentence-initial artefact:
--
--   Gesell     "Du überlustiger Gesell"                 (char 16)
--   Laffe      "als all die Laffen"                     (char 36, inflected)
--   Leichnam   "Für einem Leichnam"                     (char 10)
--   Pracht     "Dreht sich umher der Erde Pracht"       (char 26)
--   Schalk     "ist mir der Schalk"                     (char 12)
--
-- `verheeren` is deliberately NOT corrected, though it too appears capitalised
-- ("Da flammt ein blitzendes Verheeren", char 25). That is a nominalised verb:
-- the surface form takes a capital, the infinitive lemma stored here does not.
-- Text evidence alone would have got this one wrong, which is why these five
-- were confirmed by hand rather than by rule.
--
-- Scoped to language = 'de' so an identically-spelled word saved while reading
-- in another language is left alone. The NOT EXISTS guard keeps the migration
-- safe against migration 051's case-insensitive unique index: if a correctly
-- capitalised row already exists, the lowercase one is left as-is rather than
-- colliding. Re-running is a no-op — the WHERE clauses stop matching once the
-- corrections have landed.

UPDATE vocabulary SET word = 'Gesell',   lemma = 'Gesell'
 WHERE word = 'gesell'   AND language = 'de'
   AND NOT EXISTS (SELECT 1 FROM vocabulary v2
                    WHERE v2.user_id = vocabulary.user_id AND v2.word = 'Gesell');

UPDATE vocabulary SET word = 'Laffe',    lemma = 'Laffe'
 WHERE word = 'laffe'    AND language = 'de'
   AND NOT EXISTS (SELECT 1 FROM vocabulary v2
                    WHERE v2.user_id = vocabulary.user_id AND v2.word = 'Laffe');

UPDATE vocabulary SET word = 'Leichnam', lemma = 'Leichnam'
 WHERE word = 'leichnam' AND language = 'de'
   AND NOT EXISTS (SELECT 1 FROM vocabulary v2
                    WHERE v2.user_id = vocabulary.user_id AND v2.word = 'Leichnam');

UPDATE vocabulary SET word = 'Pracht',   lemma = 'Pracht'
 WHERE word = 'pracht'   AND language = 'de'
   AND NOT EXISTS (SELECT 1 FROM vocabulary v2
                    WHERE v2.user_id = vocabulary.user_id AND v2.word = 'Pracht');

UPDATE vocabulary SET word = 'Schalk',   lemma = 'Schalk'
 WHERE word = 'schalk'   AND language = 'de'
   AND NOT EXISTS (SELECT 1 FROM vocabulary v2
                    WHERE v2.user_id = vocabulary.user_id AND v2.word = 'Schalk');
