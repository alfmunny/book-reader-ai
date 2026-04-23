-- Vocabulary tags & custom study decks (issue #645 / design doc:
-- docs/design/vocab-tags-decks.md). Additive: no existing rows touched.

-- Free-text tags attached to vocabulary rows. user_id denormalized so the
-- "all my tags" list (frontend autocomplete) is a single indexed read.
CREATE TABLE IF NOT EXISTS vocabulary_tags (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
    tag           TEXT    NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, vocabulary_id, tag)
);
CREATE INDEX IF NOT EXISTS vocab_tags_by_tag ON vocabulary_tags(user_id, tag);
CREATE INDEX IF NOT EXISTS vocab_tags_by_vocab ON vocabulary_tags(vocabulary_id);

-- User-owned study decks. Two modes:
--   * manual — members listed in deck_members
--   * smart  — members resolved at query time from rules_json
CREATE TABLE IF NOT EXISTS decks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    mode        TEXT    NOT NULL CHECK (mode IN ('manual', 'smart')),
    rules_json  TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS deck_members (
    deck_id       INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
    added_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (deck_id, vocabulary_id)
);
CREATE INDEX IF NOT EXISTS deck_members_by_vocab ON deck_members(vocabulary_id);
