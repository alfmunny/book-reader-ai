"""PR C2 of the pricing-plans series (#1790).

Stripe webhook handler tests. Mocks `stripe.Webhook.construct_event`
so we don't need a real Stripe signing secret — the unit under test is
the post-verification logic (idempotent insert + tier-state transitions),
not Stripe's signature crypto.
"""

import json
import pytest
import aiosqlite
from unittest.mock import patch
import services.db as db_module
from services import stripe_billing


# Test setup: by default each test enables a STRIPE_WEBHOOK_SECRET so
# construct_event can run the env-required path. Tests that need a
# specific event payload patch construct_event directly to bypass real
# signature verification.
@pytest.fixture(autouse=True)
def _stripe_env(monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setenv("STRIPE_API_KEY", "sk_test_dummy")
    monkeypatch.setenv("STRIPE_PRICE_PRO", "price_pro_test")
    monkeypatch.setenv("STRIPE_PRICE_PREMIUM", "price_premium_test")


async def _set_customer(user_id: int, customer_id: str) -> None:
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET stripe_customer_id = ? WHERE id = ?",
            (customer_id, user_id),
        )
        await conn.commit()


async def _get_user(user_id: int) -> dict:
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        row = await (await conn.execute(
            "SELECT tier, stripe_customer_id, stripe_subscription_id, tier_period_end FROM users WHERE id = ?",
            (user_id,),
        )).fetchone()
    return dict(row) if row else {}


# ── Helpers to build mock events ──────────────────────────────────────

def _checkout_completed(event_id: str, customer_id: str, subscription_id: str, price_id: str, *, client_ref: str | None = None) -> dict:
    return {
        "id": event_id,
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "customer": customer_id,
                "subscription": subscription_id,
                "client_reference_id": client_ref,
                "line_items": {
                    "data": [{"price": {"id": price_id}}],
                },
            }
        },
    }


def _subscription_updated(event_id: str, customer_id: str, subscription_id: str, price_id: str, period_end_unix: int) -> dict:
    return {
        "id": event_id,
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": subscription_id,
                "customer": customer_id,
                "current_period_end": period_end_unix,
                "items": {"data": [{"price": {"id": price_id}}]},
            }
        },
    }


def _subscription_deleted(event_id: str, customer_id: str, subscription_id: str) -> dict:
    return {
        "id": event_id,
        "type": "customer.subscription.deleted",
        "data": {"object": {"id": subscription_id, "customer": customer_id}},
    }


# ── construct_event signature verification ────────────────────────────

def test_construct_event_missing_secret_raises_500(monkeypatch):
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        stripe_billing.construct_event(b"{}", "sig")
    assert exc.value.status_code == 500


def test_construct_event_bad_signature_raises_400():
    """Real signature verification fails on a bogus signature header."""
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        stripe_billing.construct_event(b"{}", "bogus_sig")
    assert exc.value.status_code == 400


# ── record_and_handle: idempotency ────────────────────────────────────

@pytest.mark.asyncio
async def test_replay_returns_duplicate(test_user):
    """Same event_id submitted twice → second call returns 'duplicate'."""
    event = _checkout_completed("evt_replay_1", "cus_test_1", "sub_test_1", "price_pro_test", client_ref=str(test_user["id"]))
    first = await stripe_billing.record_and_handle(event)
    assert first["status"] == "processed"
    second = await stripe_billing.record_and_handle(event)
    assert second["status"] == "duplicate"


@pytest.mark.asyncio
async def test_unhandled_event_type_returns_ignored(test_user):
    """Event type we don't subscribe to → status 'ignored', no error."""
    event = {
        "id": "evt_unhandled_1",
        "type": "customer.tax_id.created",  # not in our handlers
        "data": {"object": {"customer": "cus_xxx"}},
    }
    result = await stripe_billing.record_and_handle(event)
    assert result["status"] == "ignored"


# ── checkout.session.completed handler ────────────────────────────────

@pytest.mark.asyncio
async def test_checkout_completed_promotes_to_pro_via_client_reference(test_user):
    """First-time customer: client_reference_id → user_id, tier = pro per price match."""
    event = _checkout_completed(
        "evt_checkout_1", "cus_new_1", "sub_new_1", "price_pro_test",
        client_ref=str(test_user["id"]),
    )
    await stripe_billing.record_and_handle(event)
    user = await _get_user(test_user["id"])
    assert user["tier"] == "pro"
    assert user["stripe_customer_id"] == "cus_new_1"
    assert user["stripe_subscription_id"] == "sub_new_1"


