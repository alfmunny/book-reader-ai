-- Apply the declared front-matter labels to books already in the database (#2755).
--
-- Migration 050 added `book_chapters.role` and #2763 wired it end to end:
-- freeze_book.py writes the role into the artifact, ingest_book.py carries it
-- into the column, the chapters payload returns it, and the reader's Contents
-- panel groups on it. But `role` reaches the column only through ingest, so every
-- book ingested before #2763 still has NULL — and the Front matter group is
-- invisible for all of them. Dracula's title page still sits at position 1 of the
-- reading path.
--
-- Re-running ingest_book.py would fix it, which is exactly why this is a
-- migration instead: "remember to run the script" does not survive the next
-- environment.
--
-- The three chapters below are the full set declared in
-- backend/scripts/chapter_split_overrides.py. Nothing new is judged here — each
-- was audited per-book when it was declared, and the file records why. Two
-- deliberate non-entries are worth restating so nobody "helpfully" adds them:
--
--   * Moby Dick chapter 1 opens with a transcriber's line and then runs 93
--     paragraphs of the real Etymology and Extracts. It is the work.
--   * Dracula chapter 1 is Stoker's prefatory note, not apparatus.
--
-- Each UPDATE is guarded on the exact title. If a split shifted and index 0 is
-- now something else, the guard matches nothing and the migration labels nothing
-- — hiding a chapter of the work is far worse than showing a title page.
--
-- `role` sits outside `content_sha256`, so this moves no anchor and changes no
-- frozen artifact's identity. Nullable column, no constraint: no cleanup step is
-- required by the migration policy.

UPDATE book_chapters
   SET role = 'frontmatter'
 WHERE book_id = 345 AND chapter_index = 0 AND title = 'TITLE PAGE';

UPDATE book_chapters
   SET role = 'frontmatter'
 WHERE book_id = 2554 AND chapter_index = 0 AND title = 'Translated By Constance Garnett';

UPDATE book_chapters
   SET role = 'frontmatter'
 WHERE book_id = 2701 AND chapter_index = 0 AND title = 'MOBY-DICK; or, THE WHALE.';
