-- Bulk translation job state for admin-initiated background translations.
-- Holds one row per run so admins can see history + resume interrupted jobs.

CREATE TABLE IF NOT EXISTS bulk_translation_jobs (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    status                 TEXT    NOT NULL DEFAULT 'pending',
    -- pending | running | paused | completed | failed | cancelled
    target_language        TEXT    NOT NULL,
    provider               TEXT    NOT NULL DEFAULT 'gemini',
    model                  TEXT,
    started_at             TIMESTAMP,
    ended_at               TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_chapters         INTEGER DEFAULT 0,
    completed_chapters     INTEGER DEFAULT 0,
    failed_chapters        INTEGER DEFAULT 0,
    skipped_chapters       INTEGER DEFAULT 0,
    requests_made          INTEGER DEFAULT 0,
    current_book_id        INTEGER,
    current_book_title     TEXT,
    current_chapter_index  INTEGER,
    last_error             TEXT,
    dry_run                INTEGER DEFAULT 0
);

-- Daily request counter, resets at UTC midnight. One row per (provider, date).
CREATE TABLE IF NOT EXISTS rate_limiter_usage (
    provider   TEXT NOT NULL,
    date       TEXT NOT NULL,   -- YYYY-MM-DD in UTC
    requests   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, date)
);
