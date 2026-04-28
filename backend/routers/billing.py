"""Billing & subscription endpoints.

PR C1 + C2 of the pricing-plans series (#1790 / docs/design/pricing-plans.md).
- `GET /billing/me` (PR C1): read-only tier + this-month usage.
- `POST /billing/webhook` (PR C2): receives Stripe webhook events,
  verifies signature, idempotent insert into `billing_events`, dispatches
  to per-event handler in `services.stripe_billing`.

Checkout-session creation + customer-portal session lands in PR C3.
"""

from fastapi import APIRouter, Depends, Path, Request
import aiosqlite

from services import db as _db
from services import stripe_billing
from services.auth import (
    get_current_user, FREE_TIER_MONTHLY_BOOK_QUOTA,
)


router = APIRouter(prefix="/billing", tags=["billing"])


# Pro chapter cap: env-overridable so the user can tune without a code
# change. Default 50 per the design doc's recommendation. Lives here
# rather than at module-import time so tests can mutate via monkeypatch.
import os
def _pro_translation_monthly_cap() -> int:
    try:
        return int(os.environ.get("PRO_TRANSLATION_MONTHLY_CAP", "50"))
    except ValueError:
        return 50


@router.get("/me")
async def billing_me(user: dict = Depends(get_current_user)) -> dict:
    """Current tier + entitlements + this-month usage for the
    authenticated user. Frontend `/account/billing` reads this on
    page load."""
    tier = user.get("tier") or "free"
    period_end = user.get("tier_period_end")

    # Books opened this calendar month (free-tier quota signal).
    books_used = await _count_books_this_month(user["id"])
    # Translations authored this calendar month (Pro cap signal).
    translations_used = await _count_translations_this_month(user["id"])

    pro_cap = _pro_translation_monthly_cap()

    return {
        "tier": tier,
        "tier_period_end": period_end,
        "stripe_customer_id": user.get("stripe_customer_id"),
        "books": {
            "used": books_used,
            "quota": (
                FREE_TIER_MONTHLY_BOOK_QUOTA if tier == "free" else None
            ),
        },
        "translations": {
            "used": translations_used,
            "quota": (
                pro_cap if tier == "pro" else None
            ),
        },
    }


async def _count_books_this_month(user_id: int) -> int:
    """Distinct book_ids the user has opened in the current calendar month.
    Uses the same calendar-month bound as require_book_quota."""
    async with aiosqlite.connect(_db.DB_PATH) as conn:
        row = await (await conn.execute(
            """SELECT COUNT(DISTINCT book_id) FROM reading_history
                WHERE user_id = ? AND read_at >= datetime('now', 'start of month')""",
            (user_id,),
        )).fetchone()
    return int(row[0] if row else 0)


async def _count_translations_this_month(user_id: int) -> int:
    """Translations authored by this user in the current calendar month.
    `translations` doesn't carry a user_id today (it's a shared cache),
    so v1 returns 0. Hooks for per-user attribution land in PR C2 along
    with the Stripe webhook + tier transitions."""
    return 0


@router.post("/webhook")
async def stripe_webhook(request: Request) -> dict:
    """Stripe webhook receiver.

    Stripe POSTs events here on subscription create/update/delete +
    invoice failures. Signature is verified via STRIPE_WEBHOOK_SECRET
    env var. The handler is idempotent — replays of the same event_id
    are caught by UNIQUE on `billing_events.stripe_event_id` and return
    200 (so Stripe stops retrying).

    No auth gate — Stripe IPs aren't fixed, so the signature header is
    the only authentication mechanism. Any unauthenticated POST to this
    endpoint is rejected with 400 by the signature check inside
    `stripe_billing.construct_event`.
    """
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    event = stripe_billing.construct_event(payload, signature)
    return await stripe_billing.record_and_handle(event)
