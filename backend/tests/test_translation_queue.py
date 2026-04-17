"""Tests for the always-on translation queue service."""

import json
import pytest
from unittest.mock import patch, AsyncMock
import aiosqlite

import services.db as db_module
from services.db import init_db, save_book, get_cached_translation, set_setting
from services.translation_queue import (
    enqueue,
    enqueue_for_book,
    list_queue,
    queue_summary,
    TranslationQueueWorker,
    SETTING_API_KEY,
    SETTING_AUTO_LANGS,
    SETTING_ENABLED,
)


BOOK_META = {
    "title": "Test Book",
    "authors": ["Author"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}

# Long enough for the splitter to accept (MIN_AVG_WORDS=150 per chapter).
_FILLER = " ".join(["filler"] * 200)
BOOK_TEXT = (
    f"CHAPTER I\n\n{_FILLER}.\n\nAnother paragraph here. {_FILLER}.\n\n"
    f"CHAPTER II\n\n{_FILLER}.\n\nStill more content. {_FILLER}.\n"
)


@pytest.fixture
async def tmp_db(monkeypatch, tmp_path):
    path = str(tmp_path / "queue-test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()
    return path


async def test_migration_creates_queue_tables(tmp_db):
    """Migration 008 must produce both translation_queue and app_settings."""
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('translation_queue', 'app_settings')"
        ) as cursor:
            rows = [row async for row in cursor]
    names = sorted(r[0] for r in rows)
    assert names == ["app_settings", "translation_queue"]


async def test_enqueue_idempotent(tmp_db):
    """Duplicate enqueue() calls for the same (book, chapter, lang) don't stack."""
    await enqueue(1, 0, "zh")
    await enqueue(1, 0, "zh")
    await enqueue(1, 0, "de")
    items = await list_queue()
    keys = [(i["book_id"], i["chapter_index"], i["target_language"]) for i in items]
    assert keys == [(1, 0, "zh"), (1, 0, "de")]


async def test_enqueue_for_book_skips_existing_translations(tmp_db):
    """Chapters that already have a cached translation should NOT be enqueued."""
    await save_book(1, BOOK_META, BOOK_TEXT)
    # Pre-cache chapter 0 → zh; enqueue_for_book should skip it.
    from services.db import save_translation
    await save_translation(1, 0, "zh", ["p1"])
    added = await enqueue_for_book(1, target_languages=["zh"])
    assert added == 1  # only chapter 1
    items = await list_queue()
    assert {(i["chapter_index"], i["target_language"]) for i in items} == {(1, "zh")}


async def test_auto_enqueue_on_save_book(tmp_db):
    """save_book should auto-enqueue chapters for every configured auto-translate language."""
    await set_setting(SETTING_AUTO_LANGS, json.dumps(["zh", "de"]))
    await save_book(42, BOOK_META, BOOK_TEXT)
    items = await list_queue()
    langs = {i["target_language"] for i in items}
    assert langs == {"zh", "de"}
    # 2 chapters × 2 langs = 4 items
    assert len(items) == 4


async def test_auto_enqueue_skips_source_language(tmp_db):
    """Enqueuing for the book's own source language is a waste — skip it."""
    await set_setting(SETTING_AUTO_LANGS, json.dumps(["en", "zh"]))
    await save_book(42, BOOK_META, BOOK_TEXT)
    items = await list_queue()
    assert all(i["target_language"] == "zh" for i in items)


async def test_queue_summary_counts(tmp_db):
    await save_book(7, BOOK_META, BOOK_TEXT)
    await enqueue_for_book(7, target_languages=["zh"])
    summary = await queue_summary()
    assert summary["counts"].get("pending") == 2
    assert 7 in summary["by_book"]
    assert summary["by_book"][7]["zh"]["pending"] == 2


async def test_worker_idles_without_api_key(tmp_db):
    """With no queue_api_key configured, the worker must idle — not crash."""
    await set_setting(SETTING_ENABLED, "1")
    await save_book(1, BOOK_META, BOOK_TEXT)
    await enqueue_for_book(1, target_languages=["zh"])
    w = TranslationQueueWorker()
    w._stop_event = __import__("asyncio").Event()
    await w._tick()
    assert w._state.idle is True
    assert "key" in w._state.waiting_reason.lower()


async def test_worker_idles_when_disabled(tmp_db):
    """Flipping queue_enabled=0 pauses the worker without requiring a restart."""
    from services.auth import encrypt_api_key
    await set_setting(SETTING_API_KEY, encrypt_api_key("fake-key"))
    await set_setting(SETTING_ENABLED, "0")
    await save_book(1, BOOK_META, BOOK_TEXT)
    await enqueue_for_book(1, target_languages=["zh"])
    w = TranslationQueueWorker()
    w._stop_event = __import__("asyncio").Event()
    await w._tick()
    assert w._state.idle is True
    assert w._state.enabled is False


async def test_worker_processes_batch(tmp_db):
    """With a (faked) API key and translator mocked, the worker translates and marks items done."""
    from services.auth import encrypt_api_key
    await set_setting(SETTING_API_KEY, encrypt_api_key("fake-key"))
    await set_setting(SETTING_ENABLED, "1")
    await save_book(1, BOOK_META, BOOK_TEXT)
    await enqueue_for_book(1, target_languages=["zh"])

    fake_return = {0: ["翻译段落一", "翻译段落二"], 1: ["翻译章节二"]}

    async def fake_translate(api_key, chapters, src, tgt, *, prior_context="", model=None):
        return fake_return

    w = TranslationQueueWorker()
    w._stop_event = __import__("asyncio").Event()
    with patch(
        "services.translation_queue.translate_chapters_batch",
        side_effect=fake_translate,
    ):
        with patch.object(
            __import__("services.translation_queue", fromlist=["AsyncRateLimiter"]).AsyncRateLimiter,
            "acquire",
            new=AsyncMock(return_value=None),
        ):
            await w._tick()

    # Both chapters should now be cached and queue rows marked done
    t0 = await get_cached_translation(1, 0, "zh")
    t1 = await get_cached_translation(1, 1, "zh")
    assert t0 == ["翻译段落一", "翻译段落二"]
    assert t1 == ["翻译章节二"]
    items = await list_queue(status="done")
    assert len(items) == 2
