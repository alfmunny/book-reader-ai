-- Follow graph (owner request 2026-08-27, phase 2 extension of #2752):
-- follow a reader and their stories appear in your Following timeline.
-- Additive table — no cleanup step required per migration policy.

CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, followee_id)
);

CREATE INDEX IF NOT EXISTS follows_by_follower ON follows(follower_id);
