"""Tests for services/rate_limiter.py — token-bucket RPM + persisted RPD."""

from __future__ import annotations

import pytest
import services.db as db_module
from services.db import init_db
from services.rate_limiter import AsyncRateLimiter


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
async def tmp_db(monkeypatch, tmp_path):
    """A fresh DB with schema applied. rate_limiter_usage table is part of it."""
    path = str(tmp_path / "rate.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()
    return path


class FakeClock:
    """Deterministic clock: time only advances when test calls .tick()."""
    def __init__(self, start: float = 1000.0) -> None:
        self.t = start
        self.slept: list[float] = []

    def time(self) -> float:
        return self.t

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.t += seconds

    def tick(self, seconds: float) -> None:
        self.t += seconds


# ── RPM (in-memory rolling window) ───────────────────────────────────────────

async def test_rpm_allows_up_to_limit_without_sleeping(tmp_db):
    clock = FakeClock()
    limiter = AsyncRateLimiter(rpm=3, rpd=100, time_fn=clock.time, sleep_fn=clock.sleep)
    for _ in range(3):
        await limiter.acquire()
    # No sleeps yet — we only burned through the window
    assert clock.slept == []


async def test_rpm_sleeps_when_window_full(tmp_db):
    clock = FakeClock()
    limiter = AsyncRateLimiter(rpm=2, rpd=100, time_fn=clock.time, sleep_fn=clock.sleep)
    await limiter.acquire()   # t=1000
    clock.tick(10)
    await limiter.acquire()   # t=1010
    clock.tick(5)
    # 3rd call at t=1015 — oldest is 1000, window is 60s, so we need to wait
    # 60 - (1015 - 1000) = 45s
    await limiter.acquire()
    assert any(44.0 < s < 46.0 for s in clock.slept)


async def test_rpm_old_requests_drop_out_of_window(tmp_db):
    clock = FakeClock()
    limiter = AsyncRateLimiter(rpm=2, rpd=100, time_fn=clock.time, sleep_fn=clock.sleep)
    await limiter.acquire()   # t=1000
    clock.tick(70)            # t=1070 — first request is now out of window
    await limiter.acquire()   # t=1070
    await limiter.acquire()   # t=1070 — still only 2 in window (since t=1070)
    # Actually this becomes 3 if we don't wait... let me re-check the logic
    # After the first acquire at t=1070, window has just that one request.
    # Second acquire at t=1070: window has 2 requests, both at t=1070.
    # That exceeds rpm=2? No — we allow up to rpm. Let's verify no sleep for 2.
    assert clock.slept == []


# ── RPD (persisted) ──────────────────────────────────────────────────────────

async def test_rpd_increments_on_each_acquire(tmp_db):
    clock = FakeClock()
    limiter = AsyncRateLimiter(rpm=100, rpd=100, time_fn=clock.time, sleep_fn=clock.sleep)
    assert await limiter.daily_remaining() == 100
    await limiter.acquire()
    assert await limiter.daily_remaining() == 99
    await limiter.acquire()
    assert await limiter.daily_remaining() == 98


async def test_rpd_persists_across_instances(tmp_db):
    """The daily counter survives creating a new limiter instance (like a restart)."""
    clock = FakeClock()
    limiter1 = AsyncRateLimiter(rpm=100, rpd=100, time_fn=clock.time, sleep_fn=clock.sleep)
    for _ in range(5):
        await limiter1.acquire()

    limiter2 = AsyncRateLimiter(rpm=100, rpd=100, time_fn=clock.time, sleep_fn=clock.sleep)
    assert await limiter2.daily_remaining() == 95


async def test_rpd_blocks_when_exhausted(tmp_db):
    """When the daily cap is hit, acquire() calls sleep with a large value (seconds until midnight)."""
    import aiosqlite

    sleep_calls: list[float] = []

    async def custom_sleep(seconds: float) -> None:
        sleep_calls.append(seconds)
        # After the first "wait till midnight" sleep, wipe the counter so the
        # next loop iteration sees remaining > 0 and we don't loop forever.
        if seconds > 100:
            async with aiosqlite.connect(db_module.DB_PATH) as db:
                await db.execute("DELETE FROM rate_limiter_usage")
                await db.commit()

    clock = FakeClock()
    limiter = AsyncRateLimiter(rpm=100, rpd=2, time_fn=clock.time, sleep_fn=custom_sleep)
    await limiter.acquire()
    await limiter.acquire()
    # Third call should sleep until midnight (a large value), then proceed
    await limiter.acquire()
    assert any(s > 100 for s in sleep_calls), f"no long sleep in {sleep_calls}"


# ── Provider isolation ──────────────────────────────────────────────────────

async def test_different_providers_have_separate_counters(tmp_db):
    clock = FakeClock()
    gemini = AsyncRateLimiter(rpm=100, rpd=100, provider="gemini",
                              time_fn=clock.time, sleep_fn=clock.sleep)
    google = AsyncRateLimiter(rpm=100, rpd=100, provider="google",
                              time_fn=clock.time, sleep_fn=clock.sleep)
    await gemini.acquire()
    await gemini.acquire()
    assert await gemini.daily_remaining() == 98
    assert await google.daily_remaining() == 100


async def test_default_time_fn_works_inside_running_loop(tmp_db):
    """Regression #1014: AsyncRateLimiter default _time must work inside async context.

    get_running_loop().time() is correct here; get_event_loop() is deprecated
    in Python 3.10+ and would emit DeprecationWarning.
    """
    limiter = AsyncRateLimiter(rpm=60, rpd=1000)
    t = limiter._time()
    assert isinstance(t, float)
    assert t > 0


# ── Validation and edge-case branches (issue #1621) ──────────────────────────


def test_rate_limiter_rejects_rpm_zero():
    """Regression #1621: AsyncRateLimiter(rpm=0) must raise ValueError (line 68).
    Without the guard, rpm=0 would cause a ZeroDivisionError or infinite loop."""
    with pytest.raises(ValueError, match="rpm must be >= 1"):
        AsyncRateLimiter(rpm=0, rpd=100)


async def test_rate_limiter_no_sleep_when_wait_not_positive(tmp_db):
    """Regression #1621: when the oldest window entry is >= 60s old the
    calculated wait is <= 0 and the sleep call must be skipped (branch 103->107).
    Without this path, a non-positive wait could still trigger an unnecessary sleep."""
    sleep_calls = []

    async def fake_sleep(seconds: float) -> None:
        sleep_calls.append(seconds)

    # Clock starts at 100s so the first acquire is at t=100.
    tick = [100.0]

    def fake_time() -> float:
        return tick[0]

    limiter = AsyncRateLimiter(rpm=1, rpd=1000, time_fn=fake_time, sleep_fn=fake_sleep)
    # First acquire fills the window slot at t=100.
    await limiter.acquire()

    # Advance clock by exactly 60s — the window slot is now on the boundary
    # (60.0 - (160.0 - 100.0) = 0.0 → wait == 0.0 → no sleep).
    tick[0] = 160.0
    await limiter.acquire()

    positive_sleeps = [s for s in sleep_calls if s > 0]
    assert not positive_sleeps, (
        f"No sleep should be needed when wait <= 0, but got sleeps: {sleep_calls}"
    )
