ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free';
UPDATE users SET plan = 'paid' WHERE role = 'admin';