@pytest.mark.asyncio
async def test_checkout_completed_promotes_to_premium(test_user):
    event = _checkout_completed(
        "evt_checkout_premium", "cus_p", "sub_p", "price_premium_test",
        client_ref=str(test_user["id"]),
    )
    await stripe_billing.record_and_handle(event)
    user = await _get_user(test_user["id"])
    assert user["tier"] == "premium"


@pytest.mark.asyncio
async def test_checkout_completed_unknown_price_defaults_to_free(test_user):
    """Unknown price ID → handler defaults to 'free' (defensive)."""
    event = _checkout_completed(
        "evt_unknown_price", "cus_u", "sub_u", "price_unknown",
        client_ref=str(test_user["id"]),
    )
    await stripe_billing.record_and_handle(event)
    user = await _get_user(test_user["id"])
    assert user["tier"] == "free"


@pytest.mark.asyncio
async def test_checkout_no_customer_or_ref_logs_and_returns(test_user):
    """No customer + no client_reference_id → can't resolve user; logged but no error."""
    event = _checkout_completed("evt_orphan", customer_id=None, subscription_id="sub_x", price_id="price_pro_test")
    result = await stripe_billing.record_and_handle(event)
    # Insert succeeded; handler logged warning; no DB changes.
    assert result["status"] == "processed"


# ── customer.subscription.updated handler ─────────────────────────────

@pytest.mark.asyncio
async def test_subscription_updated_sets_period_end(test_user):
    await _set_customer(test_user["id"], "cus_existing_1")
    period_end = 1735689600  # 2025-01-01 00:00:00 UTC
    event = _subscription_updated("evt_sub_upd_1", "cus_existing_1", "sub_x", "price_pro_test", period_end)
    await stripe_billing.record_and_handle(event)
    user = await _get_user(test_user["id"])
    assert user["tier"] == "pro"
    assert user["stripe_subscription_id"] == "sub_x"
    assert user["tier_period_end"] == "2025-01-01 00:00:00"


@pytest.mark.asyncio
async def test_subscription_updated_changes_tier(test_user):
    """Pro → Premium upgrade reflected in tier column."""
    await _set_customer(test_user["id"], "cus_upgrade_1")
    # Pre-existing pro state.
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute("UPDATE users SET tier = 'pro' WHERE id = ?", (test_user["id"],))
        await conn.commit()
    event = _subscription_updated("evt_upgrade", "cus_upgrade_1", "sub_y", "price_premium_test", 1735689600)
    await stripe_billing.record_and_handle(event)
    user = await _get_user(test_user["id"])
    assert user["tier"] == "premium"


# ── customer.subscription.deleted handler ─────────────────────────────

@pytest.mark.asyncio
async def test_subscription_deleted_does_not_immediately_downgrade(test_user):
    """User paid through period_end; we just clear stripe_subscription_id."""
    await _set_customer(test_user["id"], "cus_canc_1")
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET tier = 'pro', stripe_subscription_id = ?, tier_period_end = ? WHERE id = ?",
            ("sub_canc", "2026-12-31 23:59:59", test_user["id"]),
        )
        await conn.commit()
    event = _subscription_deleted("evt_del_1", "cus_canc_1", "sub_canc")
    await stripe_billing.record_and_handle(event)
    user = await _get_user(test_user["id"])
    # Tier stays at pro until the daily cron (PR D) sees period_end < now.
    assert user["tier"] == "pro"
    assert user["stripe_subscription_id"] is None
    assert user["tier_period_end"] == "2026-12-31 23:59:59"


# ── invoice.payment_failed handler ────────────────────────────────────

@pytest.mark.asyncio
async def test_invoice_payment_failed_logs_only(test_user):
    """v1 logs only; no DB-state change. Stripe dunning handles retries."""
    await _set_customer(test_user["id"], "cus_pf_1")
    event = {
        "id": "evt_pf_1",
        "type": "invoice.payment_failed",
        "data": {"object": {"customer": "cus_pf_1"}},
    }
    before = await _get_user(test_user["id"])
    result = await stripe_billing.record_and_handle(event)
    after = await _get_user(test_user["id"])
    assert result["status"] == "processed"
    # Tier / subscription unchanged.
    assert before == after


# ── billing_events row is inserted ────────────────────────────────────

@pytest.mark.asyncio
async def test_billing_events_row_recorded(test_user):
    event = _checkout_completed("evt_record_1", "cus_rec", "sub_rec", "price_pro_test", client_ref=str(test_user["id"]))
    await stripe_billing.record_and_handle(event)
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        row = await (await conn.execute(
            "SELECT user_id, event_type FROM billing_events WHERE stripe_event_id = ?",
            ("evt_record_1",),
        )).fetchone()
    assert row["user_id"] == test_user["id"]
    assert row["event_type"] == "checkout.session.completed"
