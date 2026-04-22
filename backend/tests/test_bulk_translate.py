"""Tests for services/bulk_translate.py — job manager, planning, batching."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

import services.db as db_module
from services.db import init_db, save_book, save_translation
from services import bulk_translate
from services.bulk_translate import (
    BookPlan,
    ChapterWork,
    BulkTranslationManager,
    plan_work,
    group_chapters_for_batch,
    create_job,
    load_latest_job,
    update_job,
)


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
async def tmp_db(monkeypatch, tmp_path):
    path = str(tmp_path / "bulk.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()
    return path


EN_BOOK_META = {
    "id": 1342,
    "title": "Pride and Prejudice",
    "authors": ["Jane Austen"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}

# Two-chapter text so build_chapters finds 2 chapters
TWO_CHAPTER_TEXT = (
    "CHAPTER I\n\n"
    + ("The brave knight rode his horse across the meadow. " * 40)
    + "\n\nCHAPTER II\n\n"
    + ("She waited by the oak tree as the sun set slowly. " * 40)
)


# ── group_chapters_for_batch ────────────────────────────────────────────────

def test_group_chapters_packs_multiple_small_chapters():
    """Several small chapters should fit in one batch."""
    small = [ChapterWork(1, "Book", "en", i, "word " * 100) for i in range(3)]
    batches = group_chapters_for_batch(small, max_output_tokens=10_000)
    assert len(batches) == 1
    assert len(batches[0]) == 3


def test_group_chapters_splits_when_budget_exceeded():
    """A very small budget forces one chapter per batch."""
    small = [ChapterWork(1, "Book", "en", i, "word " * 100) for i in range(3)]
    batches = group_chapters_for_batch(small, max_output_tokens=50)
    # Each chapter alone exceeds 50 → one chapter per batch (at minimum)
    assert len(batches) == 3


def test_group_chapters_empty_input():
    assert group_chapters_for_batch([]) == []


# ── plan_work ───────────────────────────────────────────────────────────────

async def test_plan_work_skips_books_already_in_target_language(tmp_db):
    """An English book with target_language=en is skipped entirely."""
    await save_book(1342, EN_BOOK_META, TWO_CHAPTER_TEXT)
    plans = await plan_work("en")
    assert plans == []


async def test_plan_work_includes_untranslated_chapters(tmp_db):
    await save_book(1342, EN_BOOK_META, TWO_CHAPTER_TEXT)
    plans = await plan_work("zh")
    assert len(plans) == 1
    assert plans[0].book_id == 1342
    assert len(plans[0].chapters) == 2


async def test_plan_work_skips_already_translated_chapters(tmp_db):
    """If a chapter already has a zh translation, it's excluded from the plan."""
    await save_book(1342, EN_BOOK_META, TWO_CHAPTER_TEXT)
    await save_translation(1342, 0, "zh", ["已翻译"])
    plans = await plan_work("zh")
    # Only chapter 1 needs translating now
    assert len(plans[0].chapters) == 1
    assert plans[0].chapters[0].chapter_index == 1


async def test_plan_work_filter_by_book_ids(tmp_db):
    """book_ids filter restricts which books are included."""
    await save_book(1342, EN_BOOK_META, TWO_CHAPTER_TEXT)
    await save_book(
        2229,
        {**EN_BOOK_META, "id": 2229, "title": "Faust", "languages": ["de"]},
        TWO_CHAPTER_TEXT,
    )
    plans = await plan_work("zh", book_ids=[2229])
    assert len(plans) == 1
    assert plans[0].book_id == 2229


# ── Job lifecycle ───────────────────────────────────────────────────────────

async def test_create_and_load_job(tmp_db):
    state = await create_job(target_language="zh", provider="gemini", dry_run=True)
    assert state.status == "running"
    assert state.dry_run is True

    loaded = await load_latest_job()
    assert loaded is not None
    assert loaded.id == state.id
    assert loaded.target_language == "zh"
    assert loaded.dry_run is True


async def test_update_job_persists(tmp_db):
    state = await create_job(target_language="zh")
    await update_job(state.id, completed_chapters=5, current_book_title="P&P")
    loaded = await load_latest_job()
    assert loaded.completed_chapters == 5
    assert loaded.current_book_title == "P&P"


# ── BulkTranslationManager (mocked Gemini) ──────────────────────────────────

async def test_manager_dry_run_stops_after_first_batch(tmp_db, monkeypatch):
    """Dry-run should translate the first batch only and not save to DB."""
    await save_book(1342, EN_BOOK_META, TWO_CHAPTER_TEXT)

    # Mock the batch translator so no real API calls fire
    fake_output = {0: ["dry run ch0"], 1: ["dry run ch1"]}
    async def fake_translate(*args, **kwargs):
        return fake_output
    monkeypatch.setattr(
        "services.bulk_translate.translate_chapters_batch", fake_translate,
    )

    # Use a fresh manager so tests don't share state
    mgr = BulkTranslationManager()

    state = await mgr.start(
        target_language="zh",
        api_key="fake-key",
        rpm=60, rpd=10000,
        dry_run=True,
    )
    # Wait for the job to finish
    if mgr._task:
        await mgr._task

    # Preview should be set
    preview = mgr.preview()
    assert preview == fake_output

    # Nothing saved to DB (dry-run)
    from services.db import get_cached_translation
    assert await get_cached_translation(1342, 0, "zh") is None
    assert await get_cached_translation(1342, 1, "zh") is None

    # Job should be marked completed
    from services.bulk_translate import load_job
    final = await load_job(state.id)
    assert final.status == "completed"
    assert final.dry_run is True


