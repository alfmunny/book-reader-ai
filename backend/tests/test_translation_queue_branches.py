"""
Branch-coverage tests for services/translation_queue.py.

Each test targets a specific uncovered line or branch identified in the
coverage report. Tests are kept small and focused — one branch per test.
"""

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite

import services.db as db_module
from services.db import init_db, save_book, save_translation, set_setting
from services.translation_queue import (
    QueueRow,
    TranslationQueueWorker,
    SETTING_API_KEY,
    SETTING_AUTO_LANGS,
    SETTING_ENABLED,
    estimate_queue_cost,
    enqueue,
    rescan_for_missing_translations,
    reset_stale_running_rows,
    cleanup_orphan_done_rows,
)


# ── Shared fixtures ───────────────────────────────────────────────────────────

BOOK_META = {
    "title": "Branch Test Book",
    "authors": ["Author"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}

_FILLER = " ".join(["word"] * 200)
BOOK_TEXT = (
    f"CHAPTER I\n\n{_FILLER}.\n\nMore text. {_FILLER}.\n\n"
    f"CHAPTER II\n\n{_FILLER}.\n\nStill more. {_FILLER}.\n"
)


@pytest.fixture(autouse=True)
async def tmp_db(monkeypatch, tmp_path):
    path = str(tmp_path / "test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    import services.translation_queue as tq_module
    monkeypatch.setattr(tq_module.db_module, "DB_PATH", path)
    # Prevent any EPUB DB/network calls in split_with_html_preference
    from unittest.mock import AsyncMock as _AsyncMock
    monkeypatch.setattr("services.db.get_book_epub_bytes", _AsyncMock(return_value=None))
    monkeypatch.setattr("services.book_chapters._background_fetch_epub", _AsyncMock())
    from services.book_chapters import clear_cache
    clear_cache()
    await init_db()


# ── Line 325: estimate_queue_cost — book_id in queue but not in books ─────────

async def test_estimate_queue_cost_skips_orphan_book_id():
    """A pending queue row for a book_id that doesn't exist in the books
    table should be skipped gracefully (the continue on line 325)."""
    # Insert a queue row for book_id=9999 which has no books entry.
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            """INSERT INTO translation_queue
                   (book_id, chapter_index, target_language, priority, status)
               VALUES (9999, 0, 'zh', 100, 'pending')"""
        )
        await db.commit()

    result = await estimate_queue_cost()
    # The orphan entry must not crash — pending_items may be 1 (counted before
    # the skip) but pending_books must be 0 because the book has no text.
    assert result["pending_books"] == 0


# ── Lines 396/400: rescan returns 0 when langs or books are absent ────────────

async def test_rescan_returns_zero_with_no_auto_langs():
    """No configured languages → early return 0 (line 396 branch)."""
    await save_book(1, BOOK_META, BOOK_TEXT)
    # no SETTING_AUTO_LANGS set → get_auto_languages returns []
    result = await rescan_for_missing_translations()
    assert result == 0


async def test_rescan_returns_zero_with_no_books():
    """No cached books → early return 0 (line 400 branch)."""
    await set_setting(SETTING_AUTO_LANGS, json.dumps(["zh"]))
    # No books saved
    result = await rescan_for_missing_translations()
    assert result == 0


# ── Lines 416/429: rescan already_covered set population ─────────────────────

async def test_rescan_skips_already_covered_via_translations_table():
    """Book+lang already in translations → already_covered set populated
    (line 416), so no new rows enqueued."""
    await save_book(1, BOOK_META, BOOK_TEXT)
    await set_setting(SETTING_AUTO_LANGS, json.dumps(["zh"]))

    # Pre-populate translations for ALL chapters of book 1 → zh.
    # With 2 chapters from BOOK_TEXT, save both:
    from services.splitter import Chapter
    fake_chapters = [
        Chapter(title="Ch1", text=_FILLER),
        Chapter(title="Ch2", text=_FILLER),
    ]
    with patch(
        "services.book_chapters.split_with_html_preference",
        new_callable=AsyncMock,
        return_value=fake_chapters,
    ):
        await save_translation(1, 0, "zh", ["p1"])
        await save_translation(1, 1, "zh", ["p2"])
        added = await rescan_for_missing_translations()

    # Both chapters are already translated → nothing new to enqueue.
    assert added == 0


async def test_rescan_skips_already_covered_via_queue_table():
    """Book+lang already in translation_queue → already_covered set populated
    (line 429), so rescan adds 0 new rows."""
    await save_book(1, BOOK_META, BOOK_TEXT)
    await set_setting(SETTING_AUTO_LANGS, json.dumps(["zh"]))

    # Pre-populate queue for book 1 → zh.
    await enqueue(1, 0, "zh")
    await enqueue(1, 1, "zh")

    from services.splitter import Chapter
    fake_chapters = [
        Chapter(title="Ch1", text=_FILLER),
        Chapter(title="Ch2", text=_FILLER),
    ]
    with patch(
        "services.book_chapters.split_with_html_preference",
        new_callable=AsyncMock,
        return_value=fake_chapters,
    ):
        added = await rescan_for_missing_translations()

    assert added == 0


# ── Lines 641-649: Worker.start() body ───────────────────────────────────────

async def test_worker_start_sets_state_and_creates_task():
    """start() must populate _state.running, create _stop_event, and spawn a task."""
    w = TranslationQueueWorker()
    assert not w.is_running()
    await w.start()
    try:
        assert w.is_running()
        assert w._stop_event is not None
        assert w._state.running is True
        assert w._state.started_at is not None
    finally:
        await w.stop()


async def test_worker_start_is_idempotent():
    """Calling start() when already running must not create a second task."""
    w = TranslationQueueWorker()
    await w.start()
    try:
        first_task = w._task
        await w.start()  # should no-op
        assert w._task is first_task
    finally:
        await w.stop()


# ── Lines 652-660: Worker.stop() body ────────────────────────────────────────

async def test_worker_stop_clears_running_state():
    """stop() must set the stop event, wait for the task, and mark running=False."""
    w = TranslationQueueWorker()
    await w.start()
    assert w.is_running()
    await w.stop()
    assert w._state.running is False


async def test_worker_stop_when_not_started_does_not_crash():
    """Calling stop() on a worker that was never started is safe."""
    w = TranslationQueueWorker()
    await w.stop()  # must not raise


# ── Lines 673-711: Worker._run() startup housekeeping ────────────────────────

async def test_worker_run_logs_stale_row_reset():
    """When there are stale 'running' rows on worker start, _run() must
    log a startup_reset_stale event (stale > 0 branch, line 690-691)."""
    # Create a stale running row BEFORE starting the worker.
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            """INSERT INTO translation_queue
                   (book_id, chapter_index, target_language, priority, status)
               VALUES (1, 0, 'zh', 100, 'running')"""
        )
        await db.commit()

    w = TranslationQueueWorker()
    # Give the worker just enough time to finish startup housekeeping then stop.
    await w.start()
    await asyncio.sleep(0.05)
    await w.stop()

    events = [e.get("event") for e in w._state.log]
    assert "startup_reset_stale" in events


