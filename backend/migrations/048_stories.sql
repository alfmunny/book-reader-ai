-- Stories: the generic share pipeline (design: docs/design/user-translations.md
-- phase 2, user-approved; issue #2752). ONE table carries every share kind —
-- translated paragraph ranges and annotation notes today, extensible via
-- `kind` without new infrastructure. A story snapshots nothing: it references
-- the live session paragraphs / annotation, so an author improving their
-- rendering improves the story. Additive tables — no cleanup step required
-- per migration policy.

CREATE TABLE IF NOT EXISTS stories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            TEXT    NOT NULL,                  -- 'translation' | 'note' (extensible)
    book_id         INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index   INTEGER NOT NULL,
    -- kind='translation': paragraph range within the session
    session_id      INTEGER REFERENCES translation_sessions(id) ON DELETE CASCADE,
    paragraph_start INTEGER,
    paragraph_end   INTEGER,                           -- inclusive; == start for one paragraph
    -- kind='note': the shared annotation (anchor = its sentence_text)
    annotation_id   INTEGER REFERENCES annotations(id) ON DELETE CASCADE,
    caption         TEXT,                              -- the author's words on the share
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS stories_by_book_chapter
    ON stories(book_id, chapter_index);

-- Comments anchor to a story (track A) or, later, to a published session's
-- paragraph (track B) — hence the nullable anchor columns, per the design.
CREATE TABLE IF NOT EXISTS story_comments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id        INTEGER REFERENCES stories(id) ON DELETE CASCADE,
    session_id      INTEGER REFERENCES translation_sessions(id) ON DELETE CASCADE,
    chapter_index   INTEGER,
    paragraph_index INTEGER,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT    NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS story_comments_by_story
    ON story_comments(story_id);
