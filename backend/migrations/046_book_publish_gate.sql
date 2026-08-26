-- Separate "the split is fixed" from "this is in the library".
--
-- `book_freeze` conflated two decisions of very different kinds. Freezing is a
-- technical commitment — the chapter split is fixed so annotations can anchor to
-- it — and it is irreversible in practice, because unfreezing breaks the notes
-- readers have already anchored. Publishing is an editorial commitment, it is
-- outward-facing, and it is reversible: unpublishing only hides a book from the
-- catalog, leaving the freeze (and every annotation) untouched.
--
-- An architect session should keep making the first call on its own. The second
-- one now waits for a human, because it is the irreversible-and-outward one.
--
--   published_at  NULL = frozen but not listed; set = visible in the catalog
--
-- CLEANUP STEP (required — this migration would otherwise empty the library):
-- every book frozen before this migration is already visible to readers, so it
-- backfills as published at its freeze time. Only freezes written after this
-- point start life unpublished.

ALTER TABLE book_freeze ADD COLUMN published_at TEXT;

UPDATE book_freeze SET published_at = frozen_at WHERE published_at IS NULL;

-- The catalog filters on this on every home-page render.
CREATE INDEX IF NOT EXISTS book_freeze_published ON book_freeze(published_at);
