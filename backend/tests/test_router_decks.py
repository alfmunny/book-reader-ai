"""Tests for /decks router (issue #645).

Covers:
  - CRUD + user scoping
  - Mode validation (manual / smart)
  - Smart deck rules_json schema validation (extra='forbid', key-typed fields)
  - Manual deck member add/remove
  - Smart deck rejects manual member adds
  - Listing includes member_count + due_today
"""

import pytest
from services.db import save_book, save_word, get_or_create_user

_BOOK_META = {
    "title": "Deck Test",
    "authors": ["Author"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 9401


async def _save(word: str, user_id: int) -> int:
    row = await save_word(user_id, word, BOOK_ID, 0, f"A sentence with {word}.")
    return row["id"]


async def _book():
    await save_book(BOOK_ID, _BOOK_META, "text")


# ── Create / list / get ──────────────────────────────────────────────────────


async def test_list_decks_empty(client, test_user):
    resp = await client.get("/api/decks")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_manual_deck(client, test_user):
    resp = await client.post(
        "/api/decks",
        json={"name": "My Manual Deck", "mode": "manual"},
    )
    assert resp.status_code == 201
    d = resp.json()
    assert d["name"] == "My Manual Deck"
    assert d["mode"] == "manual"
    assert d["members"] == []
    assert d["rules_json"] is None


async def test_create_smart_deck(client, test_user):
    resp = await client.post(
        "/api/decks",
        json={
            "name": "German B2",
            "mode": "smart",
            "rules_json": {"language": "de", "tags_any": ["b2"]},
        },
    )
    assert resp.status_code == 201
    d = resp.json()
    assert d["mode"] == "smart"
    assert '"language": "de"' in d["rules_json"]


async def test_create_rejects_bad_mode(client, test_user):
    resp = await client.post("/api/decks", json={"name": "x", "mode": "unknown"})
    assert resp.status_code == 422


async def test_create_rejects_duplicate_name(client, test_user):
    first = await client.post("/api/decks", json={"name": "Dup", "mode": "manual"})
    assert first.status_code == 201
    second = await client.post("/api/decks", json={"name": "Dup", "mode": "manual"})
    assert second.status_code == 409
    list_resp = await client.get("/api/decks")
    assert [d["name"] for d in list_resp.json()] == ["Dup"]


async def test_create_smart_rules_reject_unknown_key(client, test_user):
    resp = await client.post(
        "/api/decks",
        json={
            "name": "Bad",
            "mode": "smart",
            "rules_json": {"not_a_real_key": "x"},
        },
    )
    assert resp.status_code == 422


async def test_get_deck_404_for_other_user(client, test_user):
    other = await get_or_create_user("deck-other", "deck-other@ex.com", "Other", "")

    # Create a deck owned by `other` directly via service
    from services import decks as decks_service
    deck = await decks_service.create_deck(other["id"], "Secret", "", "manual", None)

    resp = await client.get(f"/api/decks/{deck['id']}")
    assert resp.status_code == 404


# ── Patch / delete ──────────────────────────────────────────────────────────


async def test_patch_deck_name(client, test_user):
    created = (await client.post("/api/decks", json={"name": "Old", "mode": "manual"})).json()
    resp = await client.patch(f"/api/decks/{created['id']}", json={"name": "New"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"


async def test_delete_deck_cascades_members(client, test_user):
    await _book()
    vid = await _save("cascades", test_user["id"])
    created = (await client.post("/api/decks", json={"name": "Doomed", "mode": "manual"})).json()
    await client.post(f"/api/decks/{created['id']}/members", json={"vocabulary_id": vid})

    resp = await client.delete(f"/api/decks/{created['id']}")
    assert resp.status_code == 204
    # Re-fetch the deck → 404
    assert (await client.get(f"/api/decks/{created['id']}")).status_code == 404


# ── Member management ───────────────────────────────────────────────────────


async def test_add_member_manual_deck(client, test_user):
    await _book()
    vid = await _save("alpha", test_user["id"])
    deck = (await client.post("/api/decks", json={"name": "Manual", "mode": "manual"})).json()

    resp = await client.post(f"/api/decks/{deck['id']}/members", json={"vocabulary_id": vid})
    assert resp.status_code == 201

    refreshed = (await client.get(f"/api/decks/{deck['id']}")).json()
    assert refreshed["members"] == [vid]


async def test_add_member_smart_deck_rejects(client, test_user):
    await _book()
    vid = await _save("nomanual", test_user["id"])
    deck = (await client.post(
        "/api/decks",
        json={"name": "Smart", "mode": "smart", "rules_json": {}},
    )).json()

    resp = await client.post(f"/api/decks/{deck['id']}/members", json={"vocabulary_id": vid})
    assert resp.status_code == 409


async def test_add_member_404_for_foreign_word(client, test_user):
    await _book()
    other = await get_or_create_user("deck-other-2", "deck-other-2@ex.com", "Other", "")
    vid = await _save("foreign", other["id"])
    deck = (await client.post("/api/decks", json={"name": "Mine", "mode": "manual"})).json()

    resp = await client.post(f"/api/decks/{deck['id']}/members", json={"vocabulary_id": vid})
    assert resp.status_code == 404


async def test_remove_member(client, test_user):
    await _book()
    vid = await _save("removable", test_user["id"])
    deck = (await client.post("/api/decks", json={"name": "R", "mode": "manual"})).json()
    await client.post(f"/api/decks/{deck['id']}/members", json={"vocabulary_id": vid})

    resp = await client.delete(f"/api/decks/{deck['id']}/members/{vid}")
    assert resp.status_code == 204

    refreshed = (await client.get(f"/api/decks/{deck['id']}")).json()
    assert refreshed["members"] == []


# ── Smart deck rule resolution ──────────────────────────────────────────────


async def test_smart_deck_resolves_by_language(client, test_user):
    await _book()
    # Save two words in different languages (language is inferred via wiktionary;
    # stub it by poking the vocabulary table).
    vid_en = await _save("english", test_user["id"])
    vid_de = await _save("weltschmerz", test_user["id"])

    import aiosqlite
    from services import db as db_module
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE vocabulary SET language = 'en' WHERE id = ?", (vid_en,))
        await db.execute("UPDATE vocabulary SET language = 'de' WHERE id = ?", (vid_de,))
        await db.commit()

    deck = (await client.post(
        "/api/decks",
        json={"name": "German only", "mode": "smart", "rules_json": {"language": "de"}},
    )).json()

    refreshed = (await client.get(f"/api/decks/{deck['id']}")).json()
    assert refreshed["members"] == [vid_de]


async def test_smart_deck_resolves_by_tag(client, test_user):
    await _book()
    vid_a = await _save("alpha", test_user["id"])
    vid_b = await _save("beta", test_user["id"])

    await client.post(f"/api/vocabulary/{vid_a}/tags", json={"tag": "shared"})
    await client.post(f"/api/vocabulary/{vid_b}/tags", json={"tag": "private"})

    deck = (await client.post(
        "/api/decks",
        json={"name": "Shared only", "mode": "smart", "rules_json": {"tags_any": ["shared"]}},
    )).json()

    refreshed = (await client.get(f"/api/decks/{deck['id']}")).json()
    assert vid_a in refreshed["members"]
    assert vid_b not in refreshed["members"]


async def test_list_decks_reports_member_count_and_due_today(client, test_user):
    await _book()
    vid = await _save("eagereloquent", test_user["id"])
    deck = (await client.post("/api/decks", json={"name": "Stats", "mode": "manual"})).json()
    await client.post(f"/api/decks/{deck['id']}/members", json={"vocabulary_id": vid})

    resp = await client.get("/api/decks")
    entry = next(d for d in resp.json() if d["id"] == deck["id"])
    assert entry["member_count"] == 1
    # New cards seed with due_date = today, so due_today should be 1
    assert entry["due_today"] == 1
