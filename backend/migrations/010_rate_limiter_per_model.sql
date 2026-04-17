-- Per-model RPD counters so each model in a fallback chain has its own
-- daily budget. Pre-existing rows are migrated under model='' so callers
-- that don't specify a model (legacy bulk_translate, etc.) keep working.

CREATE TABLE IF NOT EXISTS rate_limiter_usage_new (
    provider  TEXT    NOT NULL,
    model     TEXT    NOT NULL DEFAULT '',
    date      TEXT    NOT NULL,
    requests  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, model, date)
);

INSERT INTO rate_limiter_usage_new (provider, model, date, requests)
SELECT provider, '', date, requests FROM rate_limiter_usage;

DROP TABLE rate_limiter_usage;

ALTER TABLE rate_limiter_usage_new RENAME TO rate_limiter_usage;
