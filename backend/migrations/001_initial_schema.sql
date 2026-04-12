-- Initial schema: books cache, users, translations, audiobooks.
-- This captures the state of the database as of the first commit.

CREATE TABLE IF NOT EXISTS books (
    id             INTEGER PRIMARY KEY,
    title          TEXT,
    authors        TEXT,
    languages      TEXT,
    subjects       TEXT,
    download_count INTEGER DEFAULT 0,
    cover          TEXT,
    text           TEXT,
    cached_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id  TEXT UNIQUE NOT NULL,
    email      TEXT,
    name       TEXT,
    picture    TEXT,
    gemini_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS translations (
    book_id        INTEGER NOT NULL,
    chapter_index  INTEGER NOT NULL,
    target_language TEXT NOT NULL,
    paragraphs     TEXT NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (book_id, chapter_index, target_language)
);

CREATE TABLE IF NOT EXISTS audiobooks (
    book_id      INTEGER PRIMARY KEY,
    librivox_id  TEXT NOT NULL,
    title        TEXT,
    authors      TEXT,
    url_librivox TEXT,
    url_rss      TEXT,
    sections     TEXT,
    saved_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
