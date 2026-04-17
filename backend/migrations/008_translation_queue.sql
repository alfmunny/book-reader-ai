-- Always-on translation queue.
--
-- Each row represents "translate book B chapter C into target language L".
-- The queue worker pulls pending rows in priority order and processes them,
-- re-using the same per-batch translator the bulk job uses. Unlike a one-shot
-- bulk job, the queue is permanent — newly-saved books are auto-enqueued and
-- the worker just keeps draining.

CREATE TABLE IF NOT EXISTS translation_queue (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id           INTEGER NOT NULL,
    chapter_index     INTEGER NOT NULL,
    target_language   TEXT    NOT NULL,
    status            TEXT    NOT NULL DEFAULT 'pending',
    -- pending | running | done | failed | skipped
    priority          INTEGER NOT NULL DEFAULT 100,
    -- lower = sooner. auto-enqueued items default to 100
    attempts          INTEGER NOT NULL DEFAULT 0,
    last_error        TEXT,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (book_id, chapter_index, target_language)
);

CREATE INDEX IF NOT EXISTS idx_queue_status_priority
    ON translation_queue(status, priority, id);

CREATE INDEX IF NOT EXISTS idx_queue_book
    ON translation_queue(book_id, target_language);

-- Generic key/value config for the admin panel. First user is the
-- list of languages to auto-enqueue when a new book is saved.
CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
