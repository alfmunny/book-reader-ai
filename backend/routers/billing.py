"""Billing & subscription endpoints.

PR C1 of the pricing-plans series (#1790 / docs/design/pricing-plans.md).
Ships a read-only `GET /billing/me` returning the current user's tier
+ period end + book / translation usage. Stripe checkout / portal /
webhook routes are out-of-scope for C1 — see PR C2.

The usage counters are computed live from existing tables
(`reading_history` for distinct books this month, `translations` for
authored translations this month). No new schema.
"""

from fastapi import APIRouter, Depends, Path
import aiosqlite

from services import db as _db
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
