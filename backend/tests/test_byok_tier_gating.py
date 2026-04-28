"""PR F of the pricing-plans series (#1790).

BYOK (bring your own key) endpoint gating: POST + DELETE /user/gemini-key
require Pro+ tier. Free users get 402 with structured detail. Paid users
proceed normally.

The design (docs/design/pricing-plans.md §"BYOK — bring your own API key")
makes BYOK a paid-tier feature: it bypasses the Pro chapter cap (because
the user pays the LLM bill), so it's fair to gate the toggle itself
behind paid-tier.
"""

import pytest
import aiosqlite
import services.db as db_module


async def _set_tier(user_id: int, tier: str) -> None:
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute("UPDATE users SET tier = ? WHERE id = ?", (tier, user_id))
        await conn.commit()


@pytest.mark.asyncio
async def test_post_gemini_key_blocks_free(client, test_user):
    """Free user cannot set a BYOK key — 402 with tier_required."""
    await _set_tier(test_user["id"], "free")
    resp = await client.post(
        "/api/user/gemini-key",
        json={"api_key": "sk_xxx"},
    )
    assert resp.status_code == 402
    assert resp.json()["detail"]["error"] == "tier_required"
    assert resp.json()["detail"]["required_tier"] == "pro"


@pytest.mark.asyncio
async def test_post_gemini_key_allows_pro(client, test_user):
    """Pro user can set a BYOK key — succeeds."""
    # test_user defaults to pro per conftest
    resp = await client.post(
        "/api/user/gemini-key",
        json={"api_key": "sk_pro_xxx"},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


@pytest.mark.asyncio
async def test_post_gemini_key_allows_premium(client, test_user):
    """Premium user can set a BYOK key — succeeds."""
    await _set_tier(test_user["id"], "premium")
    resp = await client.post(
        "/api/user/gemini-key",
        json={"api_key": "sk_premium_xxx"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_gemini_key_blocks_free(client, test_user):
    """Free user cannot clear a BYOK key — 402."""
    await _set_tier(test_user["id"], "free")
    resp = await client.delete("/api/user/gemini-key")
    assert resp.status_code == 402


@pytest.mark.asyncio
async def test_delete_gemini_key_allows_pro(client, test_user):
    """Pro user can clear a BYOK key — succeeds."""
    resp = await client.delete("/api/user/gemini-key")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_post_gemini_key_anon_returns_401(anon_client):
    """Anonymous user → 401 (auth gate fires before tier gate)."""
    resp = await anon_client.post(
        "/api/user/gemini-key",
        json={"api_key": "sk_xxx"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_existing_free_user_with_key_can_still_read(client, test_user):
    """Free user who set a key BEFORE pricing launch still has it.
    The /user/me endpoint surfaces hasGeminiKey=true so the UI can
    show "you have a key set" without being able to update it."""
    await _set_tier(test_user["id"], "free")
    # Simulate pre-existing key (set directly, bypassing the gated endpoint).
    from services.db import set_user_gemini_key
    from services.auth import encrypt_api_key
    await set_user_gemini_key(test_user["id"], encrypt_api_key("legacy_sk"))
    resp = await client.get("/api/user/me")
    assert resp.status_code == 200
    assert resp.json()["hasGeminiKey"] is True
