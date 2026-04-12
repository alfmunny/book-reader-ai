-- Add role (admin/user) and approved (0/1) columns to users table.
-- The first user who signs up is automatically admin + approved.
-- All subsequent users start as role='user', approved=0 (pending).

ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN approved INTEGER DEFAULT 0;

-- Auto-approve any existing users (they were using the app before
-- this feature existed, so they're implicitly trusted). The first
-- one becomes admin.
UPDATE users SET approved = 1;
UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users);
