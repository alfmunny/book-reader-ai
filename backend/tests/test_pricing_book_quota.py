"""PR B of the pricing-plans series (#1790 / docs/design/pricing-plans.md).

Covers the free-tier 3-distinct-books-per-calendar-month quota enforced
on `GET /books/{id}/chapters` via `require_book_quota`.

The quota is computed from `reading_history` (existing table from
migration 019) — no new schema. Calendar-month boundary chosen for
predictability and cheaper SQL (one fixed bound vs a continuously
moving rolling-30 window).
"""

import pytest
import aiosqlite
import services.db as db_module
from services.auth import (
    require_book_quota, FREE_TIER_MONTHLY_BOOK_QUOTA,
)


async def _seed_book(book_id: int) -> None:
    from services.db import save_book
    await save_book(
        book_id,
        {"id": book_id, "title": f"Test {book_id}", "languages": ["en"], "subjects": [],
         "authors": [], "download_count": 0, "cover": ""},
        f"Chapter I\n\nText for book {book_id}.",
    )


async def _seed_reading_history(user_id: int, book_id: int, when: str = "now") -> None:
    """Insert one reading_history row at the given SQLite datetime modifier."""
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            f"INSERT INTO reading_history (user_id, book_id, chapter_index, read_at) "
            f"VALUES (?, ?, 0, datetime('{when}'))",
            (user_id, book_id),
        )
        await conn.commit()


async def _set_tier(user_id: int, tier: str) -> None:
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute("UPDATE users SET tier = ? WHERE id = ?", (tier, user_id))
        await conn.commit()


# ── require_book_quota unit tests ────────────────────────────────────────

@pytest.mark.asyncio
async def test_require_book_quota_anon_is_no_op(test_user):
    """No user → no quota enforcement."""
    await require_book_quota(None, 9999)  # does not raise


@pytest.mark.asyncio
async def test_require_book_quota_pro_no_op(test_user):
    """Pro tier → quota does not apply."""
    await _set_tier(test_user["id"], "pro")
    user = {**test_user, "tier": "pro"}
    # Even with 3 books already in history, opening a 4th should pass.
    for b in (101, 102, 103):
        await _seed_reading_history(test_user["id"], b)
    await require_book_quota(user, 999)  # does not raise


@pytest.mark.asyncio
async def test_require_book_quota_premium_no_op(test_user):
    await _set_tier(test_user["id"], "premium")
    user = {**test_user, "tier": "premium"}
    for b in (201, 202, 203):
        await _seed_reading_history(test_user["id"], b)
    await require_book_quota(user, 999)


@pytest.mark.asyncio
async def test_require_book_quota_free_under_limit_succeeds(test_user):
    """Free user with 2 books this month opens a 3rd successfully."""
    await _set_tier(test_user["id"], "free")
    user = {**test_user, "tier": "free"}
    for b in (301, 302):
        await _seed_reading_history(test_user["id"], b)
    await require_book_quota(user, 303)  # does not raise — under quota


@pytest.mark.asyncio
async def test_require_book_quota_free_at_limit_blocks_new_book(test_user):
    """Free user with 3 distinct books this month → 402 on a 4th."""
    from fastapi import HTTPException
    await _set_tier(test_user["id"], "free")
    user = {**test_user, "tier": "free"}
    for b in (401, 402, 403):
        await _seed_reading_history(test_user["id"], b)
    with pytest.raises(HTTPException) as exc_info:
        await require_book_quota(user, 404)
    assert exc_info.value.status_code == 402
    detail = exc_info.value.detail
    assert detail["error"] == "book_quota_reached"
    assert detail["books_used"] == 3
    assert detail["books_quota"] == FREE_TIER_MONTHLY_BOOK_QUOTA


@pytest.mark.asyncio
async def test_require_book_quota_free_at_limit_allows_already_read_book(test_user):
    """At quota, the 4th, 5th, ... chapter of an already-opened book stays accessible."""
    await _set_tier(test_user["id"], "free")
    user = {**test_user, "tier": "free"}
    for b in (501, 502, 503):
        await _seed_reading_history(test_user["id"], b)
    # Reopen 502 — already counted, no extra spend.
    await require_book_quota(user, 502)


@pytest.mark.asyncio
async def test_require_book_quota_prior_month_does_not_count(test_user):
    """Books opened LAST month don't count against the current month's quota."""
    await _set_tier(test_user["id"], "free")
    user = {**test_user, "tier": "free"}
    # Three books from prior month — should NOT block.
    for b in (601, 602, 603):
        await _seed_reading_history(test_user["id"], b, when="now', '-2 months")
    # Quota for THIS month is empty; 3 fresh book opens this month all succeed.
    for b in (701, 702, 703):
        await require_book_quota(user, b)
        await _seed_reading_history(test_user["id"], b)
    # 4th this month → blocked.
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        await require_book_quota(user, 704)


# ── GET /books/{id}/chapters integration ─────────────────────────────────

@pytest.mark.asyncio
async def test_chapters_endpoint_blocks_free_user_at_quota(client, test_user):
    """End-to-end: free user with 3 books this month → 402 on 4th."""
    await _set_tier(test_user["id"], "free")
    for b in (801, 802, 803):
        await _seed_book(b)
        await _seed_reading_history(test_user["id"], b)
    await _seed_book(804)
    resp = await client.get("/api/books/804/chapters")
    assert resp.status_code == 402
    assert resp.json()["detail"]["error"] == "book_quota_reached"


@pytest.mark.asyncio
async def test_chapters_endpoint_allows_already_read_book(client, test_user):
    """Free user at quota can keep reading one of the 3 books they've already opened."""
    await _set_tier(test_user["id"], "free")
    for b in (901, 902, 903):
        await _seed_book(b)
        await _seed_reading_history(test_user["id"], b)
    resp = await client.get("/api/books/902/chapters")
    assert resp.status_code != 402  # quota gate cleared (downstream may 200/404)


@pytest.mark.asyncio
async def test_chapters_endpoint_pro_no_quota(client, test_user):
    """Pro user has no monthly book limit — 4th book opens successfully."""
    # Note: client fixture defaults to pro already (cycle-17 conftest change).
    for b in (1001, 1002, 1003, 1004):
        await _seed_book(b)
        await _seed_reading_history(test_user["id"], b)
    await _seed_book(1005)
    resp = await client.get("/api/books/1005/chapters")
    assert resp.status_code != 402
