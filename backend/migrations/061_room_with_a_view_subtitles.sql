-- Restore A Room with a View's chapter subtitles and group it by part (#2745).
--
-- Forster subtitles every chapter and the printed contents lists them, but the
-- splitter kept only the numeral: twenty rows reading "Chapter I" … "Chapter
-- XX", saying nothing about the book. Titles here are the contents listing's
-- own punctuated form.
--
-- Title-only, deliberately. Every subtitle also survives as the chapter's first
-- paragraph, which makes moving it into the title look like the obvious change
-- — and it would corrupt the book's one translation. Chapter 19 carries a zh
-- translation of 57 paragraphs whose first is the translated heading paragraph.
-- Translations align by paragraph position, so dropping English paragraph 0
-- would leave 56 against 57 and render every later paragraph against the wrong
-- source. Nothing here touches a paragraph.
--
-- Part Two's titles were composed as "PART TWO — Chapter VIII"; the prefix moves
-- into the group header and the leaf keeps the chapter.
--
-- Each retitle is guarded on the exact current title, and each part range on its
-- first chapter's new title. Unlike Hamlet and C&P, no two chapters here share a
-- title, but the guards still pair index with title for consistency.

-- ── Subtitles restored; the PART TWO prefix drops ───────────────────────────

UPDATE book_chapters SET title = 'Chapter I. The Bertolini'
 WHERE book_id = 2641 AND chapter_index = 0 AND title = 'Chapter I';

UPDATE book_chapters SET title = 'Chapter II. In Santa Croce with No Baedeker'
 WHERE book_id = 2641 AND chapter_index = 1 AND title = 'Chapter II';

UPDATE book_chapters SET title = 'Chapter III. Music, Violets, and the Letter “S”'
 WHERE book_id = 2641 AND chapter_index = 2 AND title = 'Chapter III';

UPDATE book_chapters SET title = 'Chapter IV. Fourth Chapter'
 WHERE book_id = 2641 AND chapter_index = 3 AND title = 'Chapter IV';

UPDATE book_chapters SET title = 'Chapter V. Possibilities of a Pleasant Outing'
 WHERE book_id = 2641 AND chapter_index = 4 AND title = 'Chapter V';

UPDATE book_chapters SET title = 'Chapter VI. The Reverend Arthur Beebe, the Reverend Cuthbert Eager, Mr. Emerson, Mr. George Emerson, Miss Eleanor Lavish, Miss Charlotte Bartlett, and Miss Lucy Honeychurch Drive Out in Carriages to See a View; Italians Drive Them'
 WHERE book_id = 2641 AND chapter_index = 5 AND title = 'Chapter VI';

UPDATE book_chapters SET title = 'Chapter VII. They Return'
 WHERE book_id = 2641 AND chapter_index = 6 AND title = 'Chapter VII';

UPDATE book_chapters SET title = 'Chapter VIII. Medieval'
 WHERE book_id = 2641 AND chapter_index = 7 AND title = 'PART TWO — Chapter VIII';

UPDATE book_chapters SET title = 'Chapter IX. Lucy As a Work of Art'
 WHERE book_id = 2641 AND chapter_index = 8 AND title = 'PART TWO — Chapter IX';

UPDATE book_chapters SET title = 'Chapter X. Cecil as a Humourist'
 WHERE book_id = 2641 AND chapter_index = 9 AND title = 'PART TWO — Chapter X';

UPDATE book_chapters SET title = 'Chapter XI. In Mrs. Vyse’s Well-Appointed Flat'
 WHERE book_id = 2641 AND chapter_index = 10 AND title = 'PART TWO — Chapter XI';

UPDATE book_chapters SET title = 'Chapter XII. Twelfth Chapter'
 WHERE book_id = 2641 AND chapter_index = 11 AND title = 'PART TWO — Chapter XII';

UPDATE book_chapters SET title = 'Chapter XIII. How Miss Bartlett’s Boiler Was So Tiresome'
 WHERE book_id = 2641 AND chapter_index = 12 AND title = 'PART TWO — Chapter XIII';

UPDATE book_chapters SET title = 'Chapter XIV. How Lucy Faced the External Situation Bravely'
 WHERE book_id = 2641 AND chapter_index = 13 AND title = 'PART TWO — Chapter XIV';

UPDATE book_chapters SET title = 'Chapter XV. The Disaster Within'
 WHERE book_id = 2641 AND chapter_index = 14 AND title = 'PART TWO — Chapter XV';

