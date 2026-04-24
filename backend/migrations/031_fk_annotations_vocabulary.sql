-- Issue #754 / design doc: docs/design/declared-fks-schema.md
-- PR 1 of 4: declare REFERENCES … ON DELETE CASCADE on annotations and
-- vocabulary. Both tables had soft user_id / book_id columns (no FK clause),
-- so runtime FK enforcement (#751) never cascaded deletions for them — we
-- were carrying manual shadow cascades in delete_user and admin.delete_book
-- instead.
--
-- Per CLAUDE.md migration policy this runs unconditional orphan DELETEs
-- before the rewrite, even though #774 already cleaned these tables. If the
-- counts are zero the DELETEs are no-ops; if something slipped the net, we
-- still produce a consistent post-state for the new FKs to accept.
--
-- Runner context: migrations run with PRAGMA foreign_keys = OFF, so
--   - INSERT INTO …_new SELECT * FROM … does not validate FKs yet
--   - DROP TABLE does not cascade to children
--   - ALTER TABLE … RENAME updates FK clauses in other tables by name
--
-- Existing FKs that already point at vocabulary(id) keep working after the
-- drop+rename because references are resolved by parent table name:
--   word_occurrences, flashcard_reviews, vocabulary_tags, deck_members.


-- ── Orphan cleanup (mandatory per policy; near-zero today) ────────────────

DELETE FROM annotations WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM annotations WHERE book_id NOT IN (SELECT id FROM books);
DELETE FROM vocabulary  WHERE user_id NOT IN (SELECT id FROM users);


-- ── annotations: rewrite with declared FKs on user_id and book_id ─────────

CREATE TABLE annotations_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id        INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index  INTEGER NOT NULL,
    sentence_text  TEXT    NOT NULL,
    note_text      TEXT    NOT NULL DEFAULT '',
    color          TEXT    NOT NULL DEFAULT 'yellow',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO annotations_new SELECT * FROM annotations;

DROP TABLE annotations;

ALTER TABLE annotations_new RENAME TO annotations;

-- Recreate the UNIQUE index that migration 015 created on the original
-- annotations table — dropped along with the table and required by the
-- ON CONFLICT (user_id, book_id, chapter_index, sentence_text) upsert in
-- services/db.save_annotation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_annotations_sentence
    ON annotations (user_id, book_id, chapter_index, sentence_text);

-- Recreate the FTS5 triggers that migration 026 created on the original
-- annotations table. SQLite auto-drops triggers when their parent table is
-- dropped, so we must re-attach them to the new table. The annotations_fts
-- virtual table itself (content='annotations', content_rowid='id') survives
-- the drop + rename because it references the parent by name — its existing
-- rows still line up with the new table because INSERT … SELECT * preserves
-- ids.
CREATE TRIGGER annotations_ai AFTER INSERT ON annotations BEGIN
    INSERT INTO annotations_fts(rowid, sentence_text, note_text)
    VALUES (new.id, new.sentence_text, new.note_text);
END;
CREATE TRIGGER annotations_ad BEFORE DELETE ON annotations BEGIN
    INSERT INTO annotations_fts(annotations_fts, rowid, sentence_text, note_text)
    VALUES ('delete', old.id, old.sentence_text, old.note_text);
END;
CREATE TRIGGER annotations_au AFTER UPDATE ON annotations BEGIN
    INSERT INTO annotations_fts(annotations_fts, rowid, sentence_text, note_text)
    VALUES ('delete', old.id, old.sentence_text, old.note_text);
    INSERT INTO annotations_fts(rowid, sentence_text, note_text)
    VALUES (new.id, new.sentence_text, new.note_text);
END;


-- ── vocabulary: rewrite with declared FK on user_id ───────────────────────
-- Column order preserved so INSERT … SELECT * works:
--   id, user_id, word, created_at, lemma, language
-- (lemma and language were appended via migration 017.)

CREATE TABLE vocabulary_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word        TEXT    NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lemma       TEXT,
    language    TEXT,
    UNIQUE(user_id, word)
);

INSERT INTO vocabulary_new SELECT * FROM vocabulary;

DROP TABLE vocabulary;

ALTER TABLE vocabulary_new RENAME TO vocabulary;
