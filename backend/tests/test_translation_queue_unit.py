"""
Unit tests for the non-worker parts of services/translation_queue.py:
get_model_chain, is_quota_error, enqueue, enqueue_for_book, get_auto_languages.
"""

import pytest
from unittest.mock import AsyncMock, patch

import services.db as db_module
from services.db import init_db, save_book, save_translation, set_setting
from services.translation_queue import (
    get_model_chain,
    is_quota_error,
    enqueue,
    enqueue_for_book,
    get_auto_languages,
    SETTING_MODEL_CHAIN,
    SETTING_MODEL,
    SETTING_AUTO_LANGS,
)
from services.model_limits import DEFAULT_CHAIN


@pytest.fixture(autouse=True)
async def tmp_db(monkeypatch, tmp_path):
    path = str(tmp_path / "test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    # Also patch the DB_PATH used by translation_queue (imported separately)
    import services.translation_queue as tq_module
    monkeypatch.setattr(tq_module.db_module, "DB_PATH", path)
    await init_db()


# ── get_model_chain ───────────────────────────────────────────────────────────

async def test_model_chain_from_setting():
    await set_setting(SETTING_MODEL_CHAIN, '["gemini-2.0-flash", "gemini-1.5-flash"]')
    chain = await get_model_chain()
    assert chain == ["gemini-2.0-flash", "gemini-1.5-flash"]


async def test_model_chain_falls_back_to_legacy_single_model():
    await set_setting(SETTING_MODEL, "gemini-1.5-pro")
    chain = await get_model_chain()
    assert chain == ["gemini-1.5-pro"]


async def test_model_chain_falls_back_to_default_when_no_setting():
    chain = await get_model_chain()
    assert chain == list(DEFAULT_CHAIN)


async def test_model_chain_invalid_json_falls_back_to_default():
    await set_setting(SETTING_MODEL_CHAIN, "not-json")
    chain = await get_model_chain()
    assert chain == list(DEFAULT_CHAIN)


async def test_model_chain_empty_list_falls_back_to_legacy():
    await set_setting(SETTING_MODEL_CHAIN, "[]")
    await set_setting(SETTING_MODEL, "gemini-legacy")
    chain = await get_model_chain()
    assert chain == ["gemini-legacy"]


# ── is_quota_error ────────────────────────────────────────────────────────────

def test_quota_error_detects_429():
    assert is_quota_error(Exception("HTTP 429 Too Many Requests"))


def test_quota_error_detects_resource_exhausted():
    assert is_quota_error(Exception("RESOURCE_EXHAUSTED: quota exceeded"))


def test_quota_error_detects_resource_exhausted_spaced():
    assert is_quota_error(Exception("Resource Exhausted on this key"))


def test_quota_error_detects_quota_substring():
    assert is_quota_error(Exception("Daily quota limit reached"))


def test_quota_error_detects_rate_limit():
    assert is_quota_error(Exception("rate limit exceeded"))


def test_quota_error_detects_ratelimit_no_space():
    assert is_quota_error(Exception("RateLimit: too many requests"))


def test_quota_error_case_insensitive():
    assert is_quota_error(Exception("QUOTA EXCEEDED"))
    assert is_quota_error(Exception("Rate Limit"))


def test_non_quota_error_returns_false():
    assert not is_quota_error(Exception("Internal server error"))
    assert not is_quota_error(Exception("Connection timeout"))
    assert not is_quota_error(Exception("Invalid API key"))
    assert not is_quota_error(ValueError("network failure"))


def test_empty_exception_message_returns_false():
    assert not is_quota_error(Exception(""))


# ── enqueue ───────────────────────────────────────────────────────────────────

async def test_enqueue_inserts_new_row():
    count = await enqueue(1, 0, "en", priority=50)
    assert count == 1


async def test_enqueue_existing_pending_row_is_noop():
    await enqueue(1, 0, "en")
    count = await enqueue(1, 0, "en")
    assert count == 0


async def test_enqueue_reset_failed_revives_failed_row():
    # Enqueue then manually mark as failed
    import aiosqlite
    await enqueue(2, 0, "de")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "UPDATE translation_queue SET status='failed' WHERE book_id=2 AND chapter_index=0 AND target_language='de'"
        )
        await db.commit()

    count = await enqueue(2, 0, "de", reset_failed=True)
    assert count == 1

    import aiosqlite
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT status, attempts FROM translation_queue WHERE book_id=2 AND chapter_index=0"
        ) as cursor:
            row = await cursor.fetchone()
    assert row[0] == "pending"
    assert row[1] == 0


