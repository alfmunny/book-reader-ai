"""Stripe billing — webhook receive-side + checkout/portal session creation.

PR C2 + C3 of the pricing-plans series (#1790 / docs/design/pricing-plans.md).
- C2: webhook signature verification, idempotent insert into billing_events,
  tier-state transitions on subscription lifecycle events.
- C3: create_checkout_session() + create_portal_session() — invoked from
  POST /billing/checkout and POST /billing/portal. Stripe SDK calls run
  on a worker thread so the FastAPI event loop stays responsive.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import aiosqlite
import stripe
from fastapi import HTTPException

from services import db as _db


logger = logging.getLogger(__name__)


# Lazy-read so tests can monkeypatch env. Stripe SDK keys / webhook secret
# are required only at the moment the handler runs against a real event.
def _webhook_secret() -> str:
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(
            status_code=500,
            detail="STRIPE_WEBHOOK_SECRET not configured",
        )
    return secret


def _api_key() -> str:
    """Set on the stripe SDK module before any API call. The webhook
    handler itself doesn't need an API key (signature verification is
    secret-based), but checkout / portal calls do."""
    key = os.environ.get("STRIPE_API_KEY", "")
    if not key:
        raise HTTPException(
            status_code=500,
            detail="STRIPE_API_KEY not configured",
        )
    return key


def _price_id(tier: str) -> str:
    """Map tier → Stripe price ID via env var. 422 on unsupported tier
    (free / unknown), 500 if a Pro/Premium env var isn't configured."""
    if tier == "pro":
        price = os.environ.get("STRIPE_PRICE_PRO", "")
    elif tier == "premium":
        price = os.environ.get("STRIPE_PRICE_PREMIUM", "")
    else:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported tier: {tier!r}. Use 'pro' or 'premium'.",
        )
    if not price:
        raise HTTPException(
            status_code=500,
            detail=f"STRIPE_PRICE_{tier.upper()} not configured",
        )
    return price


