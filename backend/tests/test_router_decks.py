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


async def test_smart_rules_book_ids_rejects_zero(client, test_user):
    resp = await client.post(
        "/api/decks",
        json={"name": "ZeroBook", "mode": "smart", "rules_json": {"book_ids": [0]}},
    )
    assert resp.status_code == 422


async def test_smart_rules_book_ids_rejects_negative(client, test_user):
    resp = await client.post(
        "/api/decks",
        json={"name": "NegBook", "mode": "smart", "rules_json": {"book_ids": [-1]}},
    )
    assert resp.status_code == 422


async def test_smart_rules_book_ids_rejects_oversized_list(client, test_user):
    resp = await client.post(
        "/api/decks",
        json={"name": "HugeList", "mode": "smart", "rules_json": {"book_ids": list(range(1, 202))}},
    )
    assert resp.status_code == 422


async def test_smart_rules_tags_any_rejects_oversized_string(client, test_user):
    resp = await client.post(
        "/api/decks",
        json={"name": "LongTag", "mode": "smart", "rules_json": {"tags_any": ["a" * 51]}},
    )
    assert resp.status_code == 422


async def test_smart_rules_tags_all_rejects_oversized_list(client, test_user):
    resp = await client.post(
        "/api/decks",
        json={"name": "HugeTags", "mode": "smart", "rules_json": {"tags_all": ["t"] * 101}},
    )
    assert resp.status_code == 422


async def test_smart_rules_valid_bounds_accepted(client, test_user):
    resp = await client.post(
        "/api/decks",
        json={
            "name": "ValidBounds",
            "mode": "smart",
            "rules_json": {
                "book_ids": [1, 2, 3],
                "tags_any": ["b2", "vocab"],
                "tags_all": ["saved"],
            },
        },
    )
    assert resp.status_code == 201


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


