"""PR A of the pricing-plans series (#1790 / docs/design/pricing-plans.md).

Covers:
  - Migration 038: users.tier defaults to 'free'; CHECK constraint enforces enum.
  - Migration 039: billing_events table created with UNIQUE on stripe_event_id.
  - require_tier dependency: 402 below tier, allows at-or-above tier.
  - Four translation-creation routes return 402 for free users.

Stripe code lives in PR C; the columns and table added here are inert
until then (no test asserts Stripe behaviour).
"""

import pytest
import aiosqlite
import services.db as db_module
from services.auth import require_tier, TIER_RANK


# ── Migration 038 ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_migration_038_user_default_tier_free(tmp_db):
    """A user created without an explicit tier gets 'free'.

    Uses a fresh user (not the conftest test_user fixture, which bumps
    to 'pro' to keep existing translation-route tests passing). Asserts
    the column DEFAULT is what the migration says.
    """
    from services.db import get_or_create_user
    fresh = await get_or_create_user(
        google_id="fresh-default-tier-test",
        email="fresh@example.com",
        name="Fresh",
        picture="",
    )
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        row = await (await db.execute(
            "SELECT tier, stripe_customer_id, stripe_subscription_id, tier_period_end FROM users WHERE id = ?",
            (fresh["id"],),
        )).fetchone()
    assert row["tier"] == "free"
    assert row["stripe_customer_id"] is None
    assert row["stripe_subscription_id"] is None
    assert row["tier_period_end"] is None


@pytest.mark.asyncio
async def test_migration_038_check_constraint_rejects_unknown_tier(test_user):
    """The CHECK constraint blocks tier values outside ('free','pro','premium')."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "UPDATE users SET tier = 'enterprise' WHERE id = ?",
                (test_user["id"],),
            )
            await db.commit()


@pytest.mark.asyncio
async def test_migration_038_accepts_pro_and_premium(test_user):
    """The CHECK constraint accepts 'pro' and 'premium'."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        for tier in ("pro", "premium"):
            await db.execute("UPDATE users SET tier = ? WHERE id = ?", (tier, test_user["id"]))
            await db.commit()
            db.row_factory = aiosqlite.Row
            row = await (await db.execute("SELECT tier FROM users WHERE id = ?", (test_user["id"],))).fetchone()
            assert row["tier"] == tier


# ── Migration 039 ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_migration_039_billing_events_table_exists(test_user):
    """billing_events table is created and accepts an insert."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO billing_events (user_id, stripe_event_id, event_type, payload_json) VALUES (?, ?, ?, ?)",
            (test_user["id"], "evt_test_1", "checkout.session.completed", "{}"),
        )
        await db.commit()
        db.row_factory = aiosqlite.Row
        row = await (await db.execute("SELECT * FROM billing_events WHERE stripe_event_id = ?", ("evt_test_1",))).fetchone()
    assert row["user_id"] == test_user["id"]
    assert row["event_type"] == "checkout.session.completed"
    assert row["received_at"] is not None  # default CURRENT_TIMESTAMP


@pytest.mark.asyncio
async def test_migration_039_stripe_event_id_unique(test_user):
    """Replay of the same stripe_event_id is rejected (idempotency primitive)."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO billing_events (user_id, stripe_event_id, event_type, payload_json) VALUES (?, ?, ?, ?)",
            (test_user["id"], "evt_dupe", "subscription.updated", "{}"),
        )
        await db.commit()
        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "INSERT INTO billing_events (user_id, stripe_event_id, event_type, payload_json) VALUES (?, ?, ?, ?)",
                (test_user["id"], "evt_dupe", "subscription.updated", "{}"),
            )
            await db.commit()


# ── require_tier dependency ──────────────────────────────────────────────

def test_tier_rank_total_order():
    assert TIER_RANK["free"] < TIER_RANK["pro"] < TIER_RANK["premium"]


def test_require_tier_unknown_min_tier_raises():
    with pytest.raises(ValueError):
        require_tier("enterprise")


@pytest.mark.asyncio
async def test_require_tier_blocks_under_tier():
    """Free user calling a Pro-required route gets 402 with structured detail."""
    from fastapi import HTTPException
    dep = require_tier("pro")
    with pytest.raises(HTTPException) as exc_info:
        await dep(user={"id": 1, "tier": "free"})
    assert exc_info.value.status_code == 402
    assert exc_info.value.detail["error"] == "tier_required"
    assert exc_info.value.detail["current_tier"] == "free"
    assert exc_info.value.detail["required_tier"] == "pro"