async def test_manager_real_run_saves_translations(tmp_db, monkeypatch):
    await save_book(1342, EN_BOOK_META, TWO_CHAPTER_TEXT)

    fake_output = {0: ["真实翻译 0"], 1: ["真实翻译 1"]}
    async def fake_translate(*args, **kwargs):
        return fake_output
    monkeypatch.setattr(
        "services.bulk_translate.translate_chapters_batch", fake_translate,
    )

    mgr = BulkTranslationManager()
    state = await mgr.start(
        target_language="zh",
        api_key="fake",
        rpm=60, rpd=10000,
        dry_run=False,
    )
    if mgr._task:
        await mgr._task

    from services.db import get_cached_translation_with_meta
    ch0 = await get_cached_translation_with_meta(1342, 0, "zh")
    ch1 = await get_cached_translation_with_meta(1342, 1, "zh")
    assert ch0 is not None and ch0["paragraphs"] == ["真实翻译 0"]
    assert ch1 is not None and ch1["paragraphs"] == ["真实翻译 1"]
    assert ch0["provider"] == "gemini"


async def test_manager_refuses_concurrent_start(tmp_db, monkeypatch):
    """Starting a second job while one is running should raise."""
    await save_book(1342, EN_BOOK_META, TWO_CHAPTER_TEXT)

    # Make the translator sleep so the task stays running
    import asyncio
    async def slow_translate(*args, **kwargs):
        await asyncio.sleep(5)
        return {0: ["x"], 1: ["y"]}
    monkeypatch.setattr(
        "services.bulk_translate.translate_chapters_batch", slow_translate,
    )

    mgr = BulkTranslationManager()
    await mgr.start(target_language="zh", api_key="fake", rpm=60, rpd=10000)
    with pytest.raises(RuntimeError, match="already running"):
        await mgr.start(target_language="zh", api_key="fake", rpm=60, rpd=10000)
    await mgr.stop()


async def test_manager_retries_on_failure(tmp_db, monkeypatch):
    """A transient error should trigger retry; eventual success still saves."""
    await save_book(1342, EN_BOOK_META, TWO_CHAPTER_TEXT)

    call_count = {"n": 0}
    async def flaky_translate(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("transient fail")
        return {0: ["ok 0"], 1: ["ok 1"]}
    monkeypatch.setattr(
        "services.bulk_translate.translate_chapters_batch", flaky_translate,
    )
    # Short-circuit the retry delay
    monkeypatch.setattr("services.bulk_translate.RETRY_DELAYS", (0.0,) * 5)

    mgr = BulkTranslationManager()
    await mgr.start(target_language="zh", api_key="fake", rpm=60, rpd=10000)
    if mgr._task:
        await mgr._task

    assert call_count["n"] >= 2
    from services.db import get_cached_translation
    assert await get_cached_translation(1342, 0, "zh") == ["ok 0"]


# ── Language normalization ───────────────────────────────────────────────────

async def test_plan_work_normalizes_language_code(tmp_db):
    """plan_work('ZH-CN') must treat already-translated 'zh' chapters as done,
    not re-schedule them because of a casing/subtag mismatch."""
    await save_book(1342, EN_BOOK_META, TWO_CHAPTER_TEXT)
    # Both chapters already translated under the normalized form.
    await save_translation(1342, 0, "zh", ["已翻译"])
    await save_translation(1342, 1, "zh", ["已翻译二"])

    plans = await plan_work("ZH-CN")
    assert plans == [], f"Expected no chapters to translate, got {plans}"


async def test_manager_normalizes_language_before_save(tmp_db, monkeypatch):
    """BulkTranslationManager.start() with target_language='ZH-CN' must save
    translations under 'zh' so readers can find them."""
    await save_book(1342, EN_BOOK_META, TWO_CHAPTER_TEXT)

    async def fake_translate(*args, **kwargs):
        return {0: ["第一章。"], 1: ["第二章。"]}
    monkeypatch.setattr(
        "services.bulk_translate.translate_chapters_batch", fake_translate,
    )

    mgr = BulkTranslationManager()
    await mgr.start(target_language="ZH-CN", api_key="fake", rpm=60, rpd=10000)
    if mgr._task:
        await mgr._task

    from services.db import get_cached_translation
    assert await get_cached_translation(1342, 0, "zh") == ["第一章。"], \
        "Translation should be stored under normalized 'zh', not 'ZH-CN'"
    assert await get_cached_translation(1342, 0, "ZH-CN") is None
