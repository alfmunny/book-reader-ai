-- Issue #1790 / design doc: docs/design/pricing-plans.md
-- PR A of the pricing-plans series. Audit log for every Stripe webhook
-- we receive. The UNIQUE constraint on stripe_event_id makes the
-- webhook handler trivially idempotent: Stripe redelivers events on
-- transient failures, and an INSERT collision tells us "already
-- processed, skip". Forensics value is the second use case — payload_json
-- preserves the full Stripe event for incident review.
--
-- ON DELETE SET NULL on user_id rather than CASCADE: the audit log
-- should outlive the user account (legally / forensically useful), but
-- without violating FK constraints when a user is deleted.
--
-- This table is empty until PR C adds the /billing/webhook handler.

CREATE TABLE IF NOT EXISTS billing_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    stripe_event_id TEXT    NOT NULL UNIQUE,
    event_type      TEXT    NOT NULL,
    payload_json    TEXT    NOT NULL,
    received_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS billing_events_user
    ON billing_events(user_id, received_at);
