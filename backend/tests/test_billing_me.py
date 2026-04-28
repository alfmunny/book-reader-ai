"""PR C1 of the pricing-plans series (#1790).

Covers GET /billing/me — the read-only endpoint that surfaces the
current user's tier + this-month usage. Stripe checkout / portal /
webhook routes land in PR C2.
"""

import pytest
import aiosqlite
import services.db as db_module


async def _set_tier(user_id: int, tier: str, period_end: str | None = None) -> None:
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET tier = ?, tier_period_end = ? WHERE id = ?",
            (tier, period_end, user_id),
        )
        await conn.commit()


async def _seed_reading(user_id: int, book_id: int, when: str = "now") -> None:
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            f"INSERT INTO reading_history (user_id, book_id, chapter_index, read_at) "
            f"VALUES (?, ?, 0, datetime('{when}'))",
            (user_id, book_id),
        )
        await conn.commit()


@pytest.mark.asyncio
async def test_billing_me_default_pro_user(client, test_user):
    """Default test_user is pro per conftest. Endpoint returns the basics."""
    resp = await client.get("/api/billing/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["tier"] == "pro"
    assert body["stripe_customer_id"] is None
    # Pro: no books quota; has translations cap.
    assert body["books"]["quota"] is None
    assert body["translations"]["quota"] == 50  # default PRO_TRANSLATION_MONTHLY_CAP


@pytest.mark.asyncio
async def test_billing_me_free_user_includes_books_quota(client, test_user):
    await _set_tier(test_user["id"], "free")
    resp = await client.get("/api/billing/me")
    body = resp.json()
    assert body["tier"] == "free"
    assert body["books"]["quota"] == 3  # FREE_TIER_MONTHLY_BOOK_QUOTA
    assert body["translations"]["quota"] is None


@pytest.mark.asyncio
async def test_billing_me_premium_no_caps(client, test_user):
    await _set_tier(test_user["id"], "premium")
    resp = await client.get("/api/billing/me")
    body = resp.json()
    assert body["tier"] == "premium"
    assert body["books"]["quota"] is None
    assert body["translations"]["quota"] is None


@pytest.mark.asyncio
async def test_billing_me_books_used_counts_distinct_this_month(client, test_user):
    """Three distinct books this month + one prior-month → books.used = 3."""
    await _set_tier(test_user["id"], "free")
    for b in (1, 2, 3):
        await _seed_reading(test_user["id"], b)
    # Same book twice doesn't count twice.
    await _seed_reading(test_user["id"], 2)
    # Prior-month entries don't count.
    await _seed_reading(test_user["id"], 99, when="now', '-2 months")
    resp = await client.get("/api/billing/me")
    body = resp.json()
    assert body["books"]["used"] == 3


@pytest.mark.asyncio
async def test_billing_me_period_end_returned(client, test_user):
    """tier_period_end round-trips for paid users (will be set by webhook in PR C2)."""
    await _set_tier(test_user["id"], "pro", period_end="2026-12-31 23:59:59")
    resp = await client.get("/api/billing/me")
    body = resp.json()
    assert body["tier_period_end"] == "2026-12-31 23:59:59"


@pytest.mark.asyncio
async def test_billing_me_pro_cap_env_overridable(client, test_user, monkeypatch):
    """PRO_TRANSLATION_MONTHLY_CAP env var changes the reported translations.quota
    for Pro tier, without a code change."""
    monkeypatch.setenv("PRO_TRANSLATION_MONTHLY_CAP", "200")
    resp = await client.get("/api/billing/me")
    body = resp.json()
    assert body["translations"]["quota"] == 200


@pytest.mark.asyncio
async def test_billing_me_requires_auth(anon_client):
    """No Bearer token → 401."""
    resp = await anon_client.get("/api/billing/me")
    assert resp.status_code == 401
