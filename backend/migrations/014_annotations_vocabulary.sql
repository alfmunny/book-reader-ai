CREATE TABLE IF NOT EXISTS annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    sentence_text TEXT NOT NULL,
    note_text TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'yellow',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    word TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, word)
);

CREATE TABLE IF NOT EXISTS word_occurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vocabulary_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    sentence_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vocabulary_id) REFERENCES vocabulary(id) ON DELETE CASCADE
);

ALTER TABLE users ADD COLUMN github_token TEXT;
ALTER TABLE users ADD COLUMN obsidian_repo TEXT;
ALTER TABLE users ADD COLUMN obsidian_path TEXT DEFAULT 'All Notes/002 Literature Notes/000 Books';
