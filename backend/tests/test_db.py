"""
Tests for services/db.py — all CRUD helpers.

Uses a temporary SQLite file per test session so nothing touches the real DB.
"""

import json
import pytest
import tempfile
import os
import services.db as db_module
from services.db import (
    init_db,
    get_or_create_user,
    get_user_by_id,
    set_user_gemini_key,
    save_book,
    get_cached_book,
    list_cached_books,
    save_translation,
    get_cached_translation,
    count_translations_for_book,
    get_setting,
    set_setting,
    get_reading_progress,
    upsert_reading_progress,
    get_chapter_summary,
    save_chapter_summary,
)


@pytest.fixture(autouse=True)
async def tmp_db(monkeypatch, tmp_path):
    """Point DB_PATH at a fresh temp file for every test."""
    path = str(tmp_path / "test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()
    yield


async def _seed_book(book_id: int) -> None:
    """chapter_summaries.book_id now carries a declared FK to books(id)
    (migration 032, #754 PR 2/4). Tests that exercise save_chapter_summary
    with a fabricated book_id must ensure the referenced book exists.
    """
    import aiosqlite
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO books (id, title, images, source) "
            "VALUES (?, 'T', '[]', 'upload')",
            (book_id,),
        )
        await db.commit()


# ── Users ─────────────────────────────────────────────────────────────────────

async def test_create_user():
    user = await get_or_create_user("g123", "alice@example.com", "Alice", "https://pic")
    assert user["google_id"] == "g123"
    assert user["email"] == "alice@example.com"
    assert user["id"] is not None


async def test_get_or_create_user_is_idempotent():
    u1 = await get_or_create_user("g123", "alice@example.com", "Alice", "pic1")
    u2 = await get_or_create_user("g123", "alice@example.com", "Alice Updated", "pic2")
    assert u1["id"] == u2["id"]


async def test_get_user_by_id():
    user = await get_or_create_user("g456", "bob@example.com", "Bob", "")
    fetched = await get_user_by_id(user["id"])
    assert fetched is not None
    assert fetched["email"] == "bob@example.com"


async def test_get_user_by_id_missing_returns_none():
    result = await get_user_by_id(99999)
    assert result is None


async def test_set_user_gemini_key():
    user = await get_or_create_user("g789", "carol@example.com", "Carol", "")
    await set_user_gemini_key(user["id"], "encrypted_key_value")
    updated = await get_user_by_id(user["id"])
    assert updated["gemini_key"] == "encrypted_key_value"


async def test_clear_user_gemini_key():
    user = await get_or_create_user("g000", "dan@example.com", "Dan", "")
    await set_user_gemini_key(user["id"], "some_key")
    await set_user_gemini_key(user["id"], None)
    updated = await get_user_by_id(user["id"])
    assert updated["gemini_key"] is None


# ── Books ─────────────────────────────────────────────────────────────────────

SAMPLE_META = {
    "title": "Faust",
    "authors": ["Goethe"],
    "languages": ["de"],
    "subjects": ["Drama"],
    "download_count": 1000,
    "cover": "https://cover.url",
}


async def test_save_and_get_book():
    await save_book(2229, SAMPLE_META, "Full text here")
    book = await get_cached_book(2229)
    assert book is not None
    assert book["title"] == "Faust"
    assert book["authors"] == ["Goethe"]
    assert book["text"] == "Full text here"


async def test_save_book_with_images():
    images = [{"url": "https://img.url", "caption": "Figure 1"}]
    await save_book(2229, SAMPLE_META, "text", images)
    book = await get_cached_book(2229)
    assert book["images"] == images


async def test_get_cached_book_missing_returns_none():
    result = await get_cached_book(99999)
    assert result is None


async def test_list_cached_books_empty():
    books = await list_cached_books()
    assert books == []


async def test_list_cached_books():
    await save_book(1, {**SAMPLE_META, "title": "Book A"}, "text a")
    await save_book(2, {**SAMPLE_META, "title": "Book B"}, "text b")
    books = await list_cached_books()
    assert len(books) == 2
    titles = {b["title"] for b in books}
    assert titles == {"Book A", "Book B"}


async def test_list_cached_books_excludes_text_field():
    await save_book(1, SAMPLE_META, "lots of text")
    books = await list_cached_books()
    assert "text" not in books[0]


# ── Translation cache ─────────────────────────────────────────────────────────