async def test_worker_run_logs_orphan_done_rows_cleanup():
    """When there are orphan 'done' rows on worker start, _run() must
    log a startup_cleanup_done_rows event (orphans > 0 branch, lines 693-695)."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            """INSERT INTO translation_queue
                   (book_id, chapter_index, target_language, priority, status)
               VALUES (1, 0, 'zh', 100, 'done')"""
        )
        await db.commit()

    w = TranslationQueueWorker()
    await w.start()
    await asyncio.sleep(0.05)
    await w.stop()

    events = [e.get("event") for e in w._state.log]
    assert "startup_cleanup_done_rows" in events


async def test_worker_run_startup_exception_is_non_fatal():
    """If reset_stale_running_rows raises, _run() must log a warning but
    continue to the main loop (lines 697-700)."""
    import services.translation_queue as tq_module

    async def boom() -> int:
        raise RuntimeError("simulated housekeeping failure")

    w = TranslationQueueWorker()
    with patch.object(tq_module, "reset_stale_running_rows", side_effect=boom):
        await w.start()
        await asyncio.sleep(0.05)
        await w.stop()

    # Worker must still reach ready state (startup_phase is set in finally block).
    assert w._state.startup_phase == "ready"


# ── Lines 785-787: _claim_next_batch ROLLBACK path ───────────────────────────

async def test_claim_next_batch_rolls_back_on_exception():
    """If an exception occurs during the transaction, ROLLBACK fires and
    the exception is re-raised (lines 785-787)."""
    await enqueue(1, 0, "zh")

    w = TranslationQueueWorker()

    # Force an exception inside the try block by making the UPDATE fail.
    # We patch db.execute to raise when asked to UPDATE.
    original_connect = aiosqlite.connect

    class _FakeDb:
        """Wraps a real aiosqlite connection but raises on UPDATE."""
        def __init__(self, real_db):
            self._db = real_db
            self.row_factory = None

        def __setattr__(self, name, value):
            if name in ("_db",):
                object.__setattr__(self, name, value)
                return
            if name == "row_factory":
                object.__setattr__(self, name, value)
                self._db.row_factory = value
                return
            setattr(self._db, name, value)

        def execute(self, sql, *args, **kwargs):
            upper = sql.strip().upper()
            if upper.startswith("UPDATE"):
                raise RuntimeError("forced UPDATE failure")
            return self._db.execute(sql, *args, **kwargs)

        async def __aenter__(self):
            await self._db.__aenter__()
            return self

        async def __aexit__(self, *exc_info):
            return await self._db.__aexit__(*exc_info)

    def _patched_connect(path, **kwargs):
        real_ctx = original_connect(path, **kwargs)

        class _Wrapper:
            async def __aenter__(self_inner):
                real_db = await real_ctx.__aenter__()
                return _FakeDb(real_db)

            async def __aexit__(self_inner, *exc_info):
                return await real_ctx.__aexit__(*exc_info)

        return _Wrapper()

    with patch("aiosqlite.connect", side_effect=_patched_connect):
        with pytest.raises(RuntimeError, match="forced UPDATE failure"):
            await w._claim_next_batch()


# ── Lines 831-833: _process_batch_inner — book not in cache ──────────────────

async def test_process_batch_inner_skips_when_book_not_in_cache():
    """When get_cached_book returns None, all items must be marked skipped."""
    w = TranslationQueueWorker()
    row = QueueRow(
        id=1, book_id=9999, chapter_index=0,
        target_language="zh", status="running",
        priority=100, attempts=0,
    )
    # Insert the row so _mark_skipped has a real DB row to update.
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO translation_queue (id, book_id, chapter_index, target_language, priority, status) "
            "VALUES (1, 9999, 0, 'zh', 100, 'running')"
        )
        await db.commit()

    handled = []

    async def mock_mark_skipped(rows, *, reason):
        handled.extend(rows)

    with patch.object(w, "_mark_skipped", side_effect=mock_mark_skipped):
        with patch("services.translation_queue.get_cached_book", new_callable=AsyncMock, return_value=None):
            await w._process_batch_inner([row], "fake-key", lambda r: None)

    assert row in handled


# ── Lines 836-838: same source/target language → skip ────────────────────────

async def test_process_batch_inner_skips_same_source_target_language():
    """If source language equals target language, items must be marked skipped."""
    # Book with languages=["zh"]
    meta = {**BOOK_META, "languages": ["zh"]}
    await save_book(1, meta, BOOK_TEXT)

    w = TranslationQueueWorker()

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO translation_queue (id, book_id, chapter_index, target_language, priority, status) "
            "VALUES (1, 1, 0, 'zh', 100, 'running')"
        )
        await db.commit()

    row = QueueRow(
        id=1, book_id=1, chapter_index=0,
        target_language="zh", status="running",
        priority=100, attempts=0,
    )

    skipped = []

    async def mock_mark_skipped(rows, *, reason):
        skipped.extend(rows)

    with patch.object(w, "_mark_skipped", side_effect=mock_mark_skipped):
        await w._process_batch_inner([row], "fake-key", lambda r: None)

    assert row in skipped


# ── Lines 848-850: chapter_index out of range → _mark_failed ─────────────────

async def test_process_batch_inner_fails_out_of_range_chapter():
    """A chapter_index beyond the last chapter must be marked failed."""
    await save_book(1, BOOK_META, BOOK_TEXT)

    w = TranslationQueueWorker()

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO translation_queue (id, book_id, chapter_index, target_language, priority, status) "
            "VALUES (1, 1, 999, 'zh', 100, 'running')"
        )
        await db.commit()

    row = QueueRow(
        id=1, book_id=1, chapter_index=999,
        target_language="zh", status="running",
        priority=100, attempts=0,
    )

    failed = []

    async def mock_mark_failed(rows, reason):
        failed.extend(rows)

    with patch.object(w, "_mark_failed", side_effect=mock_mark_failed):
        await w._process_batch_inner([row], "fake-key", lambda r: None)

    assert row in failed


# ── Lines 853-855: empty chapter text → _mark_done ───────────────────────────

async def test_process_batch_inner_marks_done_for_empty_chapter():
    """A chapter with only whitespace text should be marked done without calling
    the translator."""
    from services.splitter import Chapter
    await save_book(1, BOOK_META, BOOK_TEXT)

    w = TranslationQueueWorker()

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO translation_queue (id, book_id, chapter_index, target_language, priority, status) "
            "VALUES (1, 1, 0, 'zh', 100, 'running')"
        )
        await db.commit()

    row = QueueRow(
        id=1, book_id=1, chapter_index=0,
        target_language="zh", status="running",
        priority=100, attempts=0,
    )

    done = []

    async def mock_mark_done(rows):
        done.extend(rows)

    fake_chapters = [Chapter(title="Empty", text="   ")]

    with patch.object(w, "_mark_done", side_effect=mock_mark_done):
        with patch(
            "services.book_chapters.split_with_html_preference",
            new_callable=AsyncMock,
            return_value=fake_chapters,
        ):
            await w._process_batch_inner([row], "fake-key", lambda r: None)

    assert row in done


# ── Lines 860-869: existing cached translation → _mark_done + log ────────────

async def test_process_batch_inner_marks_done_for_existing_translation():
    """A chapter with an already-cached translation must be marked done and
    a 'skipped_cached' event appended to the log."""
    from services.splitter import Chapter
    await save_book(1, BOOK_META, BOOK_TEXT)
    await save_translation(1, 0, "zh", ["already here"])

    w = TranslationQueueWorker()

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        # save_translation above may have removed a queue row via mark_queue_row_done;
        # re-insert so _mark_done has something to delete.
        await db.execute(
            "INSERT OR REPLACE INTO translation_queue "
            "(id, book_id, chapter_index, target_language, priority, status) "
            "VALUES (1, 1, 0, 'zh', 100, 'running')"
        )
        await db.commit()

    row = QueueRow(
        id=1, book_id=1, chapter_index=0,
        target_language="zh", status="running",
        priority=100, attempts=0,
    )

    fake_chapters = [Chapter(title="Ch1", text="some real text")]

    done = []

    async def mock_mark_done(rows):
        done.extend(rows)

    with patch.object(w, "_mark_done", side_effect=mock_mark_done):
        with patch(
            "services.book_chapters.split_with_html_preference",
            new_callable=AsyncMock,
            return_value=fake_chapters,
        ):
            await w._process_batch_inner([row], "fake-key", lambda r: None)

    assert row in done
    events = [e.get("event") for e in w._state.log]
    assert "skipped_cached" in events


# ── Line 875: no works remaining → early return ──────────────────────────────

async def test_process_batch_inner_early_return_when_no_works():
    """If every item in the batch is already handled (cached/empty/failed),
    _translate_with_retry must NOT be called (early return on line 875)."""
    from services.splitter import Chapter
    await save_book(1, BOOK_META, BOOK_TEXT)

    w = TranslationQueueWorker()

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO translation_queue (id, book_id, chapter_index, target_language, priority, status) "
            "VALUES (1, 1, 0, 'zh', 100, 'running')"
        )
        await db.commit()

    row = QueueRow(
        id=1, book_id=1, chapter_index=0,
        target_language="zh", status="running",
        priority=100, attempts=0,
    )

    # Empty chapter → gets marked done; works list stays empty → early return.
    fake_chapters = [Chapter(title="Empty", text="   ")]
    called = []

    async def mock_translate_with_retry(**kwargs):
        called.append(True)
        return {}

    with patch.object(w, "_translate_with_retry", side_effect=mock_translate_with_retry):
        with patch(
            "services.book_chapters.split_with_html_preference",
            new_callable=AsyncMock,
            return_value=fake_chapters,
        ):
            await w._process_batch_inner([row], "fake-key", lambda r: None)

    assert called == [], "_translate_with_retry should NOT be called when works is empty"


# ── Line 997: all models at daily cap → RuntimeError ─────────────────────────

async def test_call_api_with_chain_raises_when_all_models_exhausted(monkeypatch):
    """When every model's daily_remaining() is 0, _call_api_with_chain must
    raise RuntimeError('all models in chain are at their daily cap')."""
    import services.translation_queue as tq_module
    from services.rate_limiter import AsyncRateLimiter

    w = TranslationQueueWorker()
    monkeypatch.setattr(tq_module, "RETRY_BACKOFF", ())

    with patch.object(AsyncRateLimiter, "daily_remaining", new_callable=AsyncMock, return_value=0):
        with pytest.raises(RuntimeError, match="daily cap"):
            await w._call_api_with_chain(
                chain=["gemini-2.5-flash"],
                chapters=[(0, "hello")],
                api_key="fake",
                source_language="en",
                target_language="zh",
                max_output_tokens=1000,
            )


# ── Lines 1015/1017-1023: _translate_with_retry breaks on stop_event ─────────

async def test_translate_with_retry_breaks_on_stop_event(monkeypatch):
    """If _stop_event is already set before entering the retry loop, the loop
    must break immediately without calling _call_api_with_chain."""
    import services.translation_queue as tq_module
    monkeypatch.setattr(tq_module, "RETRY_BACKOFF", ())

    w = TranslationQueueWorker()
    stop = asyncio.Event()
    stop.set()
    w._stop_event = stop

    called = []

    async def mock_api_call(**kwargs):
        called.append(True)
        return {}

    with patch.object(w, "_call_api_with_chain", side_effect=mock_api_call):
        result = await w._translate_with_retry(
            chapters=[(0, "text")],
            source_language="en",
            target_language="zh",
            api_key="fake",
            chain=["gemini-2.5-flash"],
        )

    assert called == []
    assert result == {}


async def test_translate_with_retry_breaks_mid_retry_when_stop_event_set(monkeypatch):
    """Stop event set between attempts causes the loop to break after the
    delay block (lines 1017-1023 branch with delay > 0)."""
    import services.translation_queue as tq_module
    monkeypatch.setattr(tq_module, "RETRY_BACKOFF", (0.0,))

    w = TranslationQueueWorker()
    stop = asyncio.Event()
    w._stop_event = stop
    call_count = [0]

    async def mock_api_call(**kwargs):
        call_count[0] += 1
        if call_count[0] == 1:
            # After the first failure, set stop event — loop should break
            # at the top of the second iteration (delay=0.0, still checks).
            stop.set()
            raise RuntimeError("fail")
        return {0: ["ok"]}

    with patch.object(w, "_call_api_with_chain", side_effect=mock_api_call):
        result = await w._translate_with_retry(
            chapters=[(0, "text")],
            source_language="en",
            target_language="zh",
            api_key="fake",
            chain=["gemini-2.5-flash"],
        )

    # Only one attempt was made; the loop broke before the retry.
    assert call_count[0] == 1
    assert result == {}


# ── Lines 1055->1061: last_err path after all attempts failed ─────────────────

async def test_translate_with_retry_sets_last_error_after_all_attempts(monkeypatch):
    """After all retry attempts fail, last_err must be written to _state.last_error
    and retry counters cleared (lines 1055-1060)."""
    import services.translation_queue as tq_module
    monkeypatch.setattr(tq_module, "RETRY_BACKOFF", (0.0,))

    w = TranslationQueueWorker()
    w._stop_event = asyncio.Event()  # not set

    async def always_fail(**kwargs):
        raise RuntimeError("permanent failure")

    with patch.object(w, "_call_api_with_chain", side_effect=always_fail):
        result = await w._translate_with_retry(
            chapters=[(0, "text")],
            source_language="en",
            target_language="zh",
            api_key="fake",
            chain=["gemini-2.5-flash"],
        )

    assert result == {}
    assert "permanent failure" in w._state.last_error
    assert w._state.retry_attempt == 0
    assert w._state.retry_delay_seconds == 0.0
    assert w._state.retry_next_at is None


# ── Line 1070: _mark_done with empty list → early return ─────────────────────

async def test_mark_done_with_empty_list_is_noop():
    """_mark_done([]) must return immediately without touching the DB."""
    w = TranslationQueueWorker()
    # Should not raise and should not touch the DB.
    await w._mark_done([])


# ── Lines 1081, 1084-1085: _mark_skipped and _mark_failed ────────────────────

async def test_mark_skipped_updates_status():
    """_mark_skipped must call _update_status with status='skipped'."""
    w = TranslationQueueWorker()

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO translation_queue (id, book_id, chapter_index, target_language, priority, status) "
            "VALUES (1, 1, 0, 'zh', 100, 'running')"
        )
        await db.commit()

    row = QueueRow(id=1, book_id=1, chapter_index=0, target_language="zh",
                   status="running", priority=100, attempts=0)
    await w._mark_skipped([row], reason="unit test")

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT status FROM translation_queue WHERE id=1"
        ) as cursor:
            result = await cursor.fetchone()
    assert result[0] == "skipped"


async def test_mark_failed_increments_chapters_failed():
    """_mark_failed must increment _state.chapters_failed by the number of rows."""
    w = TranslationQueueWorker()

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO translation_queue (id, book_id, chapter_index, target_language, priority, status) "
            "VALUES (1, 1, 0, 'zh', 100, 'running')"
        )
        await db.execute(
            "INSERT INTO translation_queue (id, book_id, chapter_index, target_language, priority, status) "
            "VALUES (2, 1, 1, 'zh', 100, 'running')"
        )
        await db.commit()

    rows = [
        QueueRow(id=1, book_id=1, chapter_index=0, target_language="zh",
                 status="running", priority=100, attempts=0),
        QueueRow(id=2, book_id=1, chapter_index=1, target_language="zh",
                 status="running", priority=100, attempts=0),
    ]
    initial = w._state.chapters_failed
    await w._mark_failed(rows, "unit test failure")
    assert w._state.chapters_failed == initial + 2


# ── Lines 1090-1101: _update_status body ─────────────────────────────────────

async def test_update_status_updates_db_row():
    """_update_status must write the new status and error to the DB."""
    w = TranslationQueueWorker()

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO translation_queue (id, book_id, chapter_index, target_language, priority, status) "
            "VALUES (1, 1, 0, 'zh', 100, 'running')"
        )
        await db.commit()

    row = QueueRow(id=1, book_id=1, chapter_index=0, target_language="zh",
                   status="running", priority=100, attempts=0)
    await w._update_status([row], "failed", error="something went wrong")

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT status, last_error FROM translation_queue WHERE id=1"
        ) as cursor:
            result = await cursor.fetchone()
    assert result[0] == "failed"
    assert result[1] == "something went wrong"


async def test_update_status_empty_list_is_noop():
    """_update_status([]) must return immediately."""
    w = TranslationQueueWorker()
    await w._update_status([], "failed")  # must not raise


# ── Line 1120: _bump_attempt — new_status=='failed' → chapters_failed += 1 ───

async def test_bump_attempt_increments_chapters_failed_at_max_attempts():
    """When new_attempts >= MAX_ATTEMPTS, _bump_attempt sets status='failed'
    and increments chapters_failed."""
    from services.translation_queue import MAX_ATTEMPTS

    w = TranslationQueueWorker()

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO translation_queue "
            "(id, book_id, chapter_index, target_language, priority, status, attempts) "
            "VALUES (1, 1, 0, 'zh', 100, 'running', ?)",
            (MAX_ATTEMPTS - 1,),
        )
        await db.commit()

    row = QueueRow(
        id=1, book_id=1, chapter_index=0, target_language="zh",
        status="running", priority=100, attempts=MAX_ATTEMPTS - 1,
    )
    initial = w._state.chapters_failed
    await w._bump_attempt(row, "too many attempts")
    assert w._state.chapters_failed == initial + 1

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT status FROM translation_queue WHERE id=1"
        ) as cursor:
            result = await cursor.fetchone()
    assert result[0] == "failed"


# ── Lines 1130-1132: _load_api_key — decrypt fails → return None ─────────────

async def test_load_api_key_returns_none_when_decrypt_fails():
    """If decrypt_api_key raises, _load_api_key must return None (not re-raise)."""
    # Store a garbage encrypted value that Fernet cannot decrypt.
    await set_setting(SETTING_API_KEY, "not-a-valid-fernet-token")

    w = TranslationQueueWorker()
    result = await w._load_api_key()
    assert result is None


# ── Lines 1138-1139: _sleep_or_wake with _stop_event is None ─────────────────

async def test_sleep_or_wake_with_no_stop_event():
    """When _stop_event is None, _sleep_or_wake should just asyncio.sleep
    for the given duration and return."""
    w = TranslationQueueWorker()
    w._stop_event = None
    # Use a tiny duration — we just want to reach the return path.
    await w._sleep_or_wake(0.001)
    # If we reach here without error, the branch was covered.


# ── Line 1150: _append_log trims when log exceeds max_len ────────────────────

def test_append_log_trims_to_max_len():
    """After 101+ appends with max_len=100, the log must be capped at 100 entries."""
    w = TranslationQueueWorker()
    for i in range(105):
        w._append_log({"event": "tick", "n": i}, max_len=100)
    assert len(w._state.log) == 100
    # The log should contain the LAST 100 entries (not the first).
    assert w._state.log[0]["n"] == 5
    assert w._state.log[-1]["n"] == 104
