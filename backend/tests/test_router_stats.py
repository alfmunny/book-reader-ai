"""
Tests for GET /user/stats and the reading_history logging hook.

Covers:
- Stats endpoint returns correct totals
- Reading streak: today, yesterday, gap breaks streak
- Longest streak calculation
- Activity heatmap from all event types
- log_reading_event called on PUT /user/reading-progress
- Zero state: fresh user returns zeros
"""

import pytest
import datetime as _real_dt
from datetime import date, timedelta
from unittest.mock import patch
from services.db import (
    save_book, upsert_reading_progress, log_reading_event,
    get_user_stats, save_word, create_annotation, save_insight,
)
import aiosqlite
import services.db as db_module

# ── Helpers for UTC regression test ──────────────────────────────────────────
# Simulate: UTC date = 2026-04-21, server-local date = 2026-04-20 (UTC-n timezone).
_fake_utc_now = _real_dt.datetime(2026, 4, 21, 12, 0, 0, tzinfo=_real_dt.timezone.utc)


class _FakeDate(_real_dt.date):
    @classmethod
    def today(cls):
        return _real_dt.date(2026, 4, 20)  # one day behind UTC


class _FakeDatetime(_real_dt.datetime):
    @classmethod
    def now(cls, tz=None):
        if tz is not None:
            return _fake_utc_now
        return _real_dt.datetime.now()

