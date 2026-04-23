-- FTS5 full-text search indexes for user content (issue #592, design doc
-- docs/design/fts5-in-app-search.md). External content mode: the FTS5 virtual
-- tables store only the inverted index; the source tables remain authoritative.

-- ── annotations_fts ──────────────────────────────────────────────────────────
CREATE VIRTUAL TABLE IF NOT EXISTS annotations_fts USING fts5(
    sentence_text,
    note_text,
    content='annotations',
    content_rowid='id',
    tokenize='unicode61'
);

INSERT INTO annotations_fts(rowid, sentence_text, note_text)
SELECT id, sentence_text, note_text FROM annotations;

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

-- ── word_occurrences_fts ─────────────────────────────────────────────────────
CREATE VIRTUAL TABLE IF NOT EXISTS word_occurrences_fts USING fts5(
    sentence_text,
    content='word_occurrences',
    content_rowid='id',
    tokenize='unicode61'
);

INSERT INTO word_occurrences_fts(rowid, sentence_text)
SELECT id, sentence_text FROM word_occurrences;

CREATE TRIGGER word_occ_ai AFTER INSERT ON word_occurrences BEGIN
    INSERT INTO word_occurrences_fts(rowid, sentence_text)
    VALUES (new.id, new.sentence_text);
END;
CREATE TRIGGER word_occ_ad BEFORE DELETE ON word_occurrences BEGIN
    INSERT INTO word_occurrences_fts(word_occurrences_fts, rowid, sentence_text)
    VALUES ('delete', old.id, old.sentence_text);
END;
CREATE TRIGGER word_occ_au AFTER UPDATE ON word_occurrences BEGIN
    INSERT INTO word_occurrences_fts(word_occurrences_fts, rowid, sentence_text)
    VALUES ('delete', old.id, old.sentence_text);
    INSERT INTO word_occurrences_fts(rowid, sentence_text)
    VALUES (new.id, new.sentence_text);
END;

-- ── user_chapters_fts ────────────────────────────────────────────────────────
-- Depends on user_book_chapters (migration 025).
-- Draft rows (is_draft=1) must NOT appear in the index — both the triggers
-- and the search router filter is_draft=0 (belt-and-braces).
CREATE VIRTUAL TABLE IF NOT EXISTS user_chapters_fts USING fts5(
    title,
    text,
    content='user_book_chapters',
    content_rowid='id',
    tokenize='unicode61'
);

-- Only seed confirmed (non-draft) chapters.
INSERT INTO user_chapters_fts(rowid, title, text)
SELECT id, title, text FROM user_book_chapters WHERE is_draft = 0;

CREATE TRIGGER user_chapters_ai AFTER INSERT ON user_book_chapters
WHEN NEW.is_draft = 0
BEGIN
    INSERT INTO user_chapters_fts(rowid, title, text)
    VALUES (new.id, new.title, new.text);
END;

CREATE TRIGGER user_chapters_ad BEFORE DELETE ON user_book_chapters
WHEN OLD.is_draft = 0
BEGIN
    INSERT INTO user_chapters_fts(user_chapters_fts, rowid, title, text)
    VALUES ('delete', old.id, old.title, old.text);
END;

-- Two composed AU triggers cover all four draft/confirm transitions:
--   0→0 : delete old + insert new = re-index
--   0→1 : delete old only         = defensive un-confirm
--   1→0 : insert new only         = added on confirm
--   1→1 : neither                 = draft-only edit stays out
CREATE TRIGGER user_chapters_au_del AFTER UPDATE ON user_book_chapters
WHEN OLD.is_draft = 0
BEGIN
    INSERT INTO user_chapters_fts(user_chapters_fts, rowid, title, text)
    VALUES ('delete', old.id, old.title, old.text);
END;
CREATE TRIGGER user_chapters_au_ins AFTER UPDATE ON user_book_chapters
WHEN NEW.is_draft = 0
BEGIN
    INSERT INTO user_chapters_fts(rowid, title, text)
    VALUES (new.id, new.title, new.text);
END;