UPDATE book_chapters SET title = 'Chapter XVI. Lying to George'
 WHERE book_id = 2641 AND chapter_index = 15 AND title = 'PART TWO — Chapter XVI';

UPDATE book_chapters SET title = 'Chapter XVII. Lying to Cecil'
 WHERE book_id = 2641 AND chapter_index = 16 AND title = 'PART TWO — Chapter XVII';

UPDATE book_chapters SET title = 'Chapter XVIII. Lying to Mr. Beebe, Mrs. Honeychurch, Freddy, and The Servants'
 WHERE book_id = 2641 AND chapter_index = 17 AND title = 'PART TWO — Chapter XVIII';

UPDATE book_chapters SET title = 'Chapter XIX. Lying to Mr. Emerson'
 WHERE book_id = 2641 AND chapter_index = 18 AND title = 'PART TWO — Chapter XIX';

UPDATE book_chapters SET title = 'Chapter XX. The End of the Middle Ages'
 WHERE book_id = 2641 AND chapter_index = 19 AND title = 'PART TWO — Chapter XX';


-- ── Two parts ──────────────────────────────────────────────────────────────

UPDATE book_chapters SET part = 'PART ONE'
 WHERE book_id = 2641 AND chapter_index BETWEEN 0 AND 6
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 2641
                 AND chapter_index = 0 AND title = 'Chapter I. The Bertolini');

UPDATE book_chapters SET part = 'PART TWO'
 WHERE book_id = 2641 AND chapter_index BETWEEN 7 AND 19
   AND EXISTS (SELECT 1 FROM book_chapters WHERE book_id = 2641
                 AND chapter_index = 7 AND title = 'Chapter VIII. Medieval');


-- ── Re-stamp, only if all twenty landed ────────────────────────────────────

UPDATE book_freeze
   SET content_sha256 = '877acea56f5833116f44b5ebb9ad12f4e3acf4ac0c72453710205d9c87e24303',
       frozen_at      = '2026-08-30',
       audited_by     = 'uiux-agent (part grouping + subtitles, #2745 Phase 2)'
 WHERE book_id = 2641
   AND (SELECT COUNT(*) FROM book_chapters
         WHERE book_id = 2641
           AND (
                (chapter_index =  0 AND title = 'Chapter I. The Bertolini')
             OR (chapter_index =  1 AND title = 'Chapter II. In Santa Croce with No Baedeker')
             OR (chapter_index =  2 AND title = 'Chapter III. Music, Violets, and the Letter “S”')
             OR (chapter_index =  3 AND title = 'Chapter IV. Fourth Chapter')
             OR (chapter_index =  4 AND title = 'Chapter V. Possibilities of a Pleasant Outing')
             OR (chapter_index =  5 AND title = 'Chapter VI. The Reverend Arthur Beebe, the Reverend Cuthbert Eager, Mr. Emerson, Mr. George Emerson, Miss Eleanor Lavish, Miss Charlotte Bartlett, and Miss Lucy Honeychurch Drive Out in Carriages to See a View; Italians Drive Them')
             OR (chapter_index =  6 AND title = 'Chapter VII. They Return')
             OR (chapter_index =  7 AND title = 'Chapter VIII. Medieval')
             OR (chapter_index =  8 AND title = 'Chapter IX. Lucy As a Work of Art')
             OR (chapter_index =  9 AND title = 'Chapter X. Cecil as a Humourist')
             OR (chapter_index = 10 AND title = 'Chapter XI. In Mrs. Vyse’s Well-Appointed Flat')
             OR (chapter_index = 11 AND title = 'Chapter XII. Twelfth Chapter')
             OR (chapter_index = 12 AND title = 'Chapter XIII. How Miss Bartlett’s Boiler Was So Tiresome')
             OR (chapter_index = 13 AND title = 'Chapter XIV. How Lucy Faced the External Situation Bravely')
             OR (chapter_index = 14 AND title = 'Chapter XV. The Disaster Within')
             OR (chapter_index = 15 AND title = 'Chapter XVI. Lying to George')
             OR (chapter_index = 16 AND title = 'Chapter XVII. Lying to Cecil')
             OR (chapter_index = 17 AND title = 'Chapter XVIII. Lying to Mr. Beebe, Mrs. Honeychurch, Freddy, and The Servants')
             OR (chapter_index = 18 AND title = 'Chapter XIX. Lying to Mr. Emerson')
             OR (chapter_index = 19 AND title = 'Chapter XX. The End of the Middle Ages')
           )) = 20;