_BOOK_META = {
    "title": "Test Book",
    "authors": ["Author"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 5001
_CH = "word " * 200
_BOOK_TEXT = (
    f"CHAPTER I\n\n{_CH}\n\nCHAPTER II\n\n{_CH}\n\nCHAPTER III\n\n{_CH}"
    f"\n\nCHAPTER IV\n\n{_CH}\n\nCHAPTER V\n\n{_CH}\n\nCHAPTER VI\n\n{_CH}"
)


# ── Zero state ────────────────────────────────────────────────────────────────

async def test_stats_fresh_user_returns_zeros(client, tmp_db):
    resp = await client.get("/api/user/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["totals"]["books_started"] == 0
    assert data["totals"]["vocabulary_words"] == 0
    assert data["totals"]["annotations"] == 0
    assert data["totals"]["insights"] == 0
    assert data["streak"] == 0
    assert data["longest_streak"] == 0
    assert data["activity"] == []


# ── Totals ────────────────────────────────────────────────────────────────────

async def test_stats_totals_reflect_user_data(client, test_user, tmp_db):
    await save_book(BOOK_ID, _BOOK_META, _BOOK_TEXT)
    await upsert_reading_progress(test_user["id"], BOOK_ID, 2)
    await save_word(test_user["id"], "serendipity", BOOK_ID, 0, "It was serendipity.")
    await save_word(test_user["id"], "ephemeral", BOOK_ID, 1, "An ephemeral moment.")
    await create_annotation(test_user["id"], BOOK_ID, 0, "A sentence.", "A note.", "yellow")

    resp = await client.get("/api/user/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["totals"]["books_started"] == 1
    assert data["totals"]["vocabulary_words"] == 2
    assert data["totals"]["annotations"] == 1
    assert data["totals"]["insights"] == 0


# ── Streak calculation ────────────────────────────────────────────────────────

async def _insert_history_at(db_path, user_id, book_id, day_offset):
    """Insert a reading_history row with a synthetic timestamp (UTC-based)."""
    from datetime import timezone, datetime as _dt
    target_date = _dt.now(timezone.utc).date() - timedelta(days=day_offset)
    ts = f"{target_date.isoformat()} 12:00:00"
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO reading_history (user_id, book_id, chapter_index, read_at) VALUES (?, ?, 0, ?)",
            (user_id, book_id, ts),
        )
        await db.commit()


async def test_streak_today_only(client, test_user, tmp_db):
    await _insert_history_at(tmp_db, test_user["id"], BOOK_ID, 0)  # today
    resp = await client.get("/api/user/stats")
    assert resp.json()["streak"] == 1


async def test_streak_yesterday_only(client, test_user, tmp_db):
    await _insert_history_at(tmp_db, test_user["id"], BOOK_ID, 1)  # yesterday
    resp = await client.get("/api/user/stats")
    assert resp.json()["streak"] == 1


async def test_streak_consecutive_days(client, test_user, tmp_db):
    for offset in range(5):  # today, yesterday, 2 days ago, 3, 4
        await _insert_history_at(tmp_db, test_user["id"], BOOK_ID, offset)
    resp = await client.get("/api/user/stats")
    assert resp.json()["streak"] == 5


async def test_streak_gap_breaks_streak(client, test_user, tmp_db):
    # Today and 2 days ago — missing yesterday → streak = 1
    await _insert_history_at(tmp_db, test_user["id"], BOOK_ID, 0)
    await _insert_history_at(tmp_db, test_user["id"], BOOK_ID, 2)
    resp = await client.get("/api/user/stats")
    assert resp.json()["streak"] == 1


async def test_streak_zero_when_last_activity_was_two_days_ago(client, test_user, tmp_db):
    await _insert_history_at(tmp_db, test_user["id"], BOOK_ID, 2)
    resp = await client.get("/api/user/stats")
    assert resp.json()["streak"] == 0


async def test_longest_streak(client, test_user, tmp_db):
    # 3-day run 10 days ago, 5-day run 3 days ago (which includes today)
    for offset in [10, 11, 12]:   # old 3-day run
        await _insert_history_at(tmp_db, test_user["id"], BOOK_ID, offset)
    for offset in [0, 1, 2, 3, 4]:   # current 5-day run
        await _insert_history_at(tmp_db, test_user["id"], BOOK_ID, offset)
    resp = await client.get("/api/user/stats")
    data = resp.json()
    assert data["longest_streak"] == 5
    assert data["streak"] == 5


# ── Activity heatmap ──────────────────────────────────────────────────────────

async def test_activity_includes_vocabulary_events(client, test_user, tmp_db):
    await save_book(BOOK_ID, _BOOK_META, _BOOK_TEXT)
    await save_word(test_user["id"], "loquacious", BOOK_ID, 0, "A loquacious narrator.")
    resp = await client.get("/api/user/stats")
    activity = resp.json()["activity"]
    from datetime import timezone, datetime as _dt
    today = _dt.now(timezone.utc).date().isoformat()
    counts = {a["date"]: a["count"] for a in activity}
    assert today in counts
    assert counts[today] >= 1


# ── Reading progress hook ─────────────────────────────────────────────────────

async def test_progress_update_logs_reading_event(client, test_user, tmp_db):
    await save_book(BOOK_ID, _BOOK_META, _BOOK_TEXT)
    resp = await client.put(f"/api/user/reading-progress/{BOOK_ID}", json={"chapter_index": 3})
    assert resp.status_code == 200

    # Stats should now show streak = 1 (today has a reading event)
    stats_resp = await client.get("/api/user/stats")
    assert stats_resp.json()["streak"] == 1
    assert stats_resp.json()["totals"]["books_started"] == 1


async def test_progress_and_event_written_by_combined_function(test_user, tmp_db):
    """upsert_progress_and_log_event must atomically save both the bookmark and
    the analytics event in a single transaction.  This test would fail (ImportError)
    if the combined function did not exist — i.e. if progress and event were still
    written via two separate service calls."""
    from services.db import upsert_progress_and_log_event  # ImportError before the fix

    await save_book(BOOK_ID, _BOOK_META, _BOOK_TEXT)
    await upsert_progress_and_log_event(test_user["id"], BOOK_ID, 7)

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT chapter_index FROM user_reading_progress WHERE user_id=? AND book_id=?",
            (test_user["id"], BOOK_ID),
        ) as cur:
            progress_row = await cur.fetchone()
        async with db.execute(
            "SELECT count(*) FROM reading_history WHERE user_id=? AND book_id=?",
            (test_user["id"], BOOK_ID),
        ) as cur:
            event_count = (await cur.fetchone())[0]

    assert progress_row is not None and progress_row[0] == 7
    assert event_count == 1, "Analytics event must be saved in the same transaction as progress"


async def test_progress_update_multiple_chapters_all_logged(client, test_user, tmp_db):
    await save_book(BOOK_ID, _BOOK_META, _BOOK_TEXT)
    for ch in range(4):
        await client.put(f"/api/user/reading-progress/{BOOK_ID}", json={"chapter_index": ch})

    # 4 reading events → activity count for today >= 4
    resp = await client.get("/api/user/stats")
    from datetime import timezone, datetime as _dt
    today = _dt.now(timezone.utc).date().isoformat()
    activity = {a["date"]: a["count"] for a in resp.json()["activity"]}
    assert activity.get(today, 0) >= 4


# ── UTC vs local timezone regression ─────────────────────────────────────────

async def test_streak_uses_utc_not_local_date(test_user, tmp_db):
    """Regression #292: streak must compare against UTC date, not server-local date.

    Simulates a server in UTC-n: the event's UTC date is 2026-04-21 but the
    server's local date.today() returns 2026-04-20.  The streak must still be 1
    because the event is 'today' in UTC — the same reference frame SQLite uses.
    """
    await save_book(BOOK_ID, _BOOK_META, _BOOK_TEXT)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO reading_history (user_id, book_id, chapter_index, read_at)"
            " VALUES (?, ?, 0, ?)",
            (test_user["id"], BOOK_ID, "2026-04-21 12:00:00"),
        )
        await db.commit()

    with patch("datetime.date", _FakeDate), patch("datetime.datetime", _FakeDatetime):
        stats = await get_user_stats(test_user["id"])

    assert stats["streak"] == 1, (
        "Streak must use UTC date (2026-04-21); "
        "date.today() returning 2026-04-20 must not break it"
    )
