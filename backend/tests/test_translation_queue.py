"""Tests for the always-on translation queue service."""

import json
import pytest
from unittest.mock import patch, AsyncMock
import aiosqlite

import services.db as db_module
from services.db import init_db, save_book, get_cached_translation, set_setting
from services.translation_queue import (
    clear_queue,
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


async def test_queued_by_tracks_attribution(tmp_db):
    """Admin-initiated enqueues record the admin label; auto-enqueues from
    save_book leave queued_by = NULL."""
    await save_book(1, BOOK_META, BOOK_TEXT)
    # Auto path (save_book with no languages configured) and manual path
    # with an attributed user.
    await enqueue(1, 0, "zh", queued_by="admin@example.com")
    await enqueue(1, 1, "zh")  # no queued_by → NULL
    rows = await list_queue()
    by_idx = {r["chapter_index"]: r for r in rows}
    assert by_idx[0]["queued_by"] == "admin@example.com"
    assert by_idx[1]["queued_by"] is None


async def test_list_queue_includes_book_title(tmp_db):
    """Queue items must carry the book title so the admin UI can identify rows."""
    await save_book(1, {**BOOK_META, "title": "Moby Dick"}, BOOK_TEXT)
    await enqueue(1, 0, "zh")
    # Orphan row — book never saved.
    await enqueue(999, 0, "zh")
    rows = await list_queue()
    by_book = {r["book_id"]: r for r in rows}
    assert by_book[1]["book_title"] == "Moby Dick"
    assert by_book[999]["book_title"] is None


async def test_worker_passes_model_max_output_tokens_setting(tmp_db):
    """SETTING_MAX_OUTPUT_TOKENS must drive both batch grouping and the
    max_output_tokens the Gemini call receives — this is how picking a big
    model like 2.5-pro lets us pack many chapters per batch."""
    from services.auth import encrypt_api_key
    from services.rate_limiter import AsyncRateLimiter
    from services.translation_queue import SETTING_MAX_OUTPUT_TOKENS
    await set_setting(SETTING_API_KEY, encrypt_api_key("fake-key"))
    await set_setting(SETTING_ENABLED, "1")
    await set_setting(SETTING_MAX_OUTPUT_TOKENS, "60000")
    await save_book(1, BOOK_META, BOOK_TEXT)
    await enqueue(1, 0, "zh")

    captured: dict = {}

    async def fake_translate(api_key, chapters, src, tgt, *, model=None, max_output_tokens=None, **kwargs):
        captured["max_output_tokens"] = max_output_tokens
        return {idx: ["ok"] for idx, _ in chapters}

    w = TranslationQueueWorker()
    w._stop_event = __import__("asyncio").Event()
    with patch("services.translation_queue.translate_chapters_batch", side_effect=fake_translate):
        with patch.object(AsyncRateLimiter, "acquire", new=AsyncMock(return_value=None)):
            await w._tick()
    assert captured.get("max_output_tokens") == 60000


async def test_worker_reconfigures_limiter_on_rate_setting_change(tmp_db):
    """Changing RPM/RPD in app_settings must propagate to the live limiter
    without restarting the worker — otherwise auto-rate-by-model wouldn't
    take effect for pending items."""
    from services.auth import encrypt_api_key
    from services.rate_limiter import AsyncRateLimiter
    await set_setting(SETTING_API_KEY, encrypt_api_key("fake-key"))
    await set_setting(SETTING_ENABLED, "1")
    await set_setting("queue_rpm", "15")
    await set_setting("queue_rpd", "1500")
    await save_book(1, BOOK_META, BOOK_TEXT)
    await enqueue(1, 0, "zh")

    async def fake_translate(*args, **kwargs):
        return {0: ["ok"]}

    w = TranslationQueueWorker()
    w._stop_event = __import__("asyncio").Event()
    with patch("services.translation_queue.translate_chapters_batch", side_effect=fake_translate):
        with patch.object(AsyncRateLimiter, "acquire", new=AsyncMock(return_value=None)):
            await w._tick()
    assert w._limiter is not None
    assert (w._limiter.rpm, w._limiter.rpd) == (15, 1500)

    # Admin "saves" a new model that pins different limits.
    await set_setting("queue_rpm", "2")
    await set_setting("queue_rpd", "50")
    await enqueue(1, 1, "zh")
    with patch("services.translation_queue.translate_chapters_batch", side_effect=fake_translate):
        with patch.object(AsyncRateLimiter, "acquire", new=AsyncMock(return_value=None)):
            await w._tick()
    assert (w._limiter.rpm, w._limiter.rpd) == (2, 50)


async def test_clear_queue_all_and_by_status(tmp_db):
    """clear_queue() wipes everything; clear_queue(status='failed') only wipes failed rows."""
    await enqueue(1, 0, "zh")
    await enqueue(1, 1, "zh")
    await enqueue(2, 0, "de")
    # Mark one as failed so we can test status filtering.
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "UPDATE translation_queue SET status='failed' WHERE book_id=2",
        )
        await db.commit()

    removed = await clear_queue(status="failed")
    assert removed == 1
    remaining = await list_queue()
    assert [(i["book_id"], i["chapter_index"]) for i in remaining] == [(1, 0), (1, 1)]

    removed_all = await clear_queue()
    assert removed_all == 2
    assert await list_queue() == []


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


