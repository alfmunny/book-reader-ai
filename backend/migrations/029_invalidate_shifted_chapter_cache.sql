-- Invalidate chapter-indexed cache rows for Faust (Gutenberg #2229) and
-- Der Prozess / Kafka (Gutenberg #69327) after PR #780 corrected the EPUB
-- splitter to drop the rogue chapter-0 frontmatter. All cached rows with
-- chapter_index >= 1 are now off by one and must be cleared so readers
-- see correct content on re-request.
--
-- Issue #783.

DELETE FROM translations
 WHERE book_id IN (2229, 69327)
   AND chapter_index >= 1;

DELETE FROM chapter_summaries
 WHERE book_id IN (2229, 69327)
   AND chapter_index >= 1;

DELETE FROM translation_queue
 WHERE book_id IN (2229, 69327)
   AND chapter_index >= 1;

DELETE FROM book_insights
 WHERE book_id IN (2229, 69327)
   AND chapter_index IS NOT NULL
   AND chapter_index >= 1;
