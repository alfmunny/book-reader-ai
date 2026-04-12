-- Per-chunk TTS audio cache. One row per text chunk, keyed by
-- (book, chapter, chunk_index, provider, voice) so different voices
-- and providers cache independently.

CREATE TABLE IF NOT EXISTS audio_cache (
    book_id       INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    chunk_index   INTEGER NOT NULL DEFAULT 0,
    provider      TEXT NOT NULL,
    voice         TEXT NOT NULL,
    content_type  TEXT NOT NULL,
    audio         BLOB NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (book_id, chapter_index, chunk_index, provider, voice)
);
