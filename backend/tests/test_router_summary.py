"""
Tests for POST /ai/summary and DELETE /ai/summary.

All Gemini calls are mocked. Tests cover:
- Cache hit: returns immediately, no Gemini call made
- Cache miss + queue key present: Gemini called, result cached
- Cache miss + no queue key: 503
- Book not found: 404
- Gemini failure: 500
- Admin can delete cached summary
- Non-admin delete returns 403
"""

import pytest
from unittest.mock import AsyncMock, patch
from services.db import save_book, save_chapter_summary, get_chapter_summary, set_setting, set_user_role, get_user_by_id
from services.auth import encrypt_api_key


_BOOK_META = {
    "title": "Faust",
    "authors": ["Johann Wolfgang von Goethe"],
    "languages": ["de"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 9001
CHAPTER_INDEX = 3
CHAPTER_TEXT = "Mephistopheles erscheint im Studierzimmer des Faust."
SUMMARY_CONTENT = "**Overview**\nFaust meets Mephistopheles.\n\n**Key Events**\n- The devil appears."

_PAYLOAD = {
    "book_id": BOOK_ID,
    "chapter_index": CHAPTER_INDEX,
    "chapter_text": CHAPTER_TEXT,
    "book_title": "Faust",
    "author": "Goethe",
    "chapter_title": "Chapter III",
}


async def _set_queue_key(tmp_db):
    await set_setting("queue_api_key", encrypt_api_key("fake-queue-key"))


# ── Cache hit ─────────────────────────────────────────────────────────────────

async def test_summary_cache_hit(client, tmp_db):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_chapter_summary(BOOK_ID, CHAPTER_INDEX, SUMMARY_CONTENT, model="test-model")

    with patch("routers.ai.gemini.generate_chapter_summary", new_callable=AsyncMock) as mock_gen:
        resp = await client.post("/api/ai/summary", json=_PAYLOAD)

    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"] == SUMMARY_CONTENT
    assert data["cached"] is True
    assert data["model"] == "test-model"
    mock_gen.assert_not_called()


# ── Cache miss — queue key present ───────────────────────────────────────────

async def test_summary_cache_miss_generates_and_caches(client, tmp_db):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await _set_queue_key(tmp_db)

    with patch("routers.ai.gemini.generate_chapter_summary", new_callable=AsyncMock, return_value=SUMMARY_CONTENT):
        resp = await client.post("/api/ai/summary", json=_PAYLOAD)

    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"] == SUMMARY_CONTENT
    assert data["cached"] is False

    # Verify it was cached in DB
    stored = await get_chapter_summary(BOOK_ID, CHAPTER_INDEX)
    assert stored is not None
    assert stored["content"] == SUMMARY_CONTENT


async def test_summary_second_request_uses_cache(client, tmp_db):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await _set_queue_key(tmp_db)

    call_count = 0

    async def _once(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return SUMMARY_CONTENT

    with patch("routers.ai.gemini.generate_chapter_summary", side_effect=_once):
        await client.post("/api/ai/summary", json=_PAYLOAD)  # first — generates
        resp2 = await client.post("/api/ai/summary", json=_PAYLOAD)  # second — cached

    assert call_count == 1
    assert resp2.json()["cached"] is True


# ── No queue key ──────────────────────────────────────────────────────────────

async def test_summary_no_queue_key_returns_503(client, tmp_db):
    await save_book(BOOK_ID, _BOOK_META, "text")

    resp = await client.post("/api/ai/summary", json=_PAYLOAD)
    assert resp.status_code == 503


# ── Book not found ────────────────────────────────────────────────────────────

async def test_summary_book_not_found_returns_404(client, tmp_db):
    resp = await client.post("/api/ai/summary", json=_PAYLOAD)
    assert resp.status_code == 404


# ── Gemini failure ────────────────────────────────────────────────────────────

async def test_summary_gemini_error_returns_500(client, tmp_db):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await _set_queue_key(tmp_db)

    with patch(
        "routers.ai.gemini.generate_chapter_summary",
        new_callable=AsyncMock,
        side_effect=RuntimeError("quota exceeded"),
    ):
        resp = await client.post("/api/ai/summary", json=_PAYLOAD)

    assert resp.status_code == 500


# ── Admin delete ──────────────────────────────────────────────────────────────

async def test_summary_admin_can_delete(client, test_user, tmp_db):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_chapter_summary(BOOK_ID, CHAPTER_INDEX, SUMMARY_CONTENT)
    await set_user_role(test_user["id"], "admin")

    resp = await client.delete(f"/api/ai/summary?book_id={BOOK_ID}&chapter_index={CHAPTER_INDEX}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    stored = await get_chapter_summary(BOOK_ID, CHAPTER_INDEX)
    assert stored is None


async def test_summary_non_admin_delete_forbidden(client, test_user, tmp_db):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_chapter_summary(BOOK_ID, CHAPTER_INDEX, SUMMARY_CONTENT)
    # First user is auto-admin; explicitly demote them for this test.
    await set_user_role(test_user["id"], "user")

    resp = await client.delete(f"/api/ai/summary?book_id={BOOK_ID}&chapter_index={CHAPTER_INDEX}")
    assert resp.status_code == 403
