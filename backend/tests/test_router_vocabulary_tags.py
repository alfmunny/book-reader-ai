"""Tests for tag endpoints on vocabulary router (issue #645).

Covers:
  - GET    /vocabulary/tags
  - GET    /vocabulary/{id}/tags
  - POST   /vocabulary/{id}/tags
  - DELETE /vocabulary/{id}/tags/{tag}
  - Normalization (trim, lowercase)
  - Length + empty validation
  - User-scoping (user A cannot tag user B's word)
  - Cascade: deleting a vocabulary row removes tags
"""

import pytest
from services.db import save_book, save_word, delete_word, get_or_create_user

_BOOK_META = {
    "title": "Tag Test Book",
    "authors": ["Author"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 9301


async def _save(word: str, user_id: int) -> int:
    """Helper — save a word and return its vocabulary_id."""
    row = await save_word(user_id, word, BOOK_ID, 0, f"A sentence with {word}.")
    return row["id"]


async def test_tags_empty_for_new_user(client, test_user):
    resp = await client.get("/api/vocabulary/tags")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_add_tag_and_list_on_word(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    vid = await _save("ephemeral", test_user["id"])

    resp = await client.post(f"/api/vocabulary/{vid}/tags", json={"tag": "B2"})
    assert resp.status_code == 201
    assert resp.json() == {"tag": "b2"}  # normalized lowercase

    resp = await client.get(f"/api/vocabulary/{vid}/tags")
    assert resp.json() == ["b2"]


async def test_add_tag_trims_and_lowercases(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    vid = await _save("solitude", test_user["id"])

    resp = await client.post(f"/api/vocabulary/{vid}/tags", json={"tag": "  PhrasalVerb  "})
    assert resp.status_code == 201
    assert resp.json()["tag"] == "phrasalverb"


async def test_add_tag_rejects_blank(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    vid = await _save("vespers", test_user["id"])

    resp = await client.post(f"/api/vocabulary/{vid}/tags", json={"tag": "   "})
    assert resp.status_code == 400


async def test_add_tag_enforces_length_cap(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    vid = await _save("wanderlust", test_user["id"])

    resp = await client.post(
        f"/api/vocabulary/{vid}/tags",
        json={"tag": "x" * 60},
    )
    assert resp.status_code == 422  # Pydantic max_length rejects before body hits service


async def test_add_tag_404_for_foreign_word(client, test_user):
    """User A cannot tag user B's word."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    other = await get_or_create_user("tag-other", "tag-other@ex.com", "Other", "")
    vid = await _save("foreign", other["id"])

    resp = await client.post(f"/api/vocabulary/{vid}/tags", json={"tag": "x"})
    assert resp.status_code == 404


async def test_get_tags_404_for_foreign_word(client, test_user):
    """GET tags on another user's word must return 404, not 200 with empty list (closes #1042)."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    other = await get_or_create_user("tag-other2", "tag-other2@ex.com", "Other2", "")
    vid = await _save("foreignget", other["id"])

    resp = await client.get(f"/api/vocabulary/{vid}/tags")
    assert resp.status_code == 404


async def test_add_tag_dedup(client, test_user):
    """Adding the same tag twice is idempotent."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    vid = await _save("idempotent", test_user["id"])

    await client.post(f"/api/vocabulary/{vid}/tags", json={"tag": "a"})
    await client.post(f"/api/vocabulary/{vid}/tags", json={"tag": "A"})
    resp = await client.get(f"/api/vocabulary/{vid}/tags")
    assert resp.json() == ["a"]


async def test_list_user_tags_with_counts(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    a_id = await _save("alpha", test_user["id"])
    b_id = await _save("beta", test_user["id"])

    await client.post(f"/api/vocabulary/{a_id}/tags", json={"tag": "shared"})
    await client.post(f"/api/vocabulary/{b_id}/tags", json={"tag": "shared"})
    await client.post(f"/api/vocabulary/{a_id}/tags", json={"tag": "solo"})

    resp = await client.get("/api/vocabulary/tags")
    body = resp.json()
    assert {"tag": "shared", "word_count": 2} in body
    assert {"tag": "solo", "word_count": 1} in body


async def test_delete_tag(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    vid = await _save("transient", test_user["id"])
    await client.post(f"/api/vocabulary/{vid}/tags", json={"tag": "gone"})

    resp = await client.delete(f"/api/vocabulary/{vid}/tags/gone")
    assert resp.status_code == 204
    assert (await client.get(f"/api/vocabulary/{vid}/tags")).json() == []


async def test_delete_unknown_tag_404(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    vid = await _save("missing", test_user["id"])

    resp = await client.delete(f"/api/vocabulary/{vid}/tags/nope")
    assert resp.status_code == 404


async def test_tags_cascade_on_word_delete(client, test_user):
    """Deleting a vocabulary row removes all its tags (FK CASCADE)."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    vid = await _save("shortlived", test_user["id"])
    await client.post(f"/api/vocabulary/{vid}/tags", json={"tag": "x"})

    await delete_word(test_user["id"], "shortlived")

    resp = await client.get("/api/vocabulary/tags")
    assert resp.json() == []
