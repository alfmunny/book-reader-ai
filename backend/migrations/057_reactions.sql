-- Likes (track B, #2752). One table for every likeable thing — posts and
-- notes today, extensible by target_kind — mirroring the single-pipeline
-- discipline of stories and comments. The unique key makes a like
-- idempotent: liking twice is still one like.

CREATE TABLE IF NOT EXISTS reactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_kind TEXT    NOT NULL,          -- 'story' | 'comment'
    target_id   INTEGER NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, target_kind, target_id)
);

CREATE INDEX IF NOT EXISTS reactions_by_target ON reactions(target_kind, target_id);