async def test_save_and_get_translation():
    paragraphs = ["Hallo Welt", "Wie geht es dir"]
    await save_translation(1, 0, "en", paragraphs)
    result = await get_cached_translation(1, 0, "en")
    assert result == paragraphs


async def test_translation_cache_miss_returns_none():
    result = await get_cached_translation(1, 0, "fr")
    assert result is None


async def test_translation_cache_keyed_by_language():
    await save_translation(1, 0, "en", ["English text"])
    await save_translation(1, 0, "fr", ["Texte français"])
    en = await get_cached_translation(1, 0, "en")
    fr = await get_cached_translation(1, 0, "fr")
    assert en == ["English text"]
    assert fr == ["Texte français"]


async def test_translation_cache_keyed_by_chapter():
    await save_translation(1, 0, "en", ["Chapter 0"])
    await save_translation(1, 1, "en", ["Chapter 1"])
    assert await get_cached_translation(1, 0, "en") == ["Chapter 0"]
    assert await get_cached_translation(1, 1, "en") == ["Chapter 1"]


async def test_translation_upsert_replaces_existing():
    await save_translation(1, 0, "en", ["old"])
    await save_translation(1, 0, "en", ["new"])
    result = await get_cached_translation(1, 0, "en")
    assert result == ["new"]



# ── Translation count ─────────────────────────────────────────────────────────

async def test_count_translations_for_book_zero():
    count = await count_translations_for_book(1342, "zh")
    assert count == 0


async def test_count_translations_for_book_counts_correctly():
    await save_translation(1342, 0, "zh", ["para"])
    await save_translation(1342, 1, "zh", ["para"])
    await save_translation(1342, 0, "en", ["para"])  # different language — not counted
    count = await count_translations_for_book(1342, "zh")
    assert count == 2


# ── App settings ──────────────────────────────────────────────────────────────

async def test_get_setting_returns_none_when_not_set():
    result = await get_setting("nonexistent_key")
    assert result is None


async def test_set_and_get_setting():
    await set_setting("queue_model", "gemini-2.5-flash")
    result = await get_setting("queue_model")
    assert result == "gemini-2.5-flash"


async def test_set_setting_overwrites():
    await set_setting("queue_model", "old")
    await set_setting("queue_model", "new")
    assert await get_setting("queue_model") == "new"


# ── Reading progress ──────────────────────────────────────────────────────────

async def test_get_reading_progress_empty():
    result = await get_reading_progress(user_id=1)
    assert result == []


async def test_upsert_and_get_reading_progress():
    await save_book(1342, SAMPLE_META, "text")
    user = await get_or_create_user("g-rp", "rp@test.com", "RP", "")
    await upsert_reading_progress(user["id"], 1342, chapter_index=5)
    entries = await get_reading_progress(user["id"])
    assert len(entries) == 1
    assert entries[0]["book_id"] == 1342
    assert entries[0]["chapter_index"] == 5


async def test_upsert_reading_progress_updates_existing():
    await save_book(1342, SAMPLE_META, "text")
    user = await get_or_create_user("g-rp2", "rp2@test.com", "RP2", "")
    await upsert_reading_progress(user["id"], 1342, chapter_index=2)
    await upsert_reading_progress(user["id"], 1342, chapter_index=7)
    entries = await get_reading_progress(user["id"])
    assert len(entries) == 1
    assert entries[0]["chapter_index"] == 7



# ── DB_PATH env var + parent directory handling ──────────────────────────────

def test_db_path_honors_env_var(monkeypatch, tmp_path):
    """Setting DB_PATH env var before module import should override the default."""
    custom_path = str(tmp_path / "custom" / "books.db")
    monkeypatch.setenv("DB_PATH", custom_path)
    # Reload the module so it picks up the env var
    import importlib
    import services.db as db_module
    importlib.reload(db_module)
    try:
        assert db_module.DB_PATH == custom_path
    finally:
        # Reload again so subsequent tests get a clean state
        monkeypatch.delenv("DB_PATH", raising=False)
        importlib.reload(db_module)


async def test_init_db_creates_parent_directory(monkeypatch, tmp_path):
    """init_db() should create the parent directory if it doesn't exist —
    important for first-run after mounting a Railway volume at a fresh path."""
    nested_path = str(tmp_path / "data" / "subdir" / "books.db")
    monkeypatch.setattr(db_module, "DB_PATH", nested_path)

    # Parent directory does NOT exist before init_db runs
    assert not os.path.exists(os.path.dirname(nested_path))

    await init_db()

    # Parent dir exists, file exists, schema is in place
    assert os.path.exists(nested_path)
    # Sanity-check the schema by running a real query
    user = await get_or_create_user(google_id="x", email="a@b.com", name="A", picture="")
    assert user["id"] is not None


