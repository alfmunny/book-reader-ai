-- Defensively clear any chapter_index = 0 cache rows for Faust (Gutenberg #2229)
-- and Der Prozess / Kafka (Gutenberg #69327).
--
-- Migration 029 cleared chapter_index >= 1 rows after PR #780 fixed the EPUB
-- splitter to drop the rogue frontmatter chapter. However, if any user translated
-- the old rogue chapter 0 (frontmatter/TOC page) before #780, that cached row
-- at chapter_index = 0 would now misalign with the new chapter 0 content.
-- This migration removes those potentially-stale rows as a defensive cleanup.
--
-- Issue #800.

DELETE FROM translations
 WHERE book_id IN (2229, 69327)
   AND chapter_index = 0;

DELETE FROM chapter_summaries
 WHERE book_id IN (2229, 69327)
   AND chapter_index = 0;

DELETE FROM translation_queue
 WHERE book_id IN (2229, 69327)
   AND chapter_index = 0;

DELETE FROM book_insights
 WHERE book_id IN (2229, 69327)
   AND chapter_index IS NOT NULL
   AND chapter_index = 0;