@pytest.mark.asyncio
async def test_require_tier_allows_at_tier():
    """Pro user calling a Pro-required route passes."""
    dep = require_tier("pro")
    user = {"id": 1, "tier": "pro"}
    assert await dep(user=user) is user


@pytest.mark.asyncio
async def test_require_tier_allows_above_tier():
    """Premium user calling a Pro-required route passes."""
    dep = require_tier("pro")
    user = {"id": 1, "tier": "premium"}
    assert await dep(user=user) is user


@pytest.mark.asyncio
async def test_require_tier_premium_blocks_pro():
    """Pro user calling a Premium-required route gets 402."""
    from fastapi import HTTPException
    dep = require_tier("premium")
    with pytest.raises(HTTPException) as exc_info:
        await dep(user={"id": 1, "tier": "pro"})
    assert exc_info.value.status_code == 402
    assert exc_info.value.detail["required_tier"] == "premium"


@pytest.mark.asyncio
async def test_require_tier_missing_tier_treats_as_free():
    """A user dict without a tier key (legacy / pre-migration) is treated as free."""
    from fastapi import HTTPException
    dep = require_tier("pro")
    with pytest.raises(HTTPException) as exc_info:
        await dep(user={"id": 1})  # no 'tier' key
    assert exc_info.value.status_code == 402
    assert exc_info.value.detail["current_tier"] == "free"


# ── Translation-route gating (4 routes) ──────────────────────────────────

# The conftest `test_user` fixture defaults to 'pro' so existing
# translation-route tests (which don't care about tier gating) keep
# passing. These four tests downgrade to 'free' explicitly, then
# assert the route returns 402.

async def _downgrade_to_free(user_id: int) -> None:
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE users SET tier = 'free' WHERE id = ?", (user_id,))
        await db.commit()


async def _seed_minimal_book(book_id: int) -> None:
    """Minimal book row for the route to pass its existence/access guards
    so the tier check is reached (cache-miss path)."""
    from services.db import save_book
    await save_book(
        book_id,
        {"id": book_id, "title": "Test", "languages": ["en"], "subjects": [],
         "authors": [], "download_count": 0, "cover": ""},
        "Chapter I\n\nSome text.",
    )


@pytest.mark.asyncio
async def test_request_chapter_translation_blocks_free(client, test_user):
    """Cache-miss POST as a free user → 402 (the gate fires after cache lookup
    + book/access/draft/same-language/bounds guards)."""
    await _downgrade_to_free(test_user["id"])
    await _seed_minimal_book(7777)
    resp = await client.post(
        "/api/books/7777/chapters/0/translation",
        json={"target_language": "zh"},
    )
    assert resp.status_code == 402
    assert resp.json()["detail"]["error"] == "tier_required"


@pytest.mark.asyncio
async def test_retry_chapter_translation_blocks_free(client, test_user):
    await _downgrade_to_free(test_user["id"])
    resp = await client.post(
        "/api/books/2229/chapters/0/translation/retry",
        json={"target_language": "zh"},
    )
    assert resp.status_code == 402
    assert resp.json()["detail"]["error"] == "tier_required"


@pytest.mark.asyncio
async def test_enqueue_all_chapters_blocks_free(client, test_user):
    await _downgrade_to_free(test_user["id"])
    resp = await client.post(
        "/api/books/2229/translations/enqueue-all",
        json={"target_language": "zh"},
    )
    assert resp.status_code == 402
    assert resp.json()["detail"]["error"] == "tier_required"


@pytest.mark.asyncio
async def test_ai_translate_blocks_free(client, test_user):
    await _downgrade_to_free(test_user["id"])
    resp = await client.post(
        "/api/ai/translate",
        json={"text": "hello", "source_language": "en", "target_language": "zh"},
    )
    assert resp.status_code == 402
    assert resp.json()["detail"]["error"] == "tier_required"


@pytest.mark.asyncio
async def test_request_chapter_translation_allows_pro(client, test_user):
    """Promote to Pro and confirm 402 is gone (the route then fails for other reasons,
    which is fine — we only assert the tier gate cleared."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE users SET tier = 'pro' WHERE id = ?", (test_user["id"],))
        await db.commit()
    resp = await client.post(
        "/api/books/2229/chapters/0/translation",
        json={"target_language": "zh"},
    )
    assert resp.status_code != 402  # tier gate cleared; downstream may 404 / 403 / 400
