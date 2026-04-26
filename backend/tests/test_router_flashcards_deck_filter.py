"""Tests for deck_id filter on flashcard endpoints (issue #645).

The flashcard due/stats endpoints accept an optional deck_id that scopes
results to vocabulary rows belonging to the deck. Covers happy path,
unknown-deck 404, and member-scoping.
"""

import pytest
from services.db import save_book, save_word

_BOOK_META = {
    "title": "Flashdeck",
    "authors": ["Author"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 9501


async def _book():
    await save_book(BOOK_ID, _BOOK_META, "text")


async def _save(word: str, user_id: int) -> int:
    row = await save_word(user_id, word, BOOK_ID, 0, f"A sentence with {word}.")
    return row["id"]


async def test_due_without_deck_returns_all(client, test_user):
    await _book()
    await _save("alpha", test_user["id"])
    await _save("beta", test_user["id"])

    resp = await client.get("/api/vocabulary/flashcards/due")
    assert resp.status_code == 200
    words = {c["word"] for c in resp.json()}
    assert {"alpha", "beta"} <= words


async def test_due_with_manual_deck_returns_members_only(client, test_user):
    await _book()
    alpha_id = await _save("alpha", test_user["id"])
    await _save("beta", test_user["id"])

    deck = (await client.post("/api/decks", json={"name": "AlphaOnly", "mode": "manual"})).json()
    await client.post(f"/api/decks/{deck['id']}/members", json={"vocabulary_id": alpha_id})

    resp = await client.get(f"/api/vocabulary/flashcards/due?deck_id={deck['id']}")
    assert resp.status_code == 200
    words = [c["word"] for c in resp.json()]
    assert words == ["alpha"]


async def test_due_with_unknown_deck_id_404(client, test_user):
    resp = await client.get("/api/vocabulary/flashcards/due?deck_id=99999")
    assert resp.status_code == 404


async def test_stats_with_deck_filter(client, test_user):
    await _book()
    alpha_id = await _save("alpha", test_user["id"])
    await _save("beta", test_user["id"])

    deck = (await client.post("/api/decks", json={"name": "StatsDeck", "mode": "manual"})).json()
    await client.post(f"/api/decks/{deck['id']}/members", json={"vocabulary_id": alpha_id})

    resp = await client.get(f"/api/vocabulary/flashcards/stats?deck_id={deck['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["due_today"] == 1


async def test_stats_unknown_deck_404(client, test_user):
    resp = await client.get("/api/vocabulary/flashcards/stats?deck_id=123456")
    assert resp.status_code == 404


async def test_smart_deck_by_tag_filters_due(client, test_user):
    await _book()
    a = await _save("apfel", test_user["id"])
    b = await _save("birne", test_user["id"])

    await client.post(f"/api/vocabulary/{a}/tags", json={"tag": "food"})
    # `b` has no tag

    deck = (await client.post(
        "/api/decks",
        json={"name": "Food only", "mode": "smart", "rules_json": {"tags_any": ["food"]}},
    )).json()

    resp = await client.get(f"/api/vocabulary/flashcards/due?deck_id={deck['id']}")
    assert resp.status_code == 200
    assert [c["word"] for c in resp.json()] == ["apfel"]


async def test_due_with_empty_deck_returns_empty_list(client, test_user):
    """Empty manual deck (no members) must return [] without hitting the DB query.

    Covers services/db.py get_flashcards_due early-return guard (vocabulary_ids=[]).
    """
    deck = (await client.post("/api/decks", json={"name": "EmptyDeck", "mode": "manual"})).json()

    resp = await client.get(f"/api/vocabulary/flashcards/due?deck_id={deck['id']}")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_stats_with_empty_deck_returns_zeros(client, test_user):
    """Empty manual deck (no members) must return zero stats without hitting the DB query.

    Covers services/db.py get_flashcard_stats early-return guard (vocabulary_ids=[]).
    """
    deck = (await client.post("/api/decks", json={"name": "EmptyStatsDeck", "mode": "manual"})).json()

    resp = await client.get(f"/api/vocabulary/flashcards/stats?deck_id={deck['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["due_today"] == 0
    assert body["reviewed_today"] == 0