async def test_failing_batch_bumps_priority_so_worker_moves_on(tmp_db, monkeypatch):
    """A book that keeps failing must not block other books. The worker
    should bump failing rows' priority so they drop behind fresh work."""
    from services.auth import encrypt_api_key
    from services.rate_limiter import AsyncRateLimiter
    import services.translation_queue as tq
    await set_setting(SETTING_API_KEY, encrypt_api_key("fake-key"))
    await set_setting(SETTING_ENABLED, "1")
    monkeypatch.setattr(tq, "RETRY_BACKOFF", (0.0, 0.0, 0.0, 0.0, 0.0))
    await save_book(1, BOOK_META, BOOK_TEXT)
    await enqueue(1, 0, "zh", priority=100)

    async def always_fail(*args, **kwargs):
        raise RuntimeError("safety blocked")

    w = TranslationQueueWorker()
    w._stop_event = __import__("asyncio").Event()
    with patch("services.translation_queue.translate_chapters_batch", side_effect=always_fail):
        with patch.object(AsyncRateLimiter, "acquire", new=AsyncMock(return_value=None)):
            await w._tick()

    rows = await list_queue()
    # Still pending (attempts=1, not yet MAX_ATTEMPTS) but priority bumped
    # from 100 to 1100 so it's behind anything freshly enqueued at 100.
    assert len(rows) == 1
    assert rows[0]["status"] == "pending"
    assert rows[0]["attempts"] == 1
    assert rows[0]["priority"] >= 1100


async def test_worker_exposes_retry_state_on_transient_error(tmp_db, monkeypatch):
    """A transient 503 must surface as retry_attempt/retry_reason, not last_error.
    Only after retries are exhausted does it become last_error."""
    from services.auth import encrypt_api_key
    import services.translation_queue as tq
    await set_setting(SETTING_API_KEY, encrypt_api_key("fake-key"))
    await set_setting(SETTING_ENABLED, "1")
    await save_book(1, BOOK_META, BOOK_TEXT)
    await enqueue(1, 0, "zh")

    # Fail every attempt — don't waste time sleeping in the test.
    monkeypatch.setattr(tq, "RETRY_BACKOFF", (0.0, 0.0, 0.0, 0.0, 0.0))

    async def always_503(*args, **kwargs):
        raise RuntimeError("503 UNAVAILABLE. model overloaded")

    # kwargs signature compatibility — translate_chapters_batch now receives
    # max_output_tokens too.

    w = TranslationQueueWorker()
    w._stop_event = __import__("asyncio").Event()
    with patch("services.translation_queue.translate_chapters_batch", side_effect=always_503):
        with patch.object(
            __import__("services.translation_queue", fromlist=["AsyncRateLimiter"]).AsyncRateLimiter,
            "acquire",
            new=AsyncMock(return_value=None),
        ):
            await w._tick()

    # After exhaustion: last_error set, retry_attempt cleared back to 0.
    assert "503" in w._state.last_error
    assert w._state.retry_attempt == 0
    # The log must record each retry so the admin can see the timeline.
    retry_events = [e for e in w._state.log if e.get("event") == "retry"]
    assert len(retry_events) >= 1
    assert "503" in retry_events[-1]["error"]


async def test_worker_skips_already_cached_chapter(tmp_db):
    """If a translation lands between enqueue and claim, the worker must
    NOT re-translate — that would waste tokens on work already done."""
    from services.auth import encrypt_api_key
    from services.db import save_translation
    await set_setting(SETTING_API_KEY, encrypt_api_key("fake-key"))
    await set_setting(SETTING_ENABLED, "1")
    await save_book(1, BOOK_META, BOOK_TEXT)
    # Enqueue both chapters, but pretend chapter 0 got translated by another
    # path (e.g. reader on-demand call) before the worker gets to it.
    await enqueue(1, 0, "zh")
    await enqueue(1, 1, "zh")
    await save_translation(1, 0, "zh", ["already done"])

    called_with: list = []

    async def fake_translate(api_key, chapters, src, tgt, *, prior_context="", model=None, **kwargs):
        called_with.append(chapters)
        return {idx: [f"new-{idx}"] for idx, _ in chapters}

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

    # Only chapter 1 should have been sent to Gemini
    assert len(called_with) == 1
    sent_chapter_indices = [idx for idx, _ in called_with[0]]
    assert sent_chapter_indices == [1]
    # Cached translation for chapter 0 is untouched
    existing = await get_cached_translation(1, 0, "zh")
    assert existing == ["already done"]
    # Both queue items are marked done (chapter 0 skipped, chapter 1 translated)
    done = await list_queue(status="done")
    assert len(done) == 2


async def test_worker_processes_batch(tmp_db):
    """With a (faked) API key and translator mocked, the worker translates and marks items done."""
    from services.auth import encrypt_api_key
    await set_setting(SETTING_API_KEY, encrypt_api_key("fake-key"))
    await set_setting(SETTING_ENABLED, "1")
    await save_book(1, BOOK_META, BOOK_TEXT)
    await enqueue_for_book(1, target_languages=["zh"])

    fake_return = {0: ["翻译段落一", "翻译段落二"], 1: ["翻译章节二"]}

    async def fake_translate(api_key, chapters, src, tgt, *, prior_context="", model=None, **kwargs):
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
