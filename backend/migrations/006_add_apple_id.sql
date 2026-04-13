-- Add Apple OAuth support: users can sign in via Apple in addition to Google and GitHub.
ALTER TABLE users ADD COLUMN apple_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL;
