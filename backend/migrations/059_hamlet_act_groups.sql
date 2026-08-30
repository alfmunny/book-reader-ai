-- Group Hamlet's scenes under their acts, and drop the now-duplicated prefix
-- from the five act chapters (#2745 Phase 2).
--
-- Migration 056 named each act chapter for the scene it contains, because the
-- panel was flat and the act had nowhere else to live:
--
--     ACT I, SCENE I. Elsinore. A platform before the Castle.
--
-- With grouping the act rides on the group header, so that row would read
-- "ACT I" twice. The leaf keeps the audited scene location — taken verbatim
-- from the chapter's own text in 056 — and drops the prefix.
--
-- Part ranges come from backend/scripts/chapter_split_overrides.py. Each range
-- is guarded on its first chapter's title, which is that registry's
-- `expect_first_title` expressed in SQL: if the split has moved, the range
-- labels nothing rather than grouping the wrong scenes.
--
-- `part` sits outside content_sha256, so the grouping alone would need no
-- re-stamp. The retitles do not: `title` is inside the hash. book_freeze is
-- therefore re-stamped to the regenerated artifact's value, and only when all
-- five retitles landed.
--
-- No paragraph is added, removed or reordered, so the zh translation anchored
-- to chapter 0 stays aligned.

-- ── Retitle: the act prefix moves to the group header ───────────────────────

UPDATE book_chapters SET title = 'SCENE I. Elsinore. A platform before the Castle.'
 WHERE book_id = 1524 AND chapter_index = 0
   AND title = 'ACT I, SCENE I. Elsinore. A platform before the Castle.';

UPDATE book_chapters SET title = 'SCENE I. A room in Polonius’s house.'
 WHERE book_id = 1524 AND chapter_index = 5
   AND title = 'ACT II, SCENE I. A room in Polonius’s house.';

UPDATE book_chapters SET title = 'SCENE I. A room in the Castle.'
 WHERE book_id = 1524 AND chapter_index = 7
   AND title = 'ACT III, SCENE I. A room in the Castle.';

UPDATE book_chapters SET title = 'SCENE I. A room in the Castle.'
 WHERE book_id = 1524 AND chapter_index = 11
   AND title = 'ACT IV, SCENE I. A room in the Castle.';

UPDATE book_chapters SET title = 'SCENE I. A churchyard.'
 WHERE book_id = 1524 AND chapter_index = 18
   AND title = 'ACT V, SCENE I. A churchyard.';

-- ── Group: five acts over twenty scenes ─────────────────────────────────────
-- Each guarded on the range's first chapter. Acts III and IV both open on
-- 'SCENE I. A room in the Castle.', so every guard pairs the title with its
-- index — matching on title alone would let one act vouch for the other.

UPDATE book_chapters SET part = 'ACT I'
 WHERE book_id = 1524 AND chapter_index BETWEEN 0 AND 4
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 1524 AND chapter_index = 0
                 AND title = 'SCENE I. Elsinore. A platform before the Castle.');

UPDATE book_chapters SET part = 'ACT II'
 WHERE book_id = 1524 AND chapter_index BETWEEN 5 AND 6
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 1524 AND chapter_index = 5
                 AND title = 'SCENE I. A room in Polonius’s house.');

UPDATE book_chapters SET part = 'ACT III'
 WHERE book_id = 1524 AND chapter_index BETWEEN 7 AND 10
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 1524 AND chapter_index = 7
                 AND title = 'SCENE I. A room in the Castle.');

UPDATE book_chapters SET part = 'ACT IV'
 WHERE book_id = 1524 AND chapter_index BETWEEN 11 AND 17
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 1524 AND chapter_index = 11
                 AND title = 'SCENE I. A room in the Castle.');

UPDATE book_chapters SET part = 'ACT V'
 WHERE book_id = 1524 AND chapter_index BETWEEN 18 AND 19
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 1524 AND chapter_index = 18
                 AND title = 'SCENE I. A churchyard.');

-- ── Re-stamp, only if every retitle landed ──────────────────────────────────

UPDATE book_freeze
   SET content_sha256 = 'a7007bc694082795f4805fd2510dadfaad37c6ada7273d376cfac43b5bb9954c',
       frozen_at      = '2026-08-30',
       audited_by     = 'uiux-agent (act grouping, #2745 Phase 2)'
 WHERE book_id = 1524
   AND (SELECT COUNT(*) FROM book_chapters
         WHERE book_id = 1524
           AND ((chapter_index = 0  AND title = 'SCENE I. Elsinore. A platform before the Castle.')
             OR (chapter_index = 5  AND title = 'SCENE I. A room in Polonius’s house.')
             OR (chapter_index = 7  AND title = 'SCENE I. A room in the Castle.')
             OR (chapter_index = 11 AND title = 'SCENE I. A room in the Castle.')
             OR (chapter_index = 18 AND title = 'SCENE I. A churchyard.'))) = 5;
