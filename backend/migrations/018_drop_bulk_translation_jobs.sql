-- Bulk translate system was removed in PR #257 (2026-04-22).
-- Drop the orphaned table so existing installs are cleaned up.
DROP TABLE IF EXISTS bulk_translation_jobs;
