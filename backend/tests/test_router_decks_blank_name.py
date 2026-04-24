"""Regression tests for #1033 — deck create/patch must reject whitespace-only names.

A name like "   " passes Pydantic's min_length=1 check (3 chars) but the router
calls .strip() before passing to the service, resulting in "" stored in the DB.
"""

import pytest


async def test_create_deck_whitespace_only_name_returns_422(client, test_user):
    """POST /decks with a whitespace-only name must be rejected (422)."""
    resp = await client.post("/api/decks", json={"name": "   ", "mode": "manual"})
    assert resp.status_code == 422


async def test_create_deck_single_space_returns_422(client, test_user):
    """POST /decks with a single space name must be rejected (422)."""
    resp = await client.post("/api/decks", json={"name": " ", "mode": "manual"})
    assert resp.status_code == 422


async def test_create_deck_valid_name_succeeds(client, test_user):
    """POST /decks with a real name must still work (regression guard)."""
    resp = await client.post("/api/decks", json={"name": "My Deck", "mode": "manual"})
    assert resp.status_code == 201
    assert resp.json()["name"] == "My Deck"


async def test_patch_deck_whitespace_only_name_returns_422(client, test_user):
    """PATCH /decks/{id} with a whitespace-only name must be rejected (422)."""
    create = await client.post("/api/decks", json={"name": "Valid", "mode": "manual"})
    assert create.status_code == 201
    deck_id = create.json()["id"]

    resp = await client.patch(f"/api/decks/{deck_id}", json={"name": "   "})
    assert resp.status_code == 422


async def test_patch_deck_valid_name_succeeds(client, test_user):
    """PATCH /decks/{id} with a trimmed non-empty name must still work."""
    create = await client.post("/api/decks", json={"name": "Original", "mode": "manual"})
    assert create.status_code == 201
    deck_id = create.json()["id"]

    resp = await client.patch(f"/api/decks/{deck_id}", json={"name": "Renamed"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"
