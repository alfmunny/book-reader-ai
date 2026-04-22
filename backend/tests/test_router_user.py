"""
Tests for routers/user.py — profile and Gemini key management.
"""

import pytest
from services.db import get_user_by_id, set_user_gemini_key, save_book, get_or_create_user
from services.auth import encrypt_api_key, decrypt_api_key

_BOOK_META = {"title": "Test Book", "authors": ["Author"], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""}
BOOK_ID = 9999


async def test_get_me_returns_profile(client, test_user):
    resp = await client.get("/api/user/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == test_user["email"]
    assert data["name"] == test_user["name"]
    assert data["hasGeminiKey"] is False


async def test_get_me_reflects_gemini_key_status(client, test_user):
    await set_user_gemini_key(test_user["id"], encrypt_api_key("AIza-key"))
    resp = await client.get("/api/user/me")
    assert resp.json()["hasGeminiKey"] is True


async def test_save_gemini_key(client, test_user):
    resp = await client.post("/api/user/gemini-key", json={"api_key": "AIza-my-key"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    updated = await get_user_by_id(test_user["id"])
    assert updated["gemini_key"] is not None
    assert decrypt_api_key(updated["gemini_key"]) == "AIza-my-key"


async def test_save_empty_gemini_key_returns_400(client):
    resp = await client.post("/api/user/gemini-key", json={"api_key": "   "})
    assert resp.status_code == 400


async def test_delete_gemini_key(client, test_user):
    await set_user_gemini_key(test_user["id"], encrypt_api_key("AIza-key"))

    resp = await client.delete("/api/user/gemini-key")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    updated = await get_user_by_id(test_user["id"])
    assert updated["gemini_key"] is None


async def test_delete_gemini_key_when_none_does_not_raise(client):
    resp = await client.delete("/api/user/gemini-key")
    assert resp.status_code == 200


async def test_reading_progress_empty_initially(client, test_user):
    resp = await client.get("/api/user/reading-progress")
    assert resp.status_code == 200
    assert resp.json()["entries"] == []


async def test_reading_progress_save_and_retrieve(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.put(f"/api/user/reading-progress/{BOOK_ID}", json={"chapter_index": 0})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    resp = await client.get("/api/user/reading-progress")
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["book_id"] == BOOK_ID
    assert entries[0]["chapter_index"] == 0


async def test_reading_progress_upserts(client, test_user):
    from services.book_chapters import clear_cache as _clear
    _multi = "\n\n".join(f"CHAPTER {i}\n\n" + "word " * 200 for i in range(1, 7))
    await save_book(BOOK_ID, _BOOK_META, _multi)
    _clear()
    await client.put(f"/api/user/reading-progress/{BOOK_ID}", json={"chapter_index": 1})
    await client.put(f"/api/user/reading-progress/{BOOK_ID}", json={"chapter_index": 5})

    resp = await client.get("/api/user/reading-progress")
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["chapter_index"] == 5


async def test_reading_progress_rejects_nonexistent_book(client, test_user):
    """PUT reading-progress for a book that doesn't exist must return 404,
    not silently insert an orphaned row (FK enforcement is OFF in SQLite)."""
    resp = await client.put("/api/user/reading-progress/88888", json={"chapter_index": 1})
    assert resp.status_code == 404


async def test_reading_progress_rejects_negative_chapter_index(client, test_user):
    """PUT reading-progress with chapter_index < 0 must return 400.

    Negative indices are not valid chapter positions. Storing them would
    silently corrupt the user's resume position."""
    from services.db import save_book
    _META = {"title": "T", "authors": [], "languages": ["en"], "subjects": [],
              "download_count": 0, "cover": ""}
    await save_book(BOOK_ID, _META, "text")
    resp = await client.put(f"/api/user/reading-progress/{BOOK_ID}", json={"chapter_index": -1})
    assert resp.status_code == 400


async def test_get_obsidian_settings_returns_defaults_initially(client, test_user):
    resp = await client.get("/api/user/obsidian-settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["obsidian_repo"] == ""
    # obsidian_path has a DB DEFAULT — assert it's a string (not None/error)
    assert isinstance(data["obsidian_path"], str)


async def test_patch_obsidian_settings_saves_and_retrieves(client, test_user):
    resp = await client.patch("/api/user/obsidian-settings", json={
        "github_token": "ghp_test_token",
        "obsidian_repo": "user/vault",
        "obsidian_path": "Notes/Books",
    })
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    resp = await client.get("/api/user/obsidian-settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["obsidian_repo"] == "user/vault"
    assert data["obsidian_path"] == "Notes/Books"


async def test_patch_obsidian_settings_preserves_token_when_not_supplied(client, test_user):
    """PATCH without github_token must not wipe the existing encrypted token."""
    from services.auth import encrypt_api_key, decrypt_api_key
    from services.db import update_obsidian_settings, get_obsidian_settings

    await update_obsidian_settings(test_user["id"], encrypt_api_key("existing-token"), "r/v", "/p")

    await client.patch("/api/user/obsidian-settings", json={
        "obsidian_repo": "r/v-updated",
        "obsidian_path": "/p-updated",
    })

    settings = await get_obsidian_settings(test_user["id"])
    assert decrypt_api_key(settings["github_token"]) == "existing-token"
    assert settings["obsidian_repo"] == "r/v-updated"


async def test_obsidian_settings_require_auth(anon_client):
    resp = await anon_client.get("/api/user/obsidian-settings")
    assert resp.status_code == 401

    resp = await anon_client.patch("/api/user/obsidian-settings", json={"obsidian_repo": "r/v", "obsidian_path": "p"})
    assert resp.status_code == 401


async def test_get_obsidian_settings_has_github_token_field(client, test_user):
    """GET /obsidian-settings must report whether a token is configured
    so the frontend can show a 'configured' indicator without leaking the token."""
    from services.db import update_obsidian_settings
    from services.auth import encrypt_api_key

    resp = await client.get("/api/user/obsidian-settings")
    assert resp.status_code == 200
    assert resp.json()["has_github_token"] is False

    await update_obsidian_settings(test_user["id"], encrypt_api_key("ghp_abc"), "u/r", None)

    resp = await client.get("/api/user/obsidian-settings")
    assert resp.json()["has_github_token"] is True


async def test_patch_obsidian_settings_clears_token_with_empty_string(client, test_user):
    """Sending github_token='' must clear the stored token — users have
    no other way to revoke their GitHub credentials from the app."""
    from services.db import update_obsidian_settings, get_obsidian_settings
    from services.auth import encrypt_api_key

    await update_obsidian_settings(test_user["id"], encrypt_api_key("ghp_abc"), "u/r", None)

    resp = await client.patch("/api/user/obsidian-settings", json={
        "github_token": "",
        "obsidian_repo": "u/r",
        "obsidian_path": "",
    })
    assert resp.status_code == 200

    settings = await get_obsidian_settings(test_user["id"])
    assert settings["github_token"] is None, "empty-string token must clear the stored token"


async def test_patch_obsidian_settings_token_not_clobbered_by_stale_read(client, test_user, monkeypatch):
    """Regression #344: PATCH without github_token must not overwrite a token
    that was written between the read and write of a concurrent request.

    With the bug: the handler reads the old token, a concurrent write upgrades
    it to v2, then the handler writes back the stale v1 — silently deleting the
    user's GitHub credential.
    With the fix: when github_token is absent the handler never reads or writes
    the github_token column at all, so the DB value is always preserved.
    """
    from services.db import update_obsidian_settings, get_obsidian_settings
    from services.auth import encrypt_api_key, decrypt_api_key
    import routers.user as user_router_module

    # Set v1 token in DB.
    await update_obsidian_settings(test_user["id"], encrypt_api_key("token-v1"), "r/v", "/p")

    # Simulate a concurrent request that already wrote token-v2 BEFORE our
    # handler's write, but AFTER its read — by monkeypatching get_obsidian_settings
    # in the router namespace to return stale v1 data while the DB has v2.
    await update_obsidian_settings(test_user["id"], encrypt_api_key("token-v2"), "r/v", "/p")

    async def stale_get(user_id):
        return {"github_token": encrypt_api_key("token-v1"), "obsidian_repo": "r/v", "obsidian_path": "/p"}

    monkeypatch.setattr(user_router_module, "get_obsidian_settings", stale_get)

    resp = await client.patch("/api/user/obsidian-settings", json={
        "obsidian_repo": "r/v-updated",
    })
    assert resp.status_code == 200

    # Undo only our patch so get_obsidian_settings goes back to the real impl.
    monkeypatch.setattr(user_router_module, "get_obsidian_settings", get_obsidian_settings)
    settings = await get_obsidian_settings(test_user["id"])
    # With the bug: token would be v1 (stale read overwrote v2).
    # With the fix: token stays v2 because the UPDATE skips the github_token column.
    assert decrypt_api_key(settings["github_token"]) == "token-v2", \
        "concurrent token update must not be silently overwritten by a PATCH that omits github_token"
    assert settings["obsidian_repo"] == "r/v-updated"


# ── Access control for private uploaded books ─────────────────────────────────


async def test_update_reading_progress_blocked_for_non_owner(client, test_user, tmp_db, insert_private_book):
    """PUT /user/reading-progress/{book_id} must return 403 for non-owners of private books.

    Without check_book_access the endpoint only checks existence; any authenticated
    user can record reading progress (and reading history) for another user's private book."""
    from services.db import set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("rp-owner-gid", "rp-owner@ex.com", "RPOwner", "")
    await insert_private_book(8701, owner["id"])
    resp = await client.put("/api/user/reading-progress/8701", json={"chapter_index": 2})
    assert resp.status_code == 403, (
        f"Expected 403 for non-owner updating reading progress of private book, "
        f"got {resp.status_code}: {resp.text}"
    )


async def test_reading_progress_out_of_bounds_chapter_returns_400(client, test_user, tmp_db):
    """PUT /user/reading-progress/{book_id} rejects chapter_index beyond book's chapter count (issue #450)."""
    from services.book_chapters import clear_cache as _clear
    _META3 = {"title": "T3", "authors": [], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""}
    text = "CHAPTER I\n\n" + "word " * 200 + "\n\nCHAPTER II\n\n" + "word " * 200
    await save_book(9884, {**_META3, "id": 9884}, text)
    _clear()
    resp = await client.put("/api/user/reading-progress/9884", json={"chapter_index": 999})
    assert resp.status_code == 400, f"Expected 400 for out-of-bounds chapter, got {resp.status_code}: {resp.text}"
    assert "out of range" in resp.json()["detail"].lower()
