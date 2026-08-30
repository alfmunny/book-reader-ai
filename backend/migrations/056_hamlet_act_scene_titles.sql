-- Name each of Hamlet's acts for the scene it actually contains (#2745).
--
-- Gutenberg #1524 sets an act heading and its first scene heading as
-- consecutive lines:
--
--     ACT II
--     SCENE I. A room in Polonius’s house.
--
-- The splitter cuts at the first of them, so the chapter holding Scene I was
-- titled only "ACT II". Because Scene I never began a chapter of its own, no
-- act's opening scene appeared anywhere in the Contents panel: a reader
-- scanning Hamlet's twenty rows saw every act jump straight from the act
-- heading to SCENE II. Five scenes, unreachable by name.
--
-- backend/scripts/chapter_split_overrides.py now declares these five retitles,
-- so a future freeze produces them. This migration applies the same correction
-- to the rows already in the database — the registry is consulted at freeze
-- time only, and re-running ingest is not something that survives the next
-- environment.
--
-- Retitle rather than re-cut. Splitting the act heading off would manufacture
-- five one-line chapters and shift every later index, moving the anchors of the
-- zh translation already recorded against chapter 0. Each new title takes the
-- scene's own location line verbatim from the chapter's own text.
--
-- Unlike `role` (migration 052), `title` sits INSIDE content_sha256, which
-- covers index, title and paragraphs. The frozen artifact was regenerated in
-- the same commit, so book_freeze is re-stamped below to the artifact's new
-- hash. Leaving the old hash would make every row disagree with its own
-- integrity stamp.
--
-- Each UPDATE is guarded on the exact current title. If the split has shifted
-- and these indices hold something else, the guards match nothing and the
-- migration changes nothing.

UPDATE book_chapters
   SET title = 'ACT I, SCENE I. Elsinore. A platform before the Castle.'
 WHERE book_id = 1524 AND chapter_index = 0 AND title = 'ACT I';

UPDATE book_chapters
   SET title = 'ACT II, SCENE I. A room in Polonius’s house.'
 WHERE book_id = 1524 AND chapter_index = 5 AND title = 'ACT II';

UPDATE book_chapters
   SET title = 'ACT III, SCENE I. A room in the Castle.'
 WHERE book_id = 1524 AND chapter_index = 7 AND title = 'ACT III';

UPDATE book_chapters
   SET title = 'ACT IV, SCENE I. A room in the Castle.'
 WHERE book_id = 1524 AND chapter_index = 11 AND title = 'ACT IV';

UPDATE book_chapters
   SET title = 'ACT V, SCENE I. A churchyard.'
 WHERE book_id = 1524 AND chapter_index = 18 AND title = 'ACT V';

-- Re-stamp only if all five landed. A partial match means the split is not the
-- one this migration was written against, and stamping the artifact's hash over
-- rows that don't match it would assert an integrity that isn't there.
UPDATE book_freeze
   SET content_sha256 = '26b228ab53ed94a54925886bbc95bb35197ad99904ceebc919e2e1770a1e1705',
       frozen_at      = '2026-08-30',
       audited_by     = 'uiux-agent (act/scene titling, #2745)'
 WHERE book_id = 1524
   AND (SELECT COUNT(*) FROM book_chapters
         WHERE book_id = 1524
           AND title IN ('ACT I, SCENE I. Elsinore. A platform before the Castle.',
                         'ACT II, SCENE I. A room in Polonius’s house.',
                         'ACT III, SCENE I. A room in the Castle.',
                         'ACT IV, SCENE I. A room in the Castle.',
                         'ACT V, SCENE I. A churchyard.')) = 5;
