"""
Tests for routers/vocabulary.py — save/get/delete words and Obsidian export.
"""

import pytest
from unittest.mock import AsyncMock, patch
from services.db import save_book, save_word, update_obsidian_settings
from services.auth import encrypt_api_key

_BOOK_META = {
    "title": "Moby Dick",
    "authors": ["Herman Melville"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 9001


async def test_save_word(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/vocabulary", json={
        "word": "leviathan",
        "book_id": BOOK_ID,
        "chapter_index": 3,
        "sentence_text": "The great leviathan swam past.",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["word"] == "leviathan"
    assert data["user_id"] == test_user["id"]


async def test_save_word_deduplicates_occurrence(client, test_user):
    """Saving the same word+book+sentence twice should not create duplicate occurrences."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    payload = {
        "word": "whale",
        "book_id": BOOK_ID,
        "chapter_index": 1,
        "sentence_text": "Call me Ishmael.",
    }
    await client.post("/api/vocabulary", json=payload)
    await client.post("/api/vocabulary", json=payload)

    resp = await client.get("/api/vocabulary")
    vocab = resp.json()
    whale = next(v for v in vocab if v["word"] == "whale")
    assert len(whale["occurrences"]) == 1


async def test_get_vocabulary_empty(client, test_user):
    resp = await client.get("/api/vocabulary")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_get_vocabulary_with_occurrences(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "ahab", BOOK_ID, 5, "Captain Ahab spoke.")

    resp = await client.get("/api/vocabulary")
    assert resp.status_code == 200
    vocab = resp.json()
    assert len(vocab) == 1
    entry = vocab[0]
    assert entry["word"] == "ahab"
    assert len(entry["occurrences"]) == 1
    occ = entry["occurrences"][0]
    assert occ["book_id"] == BOOK_ID
    assert occ["chapter_index"] == 5
    assert occ["sentence_text"] == "Captain Ahab spoke."
    assert occ["book_title"] == "Moby Dick"
    assert occ["book_language"] == "en"


async def test_get_vocabulary_own_only(client, test_user):
    from services.db import get_or_create_user
    other = await get_or_create_user(
        google_id="voc-other", email="vocother@example.com", name="Other", picture=""
    )
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(other["id"], "secret", BOOK_ID, 0, "A secret word.")

    resp = await client.get("/api/vocabulary")
    assert resp.json() == []


async def test_delete_word(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "cetacean", BOOK_ID, 0, "A cetacean species.")

    resp = await client.delete("/api/vocabulary/cetacean")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Confirm gone
    vocab = (await client.get("/api/vocabulary")).json()
    assert not any(v["word"] == "cetacean" for v in vocab)


async def test_delete_word_not_found(client, test_user):
    resp = await client.delete("/api/vocabulary/nonexistentword")
    assert resp.status_code == 404


async def test_delete_word_own_only(client, test_user):
    from services.db import get_or_create_user
    other = await get_or_create_user(
        google_id="voc-other2", email="vocother2@example.com", name="Other2", picture=""
    )
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(other["id"], "pirate", BOOK_ID, 0, "A pirate's life.")

    resp = await client.delete("/api/vocabulary/pirate")
    assert resp.status_code == 404


async def test_vocabulary_requires_auth(anon_client):
    resp = await anon_client.get("/api/vocabulary")
    assert resp.status_code == 401

    resp = await anon_client.post("/api/vocabulary", json={
        "word": "x", "book_id": 1, "chapter_index": 0, "sentence_text": "x"
    })
    assert resp.status_code == 401


# ── Export endpoint ───────────────────────────────────────────────────────────

async def _setup_export(test_user, book_id=BOOK_ID):
    await save_book(book_id, _BOOK_META, "text")
    await save_word(test_user["id"], "leviathan", book_id, 3, "The great leviathan.")
    enc_token = encrypt_api_key("ghp_test_token")
    await update_obsidian_settings(
        test_user["id"],
        enc_token,
        "user/obsidian-notes",
        "All Notes/002 Literature Notes/000 Books",
    )


async def test_export_single_book(client, test_user):
    await _setup_export(test_user)

    fake_put_response = {
        "content": {"html_url": "https://github.com/user/obsidian-notes/blob/main/Moby Dick.md"}
    }
    with patch("routers.vocabulary._github_put", new_callable=AsyncMock, return_value="https://github.com/user/obsidian-notes/blob/main/Moby Dick.md"), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})

    assert resp.status_code == 200
    assert "urls" in resp.json()
    assert len(resp.json()["urls"]) == 1


async def test_export_all_books(client, test_user):
    await _setup_export(test_user)

    with patch("routers.vocabulary._github_put", new_callable=AsyncMock, return_value="https://github.com/user/repo/blob/main/file.md"), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={})

    assert resp.status_code == 200
    assert "urls" in resp.json()


async def test_export_without_settings_returns_400(client, test_user):
    resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})
    assert resp.status_code == 400
    assert "not configured" in resp.json()["detail"]


async def test_export_github_api_error_returns_502(client, test_user):
    await _setup_export(test_user)

    with patch("routers.vocabulary._github_put", new_callable=AsyncMock, side_effect=Exception("network error")), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})

    assert resp.status_code == 500


async def test_export_calls_github_with_correct_content(client, test_user):
    """Verify the markdown content passed to GitHub contains expected sections."""
    await _setup_export(test_user)

    captured_content = {}

    async def fake_put(token, repo, path, filename, content_md, message):
        captured_content["content"] = content_md
        captured_content["filename"] = filename
        return "https://github.com/example/url"

    with patch("routers.vocabulary._github_put", side_effect=fake_put), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})

    assert resp.status_code == 200
    content = captured_content["content"]
    assert "## Vocabulary" in content
    assert "leviathan" in content
    assert "## Annotations" in content
    assert "gutenberg.org/ebooks/" in content
