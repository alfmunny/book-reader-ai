"""PR D of the pricing-plans series (#1790).

Defensive daily-cron downgrade for users whose paid period has ended
without Stripe issuing a webhook (or whose webhook was dropped). See
backend/scripts/expire_subscriptions.py.
"""

import pytest
import aiosqlite
import services.db as db_module
from scripts.expire_subscriptions import expire_lapsed_subscriptions


async def _make_user(google_id: str, email: str, tier: str,
                    tier_period_end: str | None,
                    stripe_subscription_id: str | None) -> int:
    """Create a fresh user with the given tier/period state."""
    from services.db import get_or_create_user
    user = await get_or_create_user(
        google_id=google_id, email=email, name=email, picture="",
    )
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET tier = ?, tier_period_end = ?, stripe_subscription_id = ? WHERE id = ?",
            (tier, tier_period_end, stripe_subscription_id, user["id"]),
        )
        await conn.commit()
    return user["id"]


async def _get_tier(user_id: int) -> str:
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        row = await (await conn.execute(
            "SELECT tier FROM users WHERE id = ?", (user_id,),
        )).fetchone()
    return row[0]


@pytest.mark.asyncio
async def test_downgrades_lapsed_pro_with_no_subscription(tmp_db):
    """Pro user, period ended yesterday, no subscription → downgraded."""
    uid = await _make_user(
        "lapsed_1", "lapsed1@example.com",
        tier="pro",
        tier_period_end="2020-01-01 00:00:00",
        stripe_subscription_id=None,
    )
    summary = await expire_lapsed_subscriptions()
    assert summary["downgraded"] == 1
    assert await _get_tier(uid) == "free"


@pytest.mark.asyncio
async def test_does_not_downgrade_active_subscription(tmp_db):
    """Pro user with active subscription stays pro even if tier_period_end
    is stale — Stripe will send subscription.updated to extend it."""
    uid = await _make_user(
        "active_sub", "active@example.com",
        tier="pro",
        tier_period_end="2020-01-01 00:00:00",
        stripe_subscription_id="sub_active_xyz",
    )
    summary = await expire_lapsed_subscriptions()
    # The candidate row is filtered out by the SQL guard.
    assert summary["downgraded"] == 0
    assert await _get_tier(uid) == "pro"


@pytest.mark.asyncio
async def test_does_not_downgrade_future_period(tmp_db):
    """User with period ending in the future stays paid."""
    uid = await _make_user(
        "future_period", "future@example.com",
        tier="pro",
        tier_period_end="2099-12-31 23:59:59",
        stripe_subscription_id=None,
    )
    summary = await expire_lapsed_subscriptions()
    assert summary["downgraded"] == 0
    assert await _get_tier(uid) == "pro"


@pytest.mark.asyncio
async def test_does_not_downgrade_free_user(tmp_db):
    """Free users are never candidates."""
    uid = await _make_user(
        "free_user", "free@example.com",
        tier="free",
        tier_period_end="2020-01-01 00:00:00",
        stripe_subscription_id=None,
    )
    summary = await expire_lapsed_subscriptions()
    assert summary["downgraded"] == 0
    assert await _get_tier(uid) == "free"


@pytest.mark.asyncio
async def test_dry_run_does_not_modify_db(tmp_db):
    """--dry-run reports the candidate but doesn't write."""
    uid = await _make_user(
        "dryrun_1", "dryrun@example.com",
        tier="premium",
        tier_period_end="2020-01-01 00:00:00",
        stripe_subscription_id=None,
    )
    summary = await expire_lapsed_subscriptions(dry_run=True)
    assert summary["lapsed_count"] == 1
    assert summary["downgraded"] == 0
    assert await _get_tier(uid) == "premium"


@pytest.mark.asyncio
async def test_downgrades_premium_too(tmp_db):
    uid = await _make_user(
        "premium_lapsed", "premiumlapse@example.com",
        tier="premium",
        tier_period_end="2020-01-01 00:00:00",
        stripe_subscription_id=None,
    )
    await expire_lapsed_subscriptions()
    assert await _get_tier(uid) == "free"


@pytest.mark.asyncio
async def test_summary_includes_user_details(tmp_db):
    """Summary lists user_id, email, from_tier, period_end."""
    uid = await _make_user(
        "summary_1", "summary@example.com",
        tier="pro",
        tier_period_end="2020-01-01 00:00:00",
        stripe_subscription_id=None,
    )
    summary = await expire_lapsed_subscriptions()
    assert summary["users"][0]["user_id"] == uid
    assert summary["users"][0]["email"] == "summary@example.com"
    assert summary["users"][0]["from_tier"] == "pro"
    assert summary["users"][0]["period_end"] == "2020-01-01 00:00:00"


@pytest.mark.asyncio
async def test_handles_empty_candidates(tmp_db):
    """No lapsed users → empty summary, no errors."""
    summary = await expire_lapsed_subscriptions()
    assert summary["lapsed_count"] == 0
    assert summary["downgraded"] == 0
    assert summary["users"] == []
