"""
Branch-coverage tests for:
  - services/gemini.py
  - services/seed_popular.py
"""

from __future__ import annotations

import asyncio
import json
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import services.db as db_module
from services.db import init_db, save_book
from services import gemini
from services.seed_popular import SeedPopularManager, _append_log, SeedPopularState


# ─────────────────────────────────────────────────────────────────────────────
# Shared DB fixture
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
async def tmp_db(monkeypatch, tmp_path):
    path = str(tmp_path / "svc_branches.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()
    return path


# ─────────────────────────────────────────────────────────────────────────────
# gemini.py — _client()
# ─────────────────────────────────────────────────────────────────────────────

def test_client_returns_genai_client():
    """Line 48: _client() wraps genai.Client(api_key=...)."""
    from google import genai as real_genai
    with patch.object(real_genai, "Client") as mock_cls:
        mock_cls.return_value = MagicMock()
        result = gemini._client("test-api-key")
        mock_cls.assert_called_once_with(api_key="test-api-key")
        assert result is mock_cls.return_value


# ─────────────────────────────────────────────────────────────────────────────
# gemini.py — _generate() branches
# ─────────────────────────────────────────────────────────────────────────────

def _make_generate_response(text=None, raise_value_error=False):
    """Build a minimal mock Gemini response for _generate tests."""
    resp = MagicMock()
    if raise_value_error:
        type(resp).text = PropertyMock(side_effect=ValueError("blocked"))
    else:
        resp.text = text
    return resp


async def test_generate_with_system_uses_system_instruction():
    """Lines 54-58: when system is non-empty, config includes system_instruction."""
    captured_config = {}

    async def fake_generate(*, model, contents, config):
        captured_config["config"] = config
        return _make_generate_response("result")

    class _Models:
        generate_content = AsyncMock(side_effect=fake_generate)

    class _Aio:
        models = _Models()

    class _Client:
        aio = _Aio()

    with patch("services.gemini._client", return_value=_Client()):
        result = await gemini._generate("key", system="Be helpful", prompt="Hello", max_tokens=512)

    assert result == "result"
    cfg = captured_config["config"]
    assert cfg.system_instruction == "Be helpful"
    assert cfg.max_output_tokens == 512


async def test_generate_without_system_omits_system_instruction():
    """Lines 53: when system is empty, config has no system_instruction."""
    captured_config = {}

    async def fake_generate(*, model, contents, config):
        captured_config["config"] = config
        return _make_generate_response("ok")

    class _Models:
        generate_content = AsyncMock(side_effect=fake_generate)

    class _Aio:
        models = _Models()

    class _Client:
        aio = _Aio()

    with patch("services.gemini._client", return_value=_Client()):
        result = await gemini._generate("key", system="", prompt="Hello")

    assert result == "ok"
    cfg = captured_config["config"]
    # No system_instruction attribute set when system="" branch taken
    assert not hasattr(cfg, "system_instruction") or cfg.system_instruction is None


async def test_generate_response_text_raises_value_error_returns_empty():
    """Lines 64-67: response.text raises ValueError → return ''."""
    resp = MagicMock()
    type(resp).text = PropertyMock(side_effect=ValueError("blocked"))

    async def fake_generate(*, model, contents, config):
        return resp

    class _Models:
        generate_content = AsyncMock(side_effect=fake_generate)

    class _Aio:
        models = _Models()

    class _Client:
        aio = _Aio()

    with patch("services.gemini._client", return_value=_Client()):
        result = await gemini._generate("key", system="", prompt="Hello")

    assert result == ""


# ─────────────────────────────────────────────────────────────────────────────
# gemini.py — translate_chapters_batch() branches
# ─────────────────────────────────────────────────────────────────────────────

def _build_client_mock(text, finish_reason="STOP", raise_text_error=False):
    """Return (patch_ctx, async_mock) for _client with a response."""
    resp = MagicMock()
    if raise_text_error:
        type(resp).text = PropertyMock(side_effect=ValueError("blocked"))
    else:
        resp.text = text

    cand = MagicMock()
    cand.finish_reason = finish_reason
    resp.candidates = [cand]

    async_mock = AsyncMock(return_value=resp)

    class _Models:
        generate_content = async_mock

    class _Aio:
        models = _Models()

    class _Client:
        aio = _Aio()

    return patch("services.gemini._client", return_value=_Client()), async_mock


async def test_translate_chapters_batch_empty_input_returns_empty():
    """Line 194: empty chapters list → return {} immediately."""
    result = await gemini.translate_chapters_batch("key", [], "en", "zh")
    assert result == {}


async def test_translate_chapters_batch_single_oversized_chapter_uses_chunks():
    """Lines 211->213: single chapter exceeding max_output_tokens calls _translate_chapter_in_chunks."""
    # Very large text so _estimate_output_tokens(text) > max_output_tokens=50
    big_text = " ".join(["word"] * 500)

    with patch("services.gemini._translate_chapter_in_chunks", new_callable=AsyncMock) as mock_chunks:
        mock_chunks.return_value = {0: ["chunked result"]}
        result = await gemini.translate_chapters_batch(
            "key", [(0, big_text)], "en", "zh",
            max_output_tokens=50,
        )

    mock_chunks.assert_awaited_once()
    assert result == {0: ["chunked result"]}


async def test_translate_chapters_batch_response_text_raises_value_error():
    """Lines 295-296: response.text raises ValueError → raw = ''."""
    ctx, _ = _build_client_mock("", raise_text_error=True)
    with ctx:
        with pytest.raises(ValueError, match="no <chapter> blocks"):
            await gemini.translate_chapters_batch(
                "key", [(0, "text"), (1, "text")], "en", "zh",
            )


async def test_translate_chapters_batch_candidates_raises_exception():
    """Lines 307-308: accessing finish_reason raises → pass (finish_reason stays '')."""
    resp = MagicMock()
    resp.text = "some text without chapter tags"
    # Make candidates[0] raise AttributeError
    resp.candidates = None  # indexing None raises TypeError

    async_mock = AsyncMock(return_value=resp)

    class _Models:
        generate_content = async_mock

    class _Aio:
        models = _Models()

    class _Client:
        aio = _Aio()

    with patch("services.gemini._client", return_value=_Client()):
        # Multi-chapter so fallback doesn't apply; raises ValueError for no blocks
        with pytest.raises(ValueError, match="no <chapter> blocks"):
            await gemini.translate_chapters_batch(
                "key", [(0, "t"), (1, "t")], "en", "zh",
            )


async def test_translate_chapters_batch_single_chapter_non_stop_finish_reason_raises():
    """Lines 326->333: single chapter, no <chapter> tags, finish_reason NOT ending in STOP → ValueError."""
    ctx, _ = _build_client_mock(
        "Some plain text without tags",
        finish_reason="MAX_TOKENS",
    )
    with ctx:
        with pytest.raises(ValueError, match="MAX_TOKENS"):
            await gemini.translate_chapters_batch(
                "key", [(0, "text")], "en", "zh",
            )


async def test_translate_chapters_batch_chapter_block_all_empty_paragraphs():
    """Lines 348->341: chapter block exists but all paragraphs are blank → not in result."""
    # A <chapter> block whose body has only blank lines → paragraphs list is empty
    response_text = '<chapter index="0">\n\n   \n\n   \n</chapter>'
    ctx, _ = _build_client_mock(response_text, finish_reason="STOP")
    with ctx:
        result = await gemini.translate_chapters_batch(
            "key", [(0, "source text")], "en", "zh",
        )
    # The block parsed but produced no paragraphs, so it's absent from result
    assert 0 not in result


# ─────────────────────────────────────────────────────────────────────────────
# gemini.py — _translate_chapter_in_chunks() branches
# ─────────────────────────────────────────────────────────────────────────────

async def test_translate_chapter_in_chunks_empty_text_returns_empty_list():
    """Line 377: empty paragraphs → return {chapter_index: []}."""
    result = await gemini._translate_chapter_in_chunks(
        "key", 3, "",  # empty text produces no paragraphs
        "en", "zh",
        prior_context="", model="m", max_output_tokens=8192,
    )
    assert result == {3: []}


async def test_translate_chapter_in_chunks_empty_sub_result_carries_unchanged():
    """Lines 398->381: sub-chunk returns empty list → out unchanged, carry unchanged."""
    # Make translate_chapters_batch return nothing for the chapter
    with patch("services.gemini.translate_chapters_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = {}  # empty → translated = []
        result = await gemini._translate_chapter_in_chunks(
            "key", 0, "Para one.\n\nPara two.",
            "en", "zh",
            prior_context="ctx", model="m", max_output_tokens=8192,
        )
    # translated was empty list, so out stays empty
    assert result == {0: []}


# ─────────────────────────────────────────────────────────────────────────────
# gemini.py — translate_text() empty paragraphs
# ─────────────────────────────────────────────────────────────────────────────

async def test_translate_text_empty_paragraphs_returns_empty():
    """Lines 420->423: text with no non-blank paragraphs → return []."""
    result = await gemini.translate_text("key", "\n\n\n   \n\n", "en", "zh")
    assert result == []


async def test_translate_text_empty_string_returns_empty():
    """Line 407-408: empty string → return []."""
    result = await gemini.translate_text("key", "", "en", "zh")
    assert result == []


# ─────────────────────────────────────────────────────────────────────────────
# seed_popular.py — stop() branches
# ─────────────────────────────────────────────────────────────────────────────

async def test_seed_popular_stop_when_no_event_and_no_task():
    """Lines 79->81, 81->exit: stop() is a no-op when both _stop_event and _task are None."""
    mgr = SeedPopularManager()
    assert mgr._stop_event is None
    assert mgr._task is None
    # Should complete without error
    await mgr.stop()


async def test_seed_popular_stop_sets_event_and_awaits_task(tmp_path):
    """Lines 79-85: stop() sets the event and awaits the task."""
    manifest = tmp_path / "popular_books.json"
    manifest.write_text(json.dumps([]))  # empty manifest → job finishes quickly

    mgr = SeedPopularManager()
    await mgr.start(str(manifest))
    # Wait for task to finish normally
    if mgr._task:
        await mgr._task

    # Now call stop on a completed task — should not raise
    await mgr.stop()


# ─────────────────────────────────────────────────────────────────────────────
# seed_popular.py — _run() branches
# ─────────────────────────────────────────────────────────────────────────────

async def test_seed_popular_manifest_not_found_sets_failed(tmp_path):
    """Lines 94-97: manifest file does not exist → status='failed'."""
    mgr = SeedPopularManager()
    await mgr.start(str(tmp_path / "nonexistent.json"))
    if mgr._task:
        await mgr._task

    state = mgr.state()
    assert state.status == "failed"
    assert "not found" in state.last_error


async def test_seed_popular_stop_event_cancels_job(tmp_path):
    """Lines 115-116: stop_event.is_set() mid-loop → status='cancelled', break."""
    # Manifest with books that would be downloaded
    books = [{"id": 1, "title": "Book One"}, {"id": 2, "title": "Book Two"}]
    manifest = tmp_path / "books.json"
    manifest.write_text(json.dumps(books))

    download_count = {"n": 0}

    async def fake_get_cached_book(book_id):
        return None  # nothing cached → all go into todo

    async def fake_get_book_meta(book_id):
        return {"title": f"Title {book_id}", "id": book_id}

    async def fake_get_book_text(book_id):
        return "text"

    async def fake_save_book(book_id, meta, text):
        download_count["n"] += 1

    mgr = SeedPopularManager()

    with patch("services.seed_popular.get_cached_book", side_effect=fake_get_cached_book), \
         patch("services.seed_popular.get_book_meta", side_effect=fake_get_book_meta), \
         patch("services.seed_popular.get_book_text", side_effect=fake_get_book_text), \
         patch("services.seed_popular.save_book", side_effect=fake_save_book), \
         patch("asyncio.sleep", new_callable=AsyncMock):

        await mgr.start(str(manifest))
        # Set the stop event immediately after the task starts
        if mgr._stop_event:
            mgr._stop_event.set()
        if mgr._task:
            await mgr._task

    state = mgr.state()
    assert state.status == "cancelled"


async def test_seed_popular_completed_when_not_cancelled(tmp_path):
    """Lines 164->166: all books done, not cancelled → status='completed'."""
    books = [{"id": 10, "title": "Good Book"}]
    manifest = tmp_path / "books.json"
    manifest.write_text(json.dumps(books))

    async def fake_get_cached_book(book_id):
        return None

    async def fake_get_book_meta(book_id):
        return {"title": "Good Book", "id": book_id}

    async def fake_get_book_text(book_id):
        return "Some book text."

    async def fake_save_book(book_id, meta, text):
        pass

    mgr = SeedPopularManager()

    with patch("services.seed_popular.get_cached_book", side_effect=fake_get_cached_book), \
         patch("services.seed_popular.get_book_meta", side_effect=fake_get_book_meta), \
         patch("services.seed_popular.get_book_text", side_effect=fake_get_book_text), \
         patch("services.seed_popular.save_book", side_effect=fake_save_book), \
         patch("asyncio.sleep", new_callable=AsyncMock):

        await mgr.start(str(manifest))
        if mgr._task:
            await mgr._task

    assert mgr.state().status == "completed"
    assert mgr.state().downloaded == 1


async def test_seed_popular_retry_backoff_on_failure(tmp_path):
    """Lines 127->147, 142-145: retry loop fires and sleeps on transient failure."""
    books = [{"id": 42, "title": "Retry Book"}]
    manifest = tmp_path / "books.json"
    manifest.write_text(json.dumps(books))

    call_count = {"n": 0}
    sleep_calls = []

    async def fake_get_cached_book(book_id):
        return None

    async def fake_get_book_meta(book_id):
        call_count["n"] += 1
        if call_count["n"] < 3:
            raise RuntimeError(f"transient error {call_count['n']}")
        return {"title": "Retry Book", "id": book_id}

    async def fake_get_book_text(book_id):
        return "text"

    async def fake_save_book(book_id, meta, text):
        pass

    async def fake_sleep(t):
        sleep_calls.append(t)

    mgr = SeedPopularManager()

    with patch("services.seed_popular.get_cached_book", side_effect=fake_get_cached_book), \
         patch("services.seed_popular.get_book_meta", side_effect=fake_get_book_meta), \
         patch("services.seed_popular.get_book_text", side_effect=fake_get_book_text), \
         patch("services.seed_popular.save_book", side_effect=fake_save_book), \
         patch("asyncio.sleep", side_effect=fake_sleep):

        await mgr.start(str(manifest))
        if mgr._task:
            await mgr._task

    # Succeeded on 3rd attempt → downloaded=1
    assert mgr.state().downloaded == 1
    # At least one backoff sleep should have fired (attempt < 2)
    backoff_sleeps = [s for s in sleep_calls if s in (2.0, 4.0)]
    assert len(backoff_sleeps) >= 1


async def test_seed_popular_all_retries_fail(tmp_path):
    """Lines 148-154: all 3 attempts fail → state.failed += 1, log entry added."""
    books = [{"id": 99, "title": "Bad Book"}]
    manifest = tmp_path / "books.json"
    manifest.write_text(json.dumps(books))

    async def fake_get_cached_book(book_id):
        return None

    async def always_fail(book_id):
        raise RuntimeError("always fails")

    mgr = SeedPopularManager()

    with patch("services.seed_popular.get_cached_book", side_effect=fake_get_cached_book), \
         patch("services.seed_popular.get_book_meta", side_effect=always_fail), \
         patch("asyncio.sleep", new_callable=AsyncMock):

        await mgr.start(str(manifest))
        if mgr._task:
            await mgr._task

    state = mgr.state()
    assert state.failed == 1
    assert any(e.get("event") == "failed" for e in state.log)


async def test_seed_popular_outer_exception_sets_failed(tmp_path):
    """Lines 168-172: unexpected exception in outer try → status='failed'."""
    books = [{"id": 7, "title": "Crash Book"}]
    manifest = tmp_path / "books.json"
    manifest.write_text(json.dumps(books))

    async def fake_get_cached_book(book_id):
        raise RuntimeError("unexpected DB error")

    mgr = SeedPopularManager()

    with patch("services.seed_popular.get_cached_book", side_effect=fake_get_cached_book):
        await mgr.start(str(manifest))
        if mgr._task:
            await mgr._task

    state = mgr.state()
    assert state.status == "failed"
    assert "unexpected DB error" in state.last_error


# ─────────────────────────────────────────────────────────────────────────────
# seed_popular.py — _append_log() trim branch
# ─────────────────────────────────────────────────────────────────────────────

def test_append_log_trims_when_over_max():
    """Line 178: log exceeds max_len → trim to last max_len entries."""
    state = SeedPopularState()
    for i in range(25):
        _append_log(state, {"i": i}, max_len=20)
    assert len(state.log) == 20
    # Should keep the LAST 20 entries
    assert state.log[0]["i"] == 5
    assert state.log[-1]["i"] == 24


def test_append_log_no_trim_when_under_max():
    """Trim branch not taken when under max_len."""
    state = SeedPopularState()
    for i in range(5):
        _append_log(state, {"i": i}, max_len=20)
    assert len(state.log) == 5

