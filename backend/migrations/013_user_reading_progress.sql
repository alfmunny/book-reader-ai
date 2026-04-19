CREATE TABLE IF NOT EXISTS user_reading_progress (
    user_id       INTEGER NOT NULL,
    book_id       INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL DEFAULT 0,
    last_read     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, book_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