# ── Chapter summaries ─────────────────────────────────────────────────────────

async def test_get_chapter_summary_returns_none_when_missing():
    result = await get_chapter_summary(9999, 0)
    assert result is None


async def test_save_and_get_chapter_summary():
    await _seed_book(1234)
    await save_chapter_summary(1234, 5, "A great chapter summary.", model="test-model")
    result = await get_chapter_summary(1234, 5)
    assert result is not None
    assert result["content"] == "A great chapter summary."
    assert result["model"] == "test-model"


async def test_save_chapter_summary_overwrites():
    await _seed_book(1234)
    await save_chapter_summary(1234, 7, "First version.", model="model-a")
    await save_chapter_summary(1234, 7, "Updated version.", model="model-b")
    result = await get_chapter_summary(1234, 7)
    assert result["content"] == "Updated version."
    assert result["model"] == "model-b"


async def test_save_chapter_summary_without_model():
    await _seed_book(1234)
    await save_chapter_summary(1234, 8, "No model specified.")
    result = await get_chapter_summary(1234, 8)
    assert result is not None
    assert result["model"] is None


# ── Issue #541: stale-return after UPDATE in OAuth user functions ─────────────

import aiosqlite
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_get_or_create_user_google_stale_return():
    """Regression #541: get_or_create_user must re-fetch after UPDATE, not return pre-UPDATE snapshot.

    Injects a concurrent DB change (role='admin') AFTER the SELECT fetchone() returns
    but BEFORE the UPDATE+COMMIT. The buggy code returns the stale dict(row) with
    role='user'; the fixed code re-fetches and gets role='admin'.
    """
    # Seed: first user → admin; create a second user that gets role='user'
    await get_or_create_user("g-first-541", "first@541.com", "First", "")
    await get_or_create_user("g-target-541", "target@541.com", "Target", "")

    import aiosqlite as _aio
    original_fetchone = _aio.Cursor.fetchone
    injected = [False]

    async def injecting_fetchone(self):
        row = await original_fetchone(self)
        # Inject after the first non-None fetchone (the existing-user SELECT)
        if row is not None and not injected[0]:
            injected[0] = True
            async with _aio.connect(db_module.DB_PATH) as other:
                await other.execute(
                    "UPDATE users SET role='admin', approved=1 WHERE google_id=?",
                    ("g-target-541",),
                )
                await other.commit()
        return row

    with patch.object(_aio.Cursor, "fetchone", injecting_fetchone):
        result = await get_or_create_user("g-target-541", "target@541.com", "Target", "")

    # DB has role='admin' (injected after SELECT, before COMMIT).
    # Buggy code returns stale dict(row) with role='user'.
    # Fixed code re-fetches after COMMIT → role='admin'.
    assert result["role"] == "admin", (
        f"Stale return #541: expected role='admin' (post-injection DB state), got {result['role']!r}"
    )


@pytest.mark.asyncio
async def test_get_or_create_user_github_stale_return():
    """Regression #541: get_or_create_user_github must re-fetch after UPDATE, not return pre-UPDATE snapshot."""
    from services.db import get_or_create_user_github
    import aiosqlite as _aio

    await get_or_create_user("g-first-gh541", "firstgh@541.com", "First", "")
    await get_or_create_user_github("gh-target-541", "ghtar@541.com", "GHTarget", "")

    original_fetchone = _aio.Cursor.fetchone
    injected = [False]

    async def injecting_fetchone(self):
        row = await original_fetchone(self)
        if row is not None and not injected[0]:
            injected[0] = True
            async with _aio.connect(db_module.DB_PATH) as other:
                await other.execute(
                    "UPDATE users SET role='admin', approved=1 WHERE github_id=?",
                    ("gh-target-541",),
                )
                await other.commit()
        return row

    with patch.object(_aio.Cursor, "fetchone", injecting_fetchone):
        result = await get_or_create_user_github("gh-target-541", "ghtar@541.com", "GHTarget", "")

    assert result["role"] == "admin", (
        f"Stale return #541: expected role='admin' (post-injection DB state), got {result['role']!r}"
    )
