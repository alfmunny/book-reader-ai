-- Stores the downloaded EPUB binary for each Gutenberg book.
-- Used by split_with_html_preference as the primary chapter source
-- (preferred over on-demand HTML fetch and plain-text regex splitting).
-- Populated at book-add time for new books; backfill script available
-- for books already in the DB.
CREATE TABLE IF NOT EXISTS book_epubs (
    book_id    INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    epub_url   TEXT    NOT NULL DEFAULT '',
    epub_bytes BLOB    NOT NULL,
    cached_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
