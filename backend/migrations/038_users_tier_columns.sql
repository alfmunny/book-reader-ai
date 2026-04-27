-- Issue #1790 / design doc: docs/design/pricing-plans.md
-- PR A of the pricing-plans series. Adds the per-user tier columns
-- driving every translation-creation gate. No data movement: existing
-- rows backfill to 'free' via the column DEFAULT, which is exactly the
-- right entitlement for any user who hasn't gone through Stripe checkout.
--
-- The Stripe-related columns are added in this same migration even
-- though Stripe code lands in PR C — the columns are inert until then,
-- and one schema migration is cheaper than two for the rollout window.

ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'pro', 'premium'));
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN tier_period_end TIMESTAMP;
