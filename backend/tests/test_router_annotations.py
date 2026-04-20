"""
Tests for routers/annotations.py — CRUD for book annotations.
"""

import pytest
from services.db import save_book, create_annotation

_BOOK_META = {
    "title": "Test Book",
    "authors": ["Author"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 8001


async def test_create_annotation(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/annotations", json={
        "book_id": BOOK_ID,
        "chapter_index": 2,
        "sentence_text": "It was the best of times.",
        "note_text": "Famous opener",
        "color": "yellow",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["book_id"] == BOOK_ID
    assert data["chapter_index"] == 2
    assert data["sentence_text"] == "It was the best of times."
    assert data["note_text"] == "Famous opener"
    assert data["color"] == "yellow"
    assert data["id"] is not None


async def test_create_annotation_defaults(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/annotations", json={
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "A sentence.",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["note_text"] == ""
    assert data["color"] == "yellow"


async def test_get_annotations_for_book(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await create_annotation(test_user["id"], BOOK_ID, 0, "Sentence 1", "note1", "blue")
    await create_annotation(test_user["id"], BOOK_ID, 1, "Sentence 2", "note2", "red")

    resp = await client.get(f"/api/annotations?book_id={BOOK_ID}")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    texts = {a["sentence_text"] for a in items}
    assert "Sentence 1" in texts
    assert "Sentence 2" in texts


async def test_get_annotations_returns_own_only(client, test_user):
    """Annotations from other users should not appear."""
    from services.db import get_or_create_user
    other = await get_or_create_user(
        google_id="other-g", email="other@example.com", name="Other", picture=""
    )
    await save_book(BOOK_ID, _BOOK_META, "text")
    await create_annotation(test_user["id"], BOOK_ID, 0, "My sentence", "mine", "yellow")
    await create_annotation(other["id"], BOOK_ID, 0, "Other sentence", "theirs", "green")

    resp = await client.get(f"/api/annotations?book_id={BOOK_ID}")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["sentence_text"] == "My sentence"


async def test_update_annotation(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    ann = await create_annotation(test_user["id"], BOOK_ID, 0, "Text", "old note", "yellow")

    resp = await client.patch(f"/api/annotations/{ann['id']}", json={
        "note_text": "updated note",
        "color": "blue",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["note_text"] == "updated note"
    assert data["color"] == "blue"


async def test_update_annotation_not_found_returns_404(client, test_user):
    resp = await client.patch("/api/annotations/99999", json={
        "note_text": "x",
        "color": "blue",
    })
    assert resp.status_code == 404


async def test_update_annotation_own_only(client, test_user):
    """Cannot update another user's annotation — 404 rather than 403 (ownership hidden)."""
    from services.db import get_or_create_user
    other = await get_or_create_user(
        google_id="other-g2", email="other2@example.com", name="Other2", picture=""
    )
    await save_book(BOOK_ID, _BOOK_META, "text")
    ann = await create_annotation(other["id"], BOOK_ID, 0, "Their text", "", "yellow")

    resp = await client.patch(f"/api/annotations/{ann['id']}", json={
        "note_text": "hijack",
        "color": "blue",
    })
    assert resp.status_code == 404


async def test_delete_annotation(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    ann = await create_annotation(test_user["id"], BOOK_ID, 0, "To delete", "", "yellow")

    resp = await client.delete(f"/api/annotations/{ann['id']}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Confirm gone
    resp = await client.get(f"/api/annotations?book_id={BOOK_ID}")
    assert resp.json() == []


async def test_delete_annotation_not_found_returns_404(client, test_user):
    resp = await client.delete("/api/annotations/99999")
    assert resp.status_code == 404


async def test_delete_annotation_own_only(client, test_user):
    from services.db import get_or_create_user
    other = await get_or_create_user(
        google_id="other-g3", email="other3@example.com", name="Other3", picture=""
    )
    await save_book(BOOK_ID, _BOOK_META, "text")
    ann = await create_annotation(other["id"], BOOK_ID, 0, "Theirs", "", "yellow")

    resp = await client.delete(f"/api/annotations/{ann['id']}")
    assert resp.status_code == 404


async def test_annotations_require_auth(anon_client):
    resp = await anon_client.get(f"/api/annotations?book_id={BOOK_ID}")
    assert resp.status_code == 401

    resp = await anon_client.post("/api/annotations", json={
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "x",
    })
    assert resp.status_code == 401
