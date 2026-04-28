"""Daily cron: defensively downgrade users whose paid period has ended.

PR D of the pricing-plans series (#1790 / docs/design/pricing-plans.md).

The Stripe webhook (PR C2) handles `customer.subscription.deleted` by
clearing `stripe_subscription_id` and leaving the tier alone — the user
paid through `tier_period_end`, so they keep paid features until then.
This script enforces the actual downgrade: any user whose
`tier_period_end < now()` AND has no active subscription gets bumped
back to `'free'`.

Belt-and-suspenders for two failure modes:
  1. Stripe webhook drop — the .deleted event never arrived; we still
     downgrade based on the period end alone.
  2. Active subscription with expired period — Stripe should have sent
     subscription.updated to extend the period; if it didn't, this
     script catches the gap.

Usage
-----
    python -m backend.scripts.expire_subscriptions          # default
    python -m backend.scripts.expire_subscriptions --dry-run  # report only

Schedule: daily at an off-minute (e.g. 03:17 UTC). Cheap query, indexed
on tier_period_end via the existing users PRIMARY KEY scan.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timezone

import aiosqlite

# Allow `python -m backend.scripts.expire_subscriptions` from repo root.
sys.path.insert(0, str(__file__).rsplit("/backend/", 1)[0] + "/backend")

from services import db as _db


logger = logging.getLogger("services.expire_subscriptions")


async def expire_lapsed_subscriptions(*, dry_run: bool = False) -> dict:
    """Find users whose paid period has ended and downgrade them.

    Returns a summary dict suitable for log output / cron stdout.
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    candidates = await _select_lapsed_users(now)
    summary = {
        "now": now,
        "lapsed_count": len(candidates),
        "downgraded": 0,
        "dry_run": dry_run,
        "users": [
            {
                "user_id": row["id"],
                "email": row["email"],
                "from_tier": row["tier"],
                "period_end": row["tier_period_end"],
            }
            for row in candidates
        ],
    }

    if dry_run or not candidates:
        return summary

    user_ids = [row["id"] for row in candidates]
    async with aiosqlite.connect(_db.DB_PATH) as conn:
        await conn.executemany(
            "UPDATE users SET tier = 'free', stripe_subscription_id = NULL WHERE id = ?",
            [(uid,) for uid in user_ids],
        )
        await conn.commit()
    summary["downgraded"] = len(user_ids)

    for row in candidates:
        logger.info(
            "Downgraded user %s (%s): %s → free (period_end=%s)",
            row["id"], row["email"], row["tier"], row["tier_period_end"],
        )
    return summary


async def _select_lapsed_users(now_iso: str) -> list[dict]:
    """Users with paid tier whose period ended and who have no active
    subscription. The `stripe_subscription_id IS NULL` clause prevents
    downgrading users whose subscription is still active but whose
    tier_period_end is stale (Stripe should send subscription.updated
    eventually; we don't race ahead of it)."""
    async with aiosqlite.connect(_db.DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        rows = await (await conn.execute(
            """SELECT id, email, tier, tier_period_end
                 FROM users
                WHERE tier IN ('pro', 'premium')
                  AND tier_period_end IS NOT NULL
                  AND tier_period_end < ?
                  AND stripe_subscription_id IS NULL""",
            (now_iso,),
        )).fetchall()
    return [dict(r) for r in rows]


async def _main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    parser.add_argument("--dry-run", action="store_true",
                        help="Print users that would be downgraded; don't write.")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
    summary = await expire_lapsed_subscriptions(dry_run=args.dry_run)
    print(
        f"now={summary['now']} lapsed={summary['lapsed_count']} "
        f"downgraded={summary['downgraded']} dry_run={summary['dry_run']}"
    )
    for u in summary["users"]:
        print(f"  user_id={u['user_id']} email={u['email']} "
              f"from={u['from_tier']} period_end={u['period_end']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