async def create_checkout_session(*, user_id: int, user_email: str | None,
                                   tier: str, success_url: str, cancel_url: str,
                                   existing_customer_id: str | None) -> str:
    """Create a Stripe Checkout Session and return the redirect URL.

    On first checkout, `existing_customer_id` is None and Stripe creates
    a new Customer keyed to `user_email`. The local user_id is passed
    via `client_reference_id` so the webhook handler can resolve to the
    right user before stripe_customer_id is set on the users row.
    """
    stripe.api_key = _api_key()
    price = _price_id(tier)
    kwargs: dict[str, Any] = {
        "mode": "subscription",
        "line_items": [{"price": price, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": str(user_id),
    }
    if existing_customer_id:
        kwargs["customer"] = existing_customer_id
    elif user_email:
        kwargs["customer_email"] = user_email

    session = await _to_thread(stripe.checkout.Session.create, **kwargs)
    url = getattr(session, "url", None)
    if not url:
        raise HTTPException(status_code=502, detail="Stripe returned no checkout URL")
    return url


async def create_portal_session(*, customer_id: str, return_url: str) -> str:
    """Create a Customer Portal session for managing the subscription
    (cancel, update payment, view invoices)."""
    stripe.api_key = _api_key()
    session = await _to_thread(
        stripe.billing_portal.Session.create,
        customer=customer_id,
        return_url=return_url,
    )
    url = getattr(session, "url", None)
    if not url:
        raise HTTPException(status_code=502, detail="Stripe returned no portal URL")
    return url


async def _to_thread(fn, /, *args, **kwargs):
    """Run a sync Stripe SDK call off the event loop."""
    import asyncio
    return await asyncio.to_thread(fn, *args, **kwargs)


def construct_event(payload: bytes, signature: str) -> dict[str, Any]:
    """Verify the webhook signature and return the parsed event.

    Raises 400 on invalid signature / payload. Wraps Stripe SDK
    exceptions in FastAPI HTTPException for the route handler.
    """
    try:
        event = stripe.Webhook.construct_event(
            payload, signature, _webhook_secret(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {exc}")
    except stripe.error.SignatureVerificationError as exc:  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail=f"Invalid signature: {exc}")
    # `event` is a stripe.Event — coerce to dict for storage / handler use.
    return dict(event)


async def record_and_handle(event: dict[str, Any]) -> dict[str, str]:
    """Insert event into billing_events (idempotent via UNIQUE on
    stripe_event_id), then dispatch to the per-event-type handler.

    Returns `{"status": "processed"}` on first delivery, or
    `{"status": "duplicate"}` on replay (the UNIQUE constraint catches
    it; we return 200 so Stripe stops retrying).
    """
    event_id: str = event["id"]
    event_type: str = event["type"]
    user_id: int | None = _resolve_user_id(event)
    payload_json = json.dumps(event)

    async with aiosqlite.connect(_db.DB_PATH) as conn:
        try:
            await conn.execute(
                "INSERT INTO billing_events (user_id, stripe_event_id, event_type, payload_json) "
                "VALUES (?, ?, ?, ?)",
                (user_id, event_id, event_type, payload_json),
            )
            await conn.commit()
        except aiosqlite.IntegrityError:
            # Replay — already processed. Return 200 so Stripe stops retrying.
            logger.info("Stripe webhook replay ignored: %s", event_id)
            return {"status": "duplicate"}

    handler = _HANDLERS.get(event_type)
    if handler is None:
        logger.info("Stripe webhook event type not handled: %s", event_type)
        return {"status": "ignored"}

    await handler(event)
    return {"status": "processed"}


def _resolve_user_id(event: dict[str, Any]) -> int | None:
    """Extract the local user_id from an event. Tries:
    (1) `client_reference_id` on the object (set on first checkout, reliable
        for checkout.session.completed before customer is linked).
    (2) `customer` ID → users.stripe_customer_id mapping (reliable for all
        post-checkout events on a linked user).
    """
    obj = event.get("data", {}).get("object", {})
    ref = obj.get("client_reference_id")
    if ref:
        try:
            return int(ref)
        except (ValueError, TypeError):
            pass
    customer_id = obj.get("customer") or obj.get("customer_id")
    if not customer_id:
        return None
    return _customer_id_to_user_id_sync(customer_id)


def _customer_id_to_user_id_sync(customer_id: str) -> int | None:
    """Synchronous lookup helper — wrapped in async caller via aiosqlite.
    Used only at event-record time so user_id is set on the billing_events
    row even before the dispatcher runs."""
    import sqlite3
    try:
        with sqlite3.connect(_db.DB_PATH) as conn:
            row = conn.execute(
                "SELECT id FROM users WHERE stripe_customer_id = ? LIMIT 1",
                (customer_id,),
            ).fetchone()
        return row[0] if row else None
    except Exception:
        return None


# ── Event handlers ──────────────────────────────────────────────────────

async def _on_checkout_session_completed(event: dict[str, Any]) -> None:
    """A user just completed first checkout. Set tier + stripe IDs +
    period end on the users row."""
    obj = event["data"]["object"]
    customer_id = obj.get("customer")
    subscription_id = obj.get("subscription")
    # The price ID determines the tier — we map via env vars so the
    # user can set them once in their hosting config.
    tier = _tier_for_price(_extract_price_id(obj))
    # Period end comes from the subscription object — checkout session
    # itself doesn't carry it. We populate at next subscription.updated
    # event (which Stripe sends concurrently). Leave NULL here.
    user_id = _customer_id_to_user_id_sync(customer_id) if customer_id else None
    # If the user had no stripe_customer_id yet, we need client_reference_id
    # to identify them. Stripe sends this if checkout was created with it.
    if user_id is None:
        ref = obj.get("client_reference_id")
        if ref:
            try:
                user_id = int(ref)
            except ValueError:
                user_id = None
    if user_id is None:
        logger.warning("checkout.session.completed could not resolve user; event=%s", event["id"])
        return

    async with aiosqlite.connect(_db.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET tier = ?, stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?",
            (tier, customer_id, subscription_id, user_id),
        )
        await conn.commit()
    logger.info("Checkout completed for user %s: tier=%s sub=%s", user_id, tier, subscription_id)


async def _on_subscription_updated(event: dict[str, Any]) -> None:
    """Tier or period change. Update both."""
    obj = event["data"]["object"]
    customer_id = obj.get("customer")
    subscription_id = obj.get("id")
    period_end_unix = obj.get("current_period_end")
    period_end = (
        # SQLite-friendly ISO format from Unix timestamp.
        _unix_to_sqlite_datetime(period_end_unix) if period_end_unix else None
    )
    tier = _tier_for_price(_extract_price_id(obj))

    user_id = _customer_id_to_user_id_sync(customer_id) if customer_id else None
    if user_id is None:
        logger.warning("subscription.updated could not resolve user; event=%s", event["id"])
        return

    async with aiosqlite.connect(_db.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET tier = ?, stripe_subscription_id = ?, tier_period_end = ? WHERE id = ?",
            (tier, subscription_id, period_end, user_id),
        )
        await conn.commit()
    logger.info("Subscription updated for user %s: tier=%s period_end=%s",
                user_id, tier, period_end)


async def _on_subscription_deleted(event: dict[str, Any]) -> None:
    """Subscription cancelled. **Don't downgrade immediately** — user paid
    through tier_period_end. Just clear stripe_subscription_id and let
    the daily expire_subscriptions cron (PR D) downgrade after the period.
    """
    obj = event["data"]["object"]
    customer_id = obj.get("customer")

    user_id = _customer_id_to_user_id_sync(customer_id) if customer_id else None
    if user_id is None:
        logger.warning("subscription.deleted could not resolve user; event=%s", event["id"])
        return

    async with aiosqlite.connect(_db.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET stripe_subscription_id = NULL WHERE id = ?",
            (user_id,),
        )
        await conn.commit()
    logger.info("Subscription deleted for user %s — downgrade scheduled at period end", user_id)


async def _on_invoice_payment_failed(event: dict[str, Any]) -> None:
    """Payment failed — log only in v1. Stripe's dunning settings handle
    the retry cadence + customer email. UI banner ("payment failed") is
    a follow-up."""
    obj = event["data"]["object"]
    customer_id = obj.get("customer")
    user_id = _customer_id_to_user_id_sync(customer_id) if customer_id else None
    logger.warning(
        "invoice.payment_failed for user %s (customer=%s, event=%s)",
        user_id, customer_id, event["id"],
    )


_HANDLERS = {
    "checkout.session.completed": _on_checkout_session_completed,
    "customer.subscription.updated": _on_subscription_updated,
    "customer.subscription.created": _on_subscription_updated,  # same handler shape
    "customer.subscription.deleted": _on_subscription_deleted,
    "invoice.payment_failed": _on_invoice_payment_failed,
}


# ── Helpers ─────────────────────────────────────────────────────────────

def _tier_for_price(price_id: str | None) -> str:
    """Map Stripe price ID → tier string. Env-driven so the user
    configures price IDs once in their hosting config without a code
    change."""
    if not price_id:
        return "free"
    if price_id == os.environ.get("STRIPE_PRICE_PRO", ""):
        return "pro"
    if price_id == os.environ.get("STRIPE_PRICE_PREMIUM", ""):
        return "premium"
    logger.warning("Unknown Stripe price_id: %s — defaulting to 'free'", price_id)
    return "free"


def _extract_price_id(obj: dict[str, Any]) -> str | None:
    """Walk the various shapes a price ID can appear in across event
    types: checkout session has `line_items` (expanded) or `items.data`,
    subscription objects have `items.data[].price.id`."""
    items = obj.get("items", {})
    if isinstance(items, dict):
        data = items.get("data") or []
        if data and isinstance(data[0], dict):
            price = data[0].get("price") or {}
            if isinstance(price, dict):
                return price.get("id")
    line_items = obj.get("line_items", {})
    if isinstance(line_items, dict):
        data = line_items.get("data") or []
        if data and isinstance(data[0], dict):
            price = data[0].get("price") or {}
            if isinstance(price, dict):
                return price.get("id")
    return None


def _unix_to_sqlite_datetime(unix_ts: int | float) -> str:
    """SQLite stores TIMESTAMP as 'YYYY-MM-DD HH:MM:SS' UTC."""
    from datetime import datetime, timezone
    return datetime.fromtimestamp(unix_ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
