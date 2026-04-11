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
    save_audiobook,
    get_audiobook,
    delete_audiobook,
)


@pytest.fixture(autouse=True)
async def tmp_db(monkeypatch, tmp_path):
    """Point DB_PATH at a fresh temp file for every test."""
    path = str(tmp_path / "test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()
    yield


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


# ── Audiobooks ────────────────────────────────────────────────────────────────

SAMPLE_AUDIOBOOK = {
    "id": "librivox-123",
    "title": "Faust",
    "authors": ["Goethe"],
    "url_librivox": "https://librivox.org/faust",
    "url_rss": "https://librivox.org/faust/feed",
    "sections": [{"number": 1, "title": "Part I", "duration": "1:00:00", "url": "https://audio.mp3"}],
}


async def test_save_and_get_audiobook():
    await save_audiobook(2229, SAMPLE_AUDIOBOOK)
    result = await get_audiobook(2229)
    assert result is not None
    assert result["title"] == "Faust"
    assert result["sections"][0]["title"] == "Part I"


async def test_get_audiobook_missing_returns_none():
    result = await get_audiobook(99999)
    assert result is None


async def test_delete_audiobook():
    await save_audiobook(2229, SAMPLE_AUDIOBOOK)
    await delete_audiobook(2229)
    assert await get_audiobook(2229) is None


async def test_delete_audiobook_nonexistent_does_not_raise():
    await delete_audiobook(99999)  # should not raise
