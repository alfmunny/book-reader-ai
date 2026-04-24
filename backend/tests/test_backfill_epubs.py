"""Tests for scripts/backfill_epubs.py.

The script drives a stateless fetch-and-save loop, so we mock the Gutenberg
fetcher and assert on the DB writes plus the summary counts the runner
emits. No network is touched.
"""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, patch

import aiosqlite
import pytest

_SCRIPTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"
)
sys.path.insert(0, _SCRIPTS_DIR)

import backfill_epubs as backfill  # noqa: E402

import services.db as db_module  # noqa: E402
from services.db import init_db, save_book, save_book_epub  # noqa: E402


_META = {
    "title": "Sample",
    "authors": [],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}


@pytest.fixture
async def tmp_db(monkeypatch, tmp_path):
    path = str(tmp_path / "backfill.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()
    yield path


# ── list_books_missing_epub ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_missing_only_returns_books_without_stored_epub(tmp_db):
    # Seed two books; one has a stored EPUB, one does not.
    await save_book(1, _META, "text-1")
    await save_book(2, _META, "text-2")
    await save_book_epub(1, b"already-here", "http://example/1.epub")

    missing = await backfill.list_books_missing_epub()
    missing_ids = sorted(b["id"] for b in missing)
    assert missing_ids == [2]


@pytest.mark.asyncio
async def test_list_missing_excludes_uploaded_books(tmp_db):
    # list_cached_books filters source='upload'; the backfill inherits that.
    await save_book(1, _META, "text-1")
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO books (id, title, images, source) VALUES (99, 'T', '[]', 'upload')"
        )
        await db.commit()

    missing = await backfill.list_books_missing_epub()
    missing_ids = {b["id"] for b in missing}
    assert 1 in missing_ids
    assert 99 not in missing_ids


# ── backfill() success + skip paths ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_backfill_saves_when_upstream_has_epub(tmp_db):
    await save_book(1, _META, "text-1")

    fake_epub = (b"EPUB-BYTES", "http://example/1.epub")
    with patch.object(backfill, "get_book_epub", AsyncMock(return_value=fake_epub)):
        fetched, missing, errored = await backfill.backfill(delay=0)

    assert fetched == 1
    assert missing == 0
    assert errored == 0

    # Row was persisted.
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT book_id, epub_url FROM book_epubs") as cur:
            rows = await cur.fetchall()
    assert rows == [(1, "http://example/1.epub")]


@pytest.mark.asyncio
async def test_backfill_skips_when_no_upstream_epub(tmp_db):
    await save_book(1, _META, "text-1")

    with patch.object(backfill, "get_book_epub", AsyncMock(return_value=None)):
        fetched, missing, errored = await backfill.backfill(delay=0)

    assert fetched == 0
    assert missing == 1
    assert errored == 0

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT COUNT(*) FROM book_epubs") as cur:
            assert (await cur.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_backfill_counts_errors_without_crashing(tmp_db):
    await save_book(1, _META, "text-1")
    await save_book(2, _META, "text-2")

    side_effects = [RuntimeError("network"), (b"OK", "http://x")]
    with patch.object(backfill, "get_book_epub", AsyncMock(side_effect=side_effects)):
        fetched, missing, errored = await backfill.backfill(delay=0)

    assert errored == 1
    assert fetched == 1  # the second book still succeeded


@pytest.mark.asyncio
async def test_backfill_dry_run_does_not_write(tmp_db):
    await save_book(1, _META, "text-1")

    fake_epub = (b"would-write", "http://x")
    with patch.object(backfill, "get_book_epub", AsyncMock(return_value=fake_epub)):
        fetched, _, _ = await backfill.backfill(delay=0, dry_run=True)

    assert fetched == 1
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT COUNT(*) FROM book_epubs") as cur:
            assert (await cur.fetchone())[0] == 0, "dry-run must not write"


@pytest.mark.asyncio
async def test_backfill_limit_caps_processed_count(tmp_db):
    for i in (1, 2, 3, 4, 5):
        await save_book(i, _META, f"text-{i}")

    fake_epub = (b"OK", "http://x")
    with patch.object(backfill, "get_book_epub", AsyncMock(return_value=fake_epub)):
        fetched, _, _ = await backfill.backfill(limit=2, delay=0)

    assert fetched == 2
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT COUNT(*) FROM book_epubs") as cur:
            assert (await cur.fetchone())[0] == 2
