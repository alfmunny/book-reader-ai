-- Label the remaining apparatus chapters (#2755).
--
-- Migration 052 labelled the three books declared at the time. #2755 asks for
-- every book that opens on apparatus rather than the work; these are the rest,
-- each audited per-book and declared in backend/scripts/chapter_split_overrides.py
-- with its reason.
--
-- Two are unambiguous:
--   * City of God #45304 chapter 0 is apparatus end to end — the T. & T. Clark
--     title page, a printed CONTENTS listing with page numbers, and Marcus
--     Dods' editor's preface. None of it is Augustine.
--   * Das Stunden-Buch #24288 chapter 0 is six lines of Insel-Verlag imprint.
--   * Crime and Punishment chapter 1 is Constance Garnett writing about
--     Dostoevsky. #2755 names a translator's note as apparatus explicitly.
--
-- Two are judgements, marked deliberately and recorded as such:
--   * The King in Yellow #8492 chapter 0 is a dedication page that also carries
--     Cassilda's Song, which is part of the work's fabric.
--   * Madame Bovary #14155 chapter 0 is a printed "Table des matières" plus
--     Flaubert's dedications to Senard and Bouilhet.
--
-- Both are marked because front matter is *collapsed, never deleted*: the
-- chapter keeps its index and every paragraph, and a reader who wants Cassilda's
-- Song or the dedication expands the group and finds it unchanged. That
-- reversibility is what makes the call defensible; deleting would not be.
--
-- Deliberately NOT marked, so nobody "helpfully" adds them later:
--   * Dorian Gray chapter 0 'THE PREFACE' is Wilde's own, and is the work.
--   * Dracula chapter 1 'PREFACE' is Stoker's prefatory note.
--   * The Great Gatsby chapter 0 is titled 'Table of Contents' but holds
--     Fitzgerald's epigraph; it was retitled to EPIGRAPH instead.
--   * Moby Dick chapter 1 runs 93 paragraphs of the real Etymology and Extracts.
--   * City of God chapter 1 continues the editor's preface under a fabricated
--     title. Its titles are a separate, larger defect (126 of 133 chapters), and
--     guessing where the preface ends is the inference the registry forbids.
--
-- `role` sits outside content_sha256, so no artifact's identity changes and no
-- re-stamp is needed — the regenerated artifacts in this commit carry the same
-- hashes they had before. Nullable column, no constraint: the migration policy
-- requires no cleanup step. Each UPDATE is guarded on the exact title, so a
-- shifted split labels nothing rather than hiding a chapter of the work.

UPDATE book_chapters SET role = 'frontmatter'
 WHERE book_id = 45304 AND chapter_index = 0 AND title = 'THE WORKS';

UPDATE book_chapters SET role = 'frontmatter'
 WHERE book_id = 24288 AND chapter_index = 0 AND title = 'Das Stunden-Buch';

UPDATE book_chapters SET role = 'frontmatter'
 WHERE book_id = 8492 AND chapter_index = 0 AND title = 'THE KING IN YELLOW';

UPDATE book_chapters SET role = 'frontmatter'
 WHERE book_id = 14155 AND chapter_index = 0 AND title = 'MADAME BOVARY';

UPDATE book_chapters SET role = 'frontmatter'
 WHERE book_id = 2554 AND chapter_index = 1 AND title = 'TRANSLATOR’S PREFACE';
