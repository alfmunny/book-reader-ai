"""
Async rate limiter for Gemini free-tier API calls.

Enforces two limits:
  - RPM (requests per minute) — rolling-window token bucket in memory
  - RPD (requests per day) — counter persisted to DB so it survives restarts

Usage:
    limiter = AsyncRateLimiter(rpm=15, rpd=1500, provider="gemini")
    await limiter.acquire()   # blocks until a request slot is available
    ...make the API call...
    # Automatic commit of the request count on acquire.

The DB counter resets at UTC midnight. If we hit the daily cap mid-run, the
limiter sleeps until the next day. Callers can check `limiter.daily_remaining()`
if they want to surface the wait time to the user.
"""

from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime, timezone
from typing import Callable, Optional

import aiosqlite

from services import db as db_module


def _utc_today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _utc_seconds_until_midnight() -> float:
    now = datetime.now(timezone.utc)
    tomorrow_midnight = now.replace(
        hour=0, minute=0, second=0, microsecond=0
    ).timestamp() + 86400
    return max(0.0, tomorrow_midnight - now.timestamp())


class AsyncRateLimiter:
    """Rolling-window RPM + persisted RPD rate limiter.

    The RPM window is in-process; every acquire() waits until fewer than `rpm`
    requests have been made in the last 60 seconds. The RPD counter lives in
    the `rate_limiter_usage` table so Railway restarts don't blow the daily
    budget.
    """

    def __init__(
        self,
        *,
        rpm: int = 15,
        rpd: int = 1500,
        provider: str = "gemini",
        # clock injection makes the tests deterministic
        time_fn: Optional[Callable[[], float]] = None,
        sleep_fn: Optional[Callable[[float], "asyncio.Future[None]"]] = None,
    ) -> None:
        if rpm < 1:
            raise ValueError("rpm must be >= 1")
        self.rpm = rpm
        self.rpd = rpd
        self.provider = provider
        self._time = time_fn or (lambda: asyncio.get_event_loop().time())
        self._sleep = sleep_fn or asyncio.sleep
        self._rpm_window: deque[float] = deque()
        self._lock = asyncio.Lock()

    # ── Public API ──────────────────────────────────────────────────────

    async def acquire(self) -> None:
        """Block until a request slot is available under both RPM and RPD caps.

        The RPD counter is incremented atomically inside the lock so concurrent
        callers can't both slip past the limit by a race.
        """
        async with self._lock:
            # ── RPD check — persisted ────────────────────────────────────
            while True:
                remaining = await self._daily_remaining()
                if remaining > 0:
                    break
                wait = _utc_seconds_until_midnight() + 1.0
                await self._sleep(wait)

            # ── RPM check — in-memory ────────────────────────────────────
            now = self._time()
            while self._rpm_window and now - self._rpm_window[0] >= 60.0:
                self._rpm_window.popleft()

            if len(self._rpm_window) >= self.rpm:
                # Sleep until the oldest request falls out of the window
                wait = 60.0 - (now - self._rpm_window[0]) + 0.01
                if wait > 0:
                    await self._sleep(wait)
                    now = self._time()
                # Re-clean after sleeping
                while self._rpm_window and now - self._rpm_window[0] >= 60.0:
                    self._rpm_window.popleft()

            # Record this request both in-memory and persistently
            self._rpm_window.append(now)
            await self._increment_daily()

    async def daily_remaining(self) -> int:
        """Return remaining requests today (never negative)."""
        return await self._daily_remaining()

    # ── Internal DB helpers ──────────────────────────────────────────────

    async def _daily_count(self) -> int:
        async with aiosqlite.connect(db_module.DB_PATH) as db:
            async with db.execute(
                "SELECT requests FROM rate_limiter_usage WHERE provider=? AND date=?",
                (self.provider, _utc_today()),
            ) as cursor:
                row = await cursor.fetchone()
        return row[0] if row else 0

    async def _daily_remaining(self) -> int:
        count = await self._daily_count()
        return max(0, self.rpd - count)

    async def _increment_daily(self) -> None:
        async with aiosqlite.connect(db_module.DB_PATH) as db:
            await db.execute(
                """
                INSERT INTO rate_limiter_usage (provider, date, requests)
                VALUES (?, ?, 1)
                ON CONFLICT(provider, date) DO UPDATE SET requests = requests + 1
                """,
                (self.provider, _utc_today()),
            )
            await db.commit()