async def test_enqueue_preserves_lower_priority():
    await enqueue(3, 0, "fr", priority=100, reset_failed=True)
    # Try to re-enqueue with higher priority (lower number = higher priority)
    await enqueue(3, 0, "fr", priority=10, reset_failed=True)

    import aiosqlite
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT priority FROM translation_queue WHERE book_id=3"
        ) as cursor:
            row = await cursor.fetchone()
    assert row[0] == 10  # MIN(100, 10) = 10


# ── enqueue_for_book ──────────────────────────────────────────────────────────

async def test_enqueue_for_book_returns_zero_when_no_target_langs():
    from services.splitter import Chapter
    book_meta = {"title": "T", "authors": ["A"], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
    await save_book(100, book_meta, "Chapter I\n\nText here.")
    count = await enqueue_for_book(100, target_languages=[])
    assert count == 0


async def test_enqueue_for_book_returns_zero_when_book_not_in_cache():
    count = await enqueue_for_book(9999, target_languages=["en"])
    assert count == 0


async def test_enqueue_for_book_skips_source_language():
    book_meta = {"title": "T", "authors": ["A"], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
    await save_book(101, book_meta, "Chapter I\n\nText here.")

    from services.splitter import Chapter
    fake_chapters = [Chapter(title="Ch1", text="Text"), Chapter(title="Ch2", text="More")]
    with patch("services.book_chapters.split_with_html_preference", new_callable=AsyncMock, return_value=fake_chapters):
        count = await enqueue_for_book(101, target_languages=["de"])  # same as source
    assert count == 0


async def test_enqueue_for_book_enqueues_all_chapters():
    book_meta = {"title": "T", "authors": ["A"], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
    await save_book(102, book_meta, "Chapter I\n\nText here.")

    from services.splitter import Chapter
    fake_chapters = [
        Chapter(title="Ch1", text="First chapter"),
        Chapter(title="Ch2", text="Second chapter"),
    ]
    with patch("services.book_chapters.split_with_html_preference", new_callable=AsyncMock, return_value=fake_chapters):
        count = await enqueue_for_book(102, target_languages=["en"])
    assert count == 2


async def test_enqueue_for_book_skips_already_translated():
    book_meta = {"title": "T", "authors": ["A"], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
    await save_book(103, book_meta, "Chapter I\n\nText here.")
    await save_translation(103, 0, "en", ["Already translated"])

    from services.splitter import Chapter
    fake_chapters = [
        Chapter(title="Ch1", text="First chapter"),
        Chapter(title="Ch2", text="Second chapter"),
    ]
    with patch("services.book_chapters.split_with_html_preference", new_callable=AsyncMock, return_value=fake_chapters):
        count = await enqueue_for_book(103, target_languages=["en"])
    assert count == 1  # only chapter 1, chapter 0 already cached


async def test_enqueue_for_book_skips_empty_chapters():
    book_meta = {"title": "T", "authors": ["A"], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
    await save_book(104, book_meta, "Some text")

    from services.splitter import Chapter
    fake_chapters = [
        Chapter(title="Empty", text="   "),
        Chapter(title="Real", text="Real content here"),
    ]
    with patch("services.book_chapters.split_with_html_preference", new_callable=AsyncMock, return_value=fake_chapters):
        count = await enqueue_for_book(104, target_languages=["en"])
    assert count == 1  # only the real chapter


# ── get_auto_languages ────────────────────────────────────────────────────────

async def test_get_auto_languages_valid_json():
    await set_setting(SETTING_AUTO_LANGS, '["en", "zh", "de"]')
    langs = await get_auto_languages()
    assert langs == ["en", "zh", "de"]


async def test_get_auto_languages_empty_setting():
    langs = await get_auto_languages()
    assert langs == []


async def test_get_auto_languages_empty_array():
    await set_setting(SETTING_AUTO_LANGS, "[]")
    langs = await get_auto_languages()
    assert langs == []


async def test_get_auto_languages_invalid_json_returns_empty():
    await set_setting(SETTING_AUTO_LANGS, "not valid json")
    langs = await get_auto_languages()
    assert langs == []


async def test_get_auto_languages_filters_empty_strings():
    await set_setting(SETTING_AUTO_LANGS, '["en", "", "de", ""]')
    langs = await get_auto_languages()
    assert langs == ["en", "de"]
