-- Group Crime and Punishment and Madame Bovary by part (#2745 Phase 2).
--
-- Part ranges come from backend/scripts/chapter_split_overrides.py; this applies
-- them to rows already in the database, which the registry cannot reach because
-- it is consulted at freeze time only.
--
-- Every guard pairs the chapter's index WITH its title. Matching on title alone
-- would be worthless here: Crime and Punishment opens all six parts on a chapter
-- titled "CHAPTER I", and after the retitles below Madame Bovary opens all three
-- on "I". One part would happily vouch for another's moved boundary.
--
-- No paragraph is added, removed or reordered.

-- ── Crime and Punishment: six parts, epilogue ungrouped ─────────────────────
-- The source sets PART I..PART VI as standalone headings, but the splitter cuts
-- at the CHAPTER I that follows each, so the part never reached a title and the
-- panel showed CHAPTER I six times with nothing to tell them apart.
--
-- No retitle and therefore no re-stamp: `part` sits outside content_sha256, and
-- this book's hash is unchanged by design. Chapters 0-1 (printed contents,
-- translator's preface) and 41 (epilogue) belong to no part.

UPDATE book_chapters SET part = 'PART I'
 WHERE book_id = 2554 AND chapter_index BETWEEN 2 AND 8
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 2554
                 AND chapter_index = 2 AND title = 'CHAPTER I');

UPDATE book_chapters SET part = 'PART II'
 WHERE book_id = 2554 AND chapter_index BETWEEN 9 AND 15
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 2554
                 AND chapter_index = 9 AND title = 'CHAPTER I');

UPDATE book_chapters SET part = 'PART III'
 WHERE book_id = 2554 AND chapter_index BETWEEN 16 AND 21
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 2554
                 AND chapter_index = 16 AND title = 'CHAPTER I');

UPDATE book_chapters SET part = 'PART IV'
 WHERE book_id = 2554 AND chapter_index BETWEEN 22 AND 27
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 2554
                 AND chapter_index = 22 AND title = 'CHAPTER I');

UPDATE book_chapters SET part = 'PART V'
 WHERE book_id = 2554 AND chapter_index BETWEEN 28 AND 32
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 2554
                 AND chapter_index = 28 AND title = 'CHAPTER I');

UPDATE book_chapters SET part = 'PART VI'
 WHERE book_id = 2554 AND chapter_index BETWEEN 33 AND 40
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 2554
                 AND chapter_index = 33 AND title = 'CHAPTER I');

-- ── Madame Bovary: the part heading had swallowed each part's Chapter I ─────
-- The same defect #2769 repaired in Hamlet. The source sets the part heading and
-- its first chapter numeral as consecutive lines, the splitter cut at the first,
-- and the panel's numbering jumped from the part name straight to II — Chapter I
-- unreachable by name in all three parts. Each of these chapters opens on a bare
-- "I" paragraph, which is the numeral restored here.

UPDATE book_chapters SET title = 'I'
 WHERE book_id = 14155 AND chapter_index = 1 AND title = 'PREMIÈRE PARTIE';

UPDATE book_chapters SET title = 'I'
 WHERE book_id = 14155 AND chapter_index = 10 AND title = 'DEUXIÈME PARTIE';

UPDATE book_chapters SET title = 'I'
 WHERE book_id = 14155 AND chapter_index = 25 AND title = 'TROISIÈME PARTIE';

UPDATE book_chapters SET part = 'PREMIÈRE PARTIE'
 WHERE book_id = 14155 AND chapter_index BETWEEN 1 AND 9
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 14155
                 AND chapter_index = 1 AND title = 'I');

UPDATE book_chapters SET part = 'DEUXIÈME PARTIE'
 WHERE book_id = 14155 AND chapter_index BETWEEN 10 AND 24
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 14155
                 AND chapter_index = 10 AND title = 'I');

UPDATE book_chapters SET part = 'TROISIÈME PARTIE'
 WHERE book_id = 14155 AND chapter_index BETWEEN 25 AND 35
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 14155
                 AND chapter_index = 25 AND title = 'I');

-- Bovary's titles changed, so its hash did. Re-stamp only if all three landed.
UPDATE book_freeze
   SET content_sha256 = 'b4f912aab9dbf1e2e78a9f02d967c16f31c8bae99e09beee1b2dacbd76bfef46',
       frozen_at      = '2026-08-30',
       audited_by     = 'uiux-agent (part grouping, #2745 Phase 2)'
 WHERE book_id = 14155
   AND (SELECT COUNT(*) FROM book_chapters
         WHERE book_id = 14155
           AND ((chapter_index = 1  AND title = 'I')
             OR (chapter_index = 10 AND title = 'I')
             OR (chapter_index = 25 AND title = 'I'))) = 3;
