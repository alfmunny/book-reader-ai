-- Per-user BYOK columns for additional AI providers, mirroring users.gemini_key.
-- Requested by the repo owner (2026-08-19): store Claude and DeepSeek keys from
-- the profile page; groundwork for provider selection in the insight chat.
-- Purely additive nullable columns — no constraint, so no data-cleanup step is
-- required by the migration policy. Keys are stored encrypted (same
-- encrypt_api_key path as gemini_key).

ALTER TABLE users ADD COLUMN claude_key TEXT;
ALTER TABLE users ADD COLUMN deepseek_key TEXT;