async def test_patch_deck_no_fields_returns_current_deck(client, test_user):
    """PATCH /decks/{id} with empty body returns the deck unchanged (closes #1498).

    Covers services/decks.py update_deck when fields=[] (no-op path):
    the SELECT-without-UPDATE short-circuit returns the current row.
    """
    created = (await client.post("/api/decks", json={"name": "NoopDeck", "mode": "manual"})).json()
    deck_id = created["id"]

    resp = await client.patch(f"/api/decks/{deck_id}", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == deck_id
    assert data["name"] == "NoopDeck"
    assert data["mode"] == "manual"


async def test_create_deck_whitespace_only_name_returns_422(client, test_user):
    """Regression #1522: POST /decks with whitespace-only name must return 422."""
    resp = await client.post("/api/decks", json={"name": "   ", "mode": "manual"})
    assert resp.status_code == 422, (
        f"Regression #1522: expected 422 for whitespace-only name, got {resp.status_code}: {resp.text}"
    )


async def test_patch_deck_whitespace_only_name_returns_422(client, test_user):
    """Regression #1522: PATCH /decks/{id} with whitespace-only name must return 422."""
    created = (await client.post("/api/decks", json={"name": "ValidDeck", "mode": "manual"})).json()
    resp = await client.patch(f"/api/decks/{created['id']}", json={"name": "\t\n  "})
    assert resp.status_code == 422, (
        f"Regression #1522: expected 422 for whitespace-only name in PATCH, got {resp.status_code}: {resp.text}"
    )


async def test_patch_deck_404_for_nonexistent_deck(client, test_user):
    """Regression #1365: PATCH /decks/{id} on a non-existent deck must return 404."""
    resp = await client.patch("/api/decks/9999", json={"name": "Ghost"})
    assert resp.status_code == 404


async def test_delete_deck_404_for_nonexistent_deck(client, test_user):
    """Regression #1365: DELETE /decks/{id} on a non-existent deck must return 404."""
    resp = await client.delete("/api/decks/9999")
    assert resp.status_code == 404


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


async def test_add_member_404_for_nonexistent_deck(client, test_user):
    """Regression #1351: add member to a deck that doesn't exist must return 404."""
    await _book()
    vid = await _save("orphan", test_user["id"])
    resp = await client.post("/api/decks/9999/members", json={"vocabulary_id": vid})
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


async def test_remove_member_404_for_nonexistent_deck(client, test_user):
    """Regression #1351: remove member from a deck that doesn't exist must return 404."""
    await _book()
    vid = await _save("ghost", test_user["id"])
    resp = await client.delete(f"/api/decks/9999/members/{vid}")
    assert resp.status_code == 404


async def test_remove_member_409_for_smart_deck(client, test_user):
    """Regression #1459: DELETE /decks/{id}/members/{vid} on a smart deck must return 409,
    not 404 (consistent with POST /decks/{id}/members which already returns 409)."""
    await _book()
    vid = await _save("smart_word", test_user["id"])
    deck = (await client.post(
        "/api/decks",
        json={"name": "SmartD", "mode": "smart", "rules_json": {}},
    )).json()

    resp = await client.delete(f"/api/decks/{deck['id']}/members/{vid}")
    assert resp.status_code == 409, (
        f"Regression #1459: expected 409 for smart deck member removal, got {resp.status_code}: {resp.text}"
    )


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


# ── Issue #810: min_length=1 on SmartRules string fields ──────────────────────


async def test_smart_rules_empty_language_returns_422(client, test_user):
    """Regression #810: SmartRules.language="" must be rejected with 422."""
    resp = await client.post(
        "/api/decks",
        json={"name": "EmptyLang", "mode": "smart", "rules_json": {"language": ""}},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for empty language in SmartRules, got {resp.status_code}: {resp.text}"
    )


async def test_smart_rules_empty_tag_in_tags_any_returns_422(client, test_user):
    """Regression #810: SmartRules.tags_any with empty string item must be rejected with 422."""
    resp = await client.post(
        "/api/decks",
        json={"name": "EmptyTag", "mode": "smart", "rules_json": {"tags_any": [""]}},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for empty tag in tags_any, got {resp.status_code}: {resp.text}"
    )


async def test_smart_rules_empty_tag_in_tags_all_returns_422(client, test_user):
    """Regression #810: SmartRules.tags_all with empty string item must be rejected with 422."""
    resp = await client.post(
        "/api/decks",
        json={"name": "EmptyTagAll", "mode": "smart", "rules_json": {"tags_all": [""]}},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for empty tag in tags_all, got {resp.status_code}: {resp.text}"
    )


# ── Issue #979: ISO-date format enforcement on saved_after/saved_before ────────


async def test_smart_rules_invalid_saved_after_returns_422(client, test_user):
    """Regression #979: SmartRules.saved_after with a non-ISO date must be rejected with 422.

    SQLite's date('not-date') evaluates to NULL, so a bad date silently returns
    zero members instead of raising an error."""
    resp = await client.post(
        "/api/decks",
        json={"name": "BadDate", "mode": "smart", "rules_json": {"saved_after": "not-date!"}},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for non-ISO saved_after, got {resp.status_code}: {resp.text}"
    )


async def test_smart_rules_invalid_saved_before_returns_422(client, test_user):
    """Regression #979: SmartRules.saved_before with a non-ISO date must be rejected with 422."""
    resp = await client.post(
        "/api/decks",
        json={"name": "BadDate2", "mode": "smart", "rules_json": {"saved_before": "2024/01/01"}},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for non-ISO saved_before, got {resp.status_code}: {resp.text}"
    )


async def test_smart_rules_valid_iso_dates_accepted(client, test_user):
    """Regression #979: valid YYYY-MM-DD dates in saved_after/saved_before must be accepted."""
    resp = await client.post(
        "/api/decks",
        json={
            "name": "GoodDate",
            "mode": "smart",
            "rules_json": {"saved_after": "2024-01-01", "saved_before": "2025-12-31"},
        },
    )
    assert resp.status_code == 201, (
        f"Expected 201 for valid ISO dates, got {resp.status_code}: {resp.text}"
    )


# ── Issue #995: assert anti-pattern in create_deck ────────────────────────────


async def test_create_deck_raises_runtime_error_not_assertion_error_on_get_failure(
    client, test_user
):
    """Regression #995: services.decks.create_deck must raise RuntimeError (not
    AssertionError) when the post-INSERT get_deck unexpectedly returns None.

    AssertionError is silently dropped under Python -O, causing create_deck to
    return None and the caller to receive a null JSON body instead of the deck."""
    from unittest.mock import AsyncMock, patch
    import services.decks as decks_service

    with patch.object(decks_service, "get_deck", new=AsyncMock(return_value=None)):
        with pytest.raises(RuntimeError, match="deck INSERT succeeded"):
            await decks_service.create_deck(test_user["id"], "TestDeck", "", "manual", None)


# ── Issue #1424: whitespace-only language in SmartRules bypasses min_length ───


async def test_smart_rules_whitespace_language_returns_422(client, test_user):
    """Regression #1424: SmartRules.language="  " passes min_length=1 but must
    still be rejected with 422 — whitespace-only is semantically empty."""
    resp = await client.post(
        "/api/decks",
        json={"name": "WsLang", "mode": "smart", "rules_json": {"language": "  "}},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for whitespace-only language in SmartRules, got {resp.status_code}: {resp.text}"
    )


async def test_smart_rules_whitespace_language_patch_returns_422(client, test_user):
    """Regression #1424: PATCH /decks/{id} with whitespace language must also return 422."""
    create = await client.post(
        "/api/decks",
        json={"name": "WsLangPatch", "mode": "smart", "rules_json": {"language": "en"}},
    )
    assert create.status_code == 201
    deck_id = create.json()["id"]

    resp = await client.patch(
        f"/api/decks/{deck_id}",
        json={"rules_json": {"language": "\t\n"}},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for whitespace-only language in SmartRules PATCH, got {resp.status_code}: {resp.text}"
    )


# ── Issue #1453: whitespace-only tags in tags_any/tags_all bypass min_length ─


async def test_smart_rules_whitespace_tag_in_tags_any_returns_422(client, test_user):
    """Regression #1453: tags_any=[" "] passes min_length=1 but must return 422.
    Vocab tags are always normalized (strip+lowercase), so a whitespace-only
    tag can never match a stored tag — it should be rejected at validation."""
    resp = await client.post(
        "/api/decks",
        json={"name": "WsTagAny", "mode": "smart", "rules_json": {"tags_any": [" "]}},
    )
    assert resp.status_code == 422, (
        f"Regression #1453: whitespace-only tag in tags_any must return 422, "
        f"got {resp.status_code}: {resp.text}"
    )


async def test_smart_rules_whitespace_tag_in_tags_all_returns_422(client, test_user):
    """Regression #1453: tags_all=["\t"] passes min_length=1 but must return 422."""
    resp = await client.post(
        "/api/decks",
        json={"name": "WsTagAll", "mode": "smart", "rules_json": {"tags_all": ["\t"]}},
    )
    assert resp.status_code == 422, (
        f"Regression #1453: whitespace-only tag in tags_all must return 422, "
        f"got {resp.status_code}: {resp.text}"
    )


async def test_smart_rules_whitespace_tag_patch_returns_422(client, test_user):
    """Regression #1453: PATCH /decks/{id} with whitespace tag must also return 422."""
    create = await client.post(
        "/api/decks",
        json={"name": "WsTagPatch", "mode": "smart", "rules_json": {"tags_any": ["python"]}},
    )
    assert create.status_code == 201
    deck_id = create.json()["id"]

    resp = await client.patch(
        f"/api/decks/{deck_id}",
        json={"rules_json": {"tags_any": ["  "]}},
    )
    assert resp.status_code == 422, (
        f"Regression #1453: whitespace-only tag in PATCH tags_any must return 422, "
        f"got {resp.status_code}: {resp.text}"
    )


# ── Issue #1492: max_length on name and description fields ───────────────────


async def test_create_deck_oversized_name_returns_422(client, test_user):
    """POST /decks with name longer than max_length=80 must return 422 (closes #1492)."""
    resp = await client.post(
        "/api/decks",
        json={"name": "n" * 81, "mode": "manual"},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized name, got {resp.status_code}: {resp.text}"


async def test_create_deck_oversized_description_returns_422(client, test_user):
    """POST /decks with description longer than max_length=500 must return 422 (closes #1492)."""
    resp = await client.post(
        "/api/decks",
        json={"name": "ValidName", "mode": "manual", "description": "d" * 501},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized description, got {resp.status_code}: {resp.text}"


async def test_patch_deck_oversized_name_returns_422(client, test_user):
    """PATCH /decks/{id} with name longer than max_length=80 must return 422 (closes #1492)."""
    create = await client.post("/api/decks", json={"name": "PatchTarget", "mode": "manual"})
    assert create.status_code == 201
    deck_id = create.json()["id"]
    resp = await client.patch(f"/api/decks/{deck_id}", json={"name": "n" * 81})
    assert resp.status_code == 422, f"Expected 422 for oversized name in PATCH, got {resp.status_code}: {resp.text}"


async def test_patch_deck_oversized_description_returns_422(client, test_user):
    """PATCH /decks/{id} with description longer than max_length=500 must return 422 (closes #1492)."""
    create = await client.post("/api/decks", json={"name": "PatchDescTarget", "mode": "manual"})
    assert create.status_code == 201
    deck_id = create.json()["id"]
    resp = await client.patch(f"/api/decks/{deck_id}", json={"description": "d" * 501})
    assert resp.status_code == 422, f"Expected 422 for oversized description in PATCH, got {resp.status_code}: {resp.text}"


# ── Issue #1504: SmartRules.language and tags_any list max_length ─────────────


@pytest.mark.asyncio
async def test_smart_rules_oversized_language_returns_422(client, test_user):
    """Regression #1504: SmartRules.language > 20 chars must return 422.
    language declares max_length=20; the empty/whitespace cases are already covered
    but the oversized-string case was missing."""
    resp = await client.post(
        "/api/decks",
        json={"name": "LangDeck", "mode": "smart", "rules_json": {"language": "x" * 21}},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for oversized language in SmartRules, got {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_smart_rules_oversized_tags_any_list_returns_422(client, test_user):
    """Regression #1504: SmartRules.tags_any list with > 100 items must return 422.
    tags_any declares max_length=100 on the list; the per-item max_length=50 case is covered
    but the list-length cap was missing (by contrast tags_all list > 100 already has a test)."""
    resp = await client.post(
        "/api/decks",
        json={"name": "HugeTagsAny", "mode": "smart", "rules_json": {"tags_any": ["t"] * 101}},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for tags_any list > 100 items in SmartRules, got {resp.status_code}: {resp.text}"
    )


# ── Issue #1526: update_deck description + rules_provided coverage ────────────


async def test_patch_deck_description(client, test_user):
    """PATCH /decks/{id} with description updates it (covers services/decks.py lines 154-155)."""
    created = (await client.post("/api/decks", json={"name": "DescDeck", "mode": "manual"})).json()
    resp = await client.patch(
        f"/api/decks/{created['id']}", json={"description": "A new description"}
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "A new description"


async def test_patch_smart_deck_rules_json(client, test_user):
    """PATCH /decks/{id} with rules_json on a smart deck updates rules (covers lines 157-159)."""
    created = (await client.post(
        "/api/decks",
        json={"name": "SmartPatch", "mode": "smart", "rules_json": {"language": "de"}},
    )).json()
    resp = await client.patch(
        f"/api/decks/{created['id']}", json={"rules_json": {"language": "fr"}}
    )
    assert resp.status_code == 200
    assert '"language": "fr"' in resp.json()["rules_json"]


async def test_patch_deck_description_and_name_together(client, test_user):
    """PATCH /decks/{id} updating both name and description in one request."""
    created = (await client.post("/api/decks", json={"name": "OldName", "mode": "manual"})).json()
    resp = await client.patch(
        f"/api/decks/{created['id']}",
        json={"name": "NewName", "description": "Updated desc"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "NewName"
    assert data["description"] == "Updated desc"


# ── Issue #1526: direct service-level tests for _validate_rules + create_deck ─


async def test_validate_rules_none_returns_without_error(tmp_db):
    """_validate_rules(None) must return immediately (covers line 33)."""
    from services.decks import _validate_rules
    _validate_rules(None)  # no exception


async def test_validate_rules_non_dict_raises(tmp_db):
    """_validate_rules with a non-dict raises ValueError (covers line 35)."""
    import pytest
    from services.decks import _validate_rules
    with pytest.raises(ValueError, match="must be an object"):
        _validate_rules("not_a_dict")


async def test_validate_rules_unknown_key_raises(tmp_db):
    """_validate_rules with an unknown key raises ValueError (covers line 38)."""
    import pytest
    from services.decks import _validate_rules
    with pytest.raises(ValueError, match="Unknown rule keys"):
        _validate_rules({"totally_unknown": "x"})


async def test_validate_rules_language_non_string_raises(tmp_db):
    """_validate_rules with language=integer raises ValueError (covers line 40)."""
    import pytest
    from services.decks import _validate_rules
    with pytest.raises(ValueError, match="language must be a string"):
        _validate_rules({"language": 42})


async def test_validate_rules_book_ids_non_list_raises(tmp_db):
    """_validate_rules with book_ids as non-list raises ValueError (covers line 45)."""
    import pytest
    from services.decks import _validate_rules
    with pytest.raises(ValueError, match="book_ids must be a list of integers"):
        _validate_rules({"book_ids": "not_a_list"})


async def test_validate_rules_tags_any_non_string_items_raises(tmp_db):
    """_validate_rules with tags_any containing non-strings raises ValueError (covers line 50)."""
    import pytest
    from services.decks import _validate_rules
    with pytest.raises(ValueError, match="tags_any must be a list of strings"):
        _validate_rules({"tags_any": [1, 2, 3]})


async def test_validate_rules_saved_after_non_string_raises(tmp_db):
    """_validate_rules with saved_after as integer raises ValueError (covers line 53)."""
    import pytest
    from services.decks import _validate_rules
    with pytest.raises(ValueError, match="saved_after must be a YYYY-MM-DD string"):
        _validate_rules({"saved_after": 20260101})


async def test_create_deck_bad_mode_raises(tmp_db, test_user):
    """create_deck() with an invalid mode raises ValueError (covers line 116)."""
    import pytest
    from services.decks import create_deck
    with pytest.raises(ValueError, match="mode must be"):
        await create_deck(test_user["id"], "Deck", "", "invalid_mode", None)
