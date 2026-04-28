"""PR C3 of the pricing-plans series (#1790).

Stripe Checkout + Customer Portal session creation. Patches the Stripe
SDK's session-create methods so tests don't make real Stripe API calls.
"""

import pytest
import aiosqlite
from unittest.mock import patch, MagicMock
import services.db as db_module


@pytest.fixture(autouse=True)
def _stripe_env(monkeypatch):
    monkeypatch.setenv("STRIPE_API_KEY", "sk_test_dummy")
    monkeypatch.setenv("STRIPE_PRICE_PRO", "price_pro_test")
    monkeypatch.setenv("STRIPE_PRICE_PREMIUM", "price_premium_test")


def _mock_session(url: str = "https://checkout.stripe.com/c/pay/cs_test_xxx"):
    return MagicMock(url=url)


# ── POST /billing/checkout ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_checkout_pro_returns_redirect_url(client, test_user):
    with patch("stripe.checkout.Session.create", return_value=_mock_session("https://checkout.stripe.com/pay/pro")) as m:
        resp = await client.post(
            "/api/billing/checkout",
            json={"tier": "pro", "success_url": "https://app/ok", "cancel_url": "https://app/cancel"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["url"] == "https://checkout.stripe.com/pay/pro"
    # Stripe SDK was called with the right args.
    call_kwargs = m.call_args.kwargs
    assert call_kwargs["mode"] == "subscription"
    assert call_kwargs["line_items"] == [{"price": "price_pro_test", "quantity": 1}]
    assert call_kwargs["client_reference_id"] == str(test_user["id"])
    assert call_kwargs["success_url"] == "https://app/ok"


@pytest.mark.asyncio
async def test_checkout_premium_uses_premium_price(client, test_user):
    with patch("stripe.checkout.Session.create", return_value=_mock_session()) as m:
        await client.post(
            "/api/billing/checkout",
            json={"tier": "premium", "success_url": "https://x", "cancel_url": "https://x"},
        )
    assert m.call_args.kwargs["line_items"] == [{"price": "price_premium_test", "quantity": 1}]


@pytest.mark.asyncio
async def test_checkout_invalid_tier_returns_422(client):
    """Pydantic regex validation catches 'free' / 'enterprise' / etc."""
    resp = await client.post(
        "/api/billing/checkout",
        json={"tier": "free", "success_url": "https://x", "cancel_url": "https://x"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_checkout_uses_existing_customer(client, test_user):
    """Returning customer (already has stripe_customer_id) reuses it
    instead of creating a new Stripe Customer."""
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET stripe_customer_id = ? WHERE id = ?",
            ("cus_existing_xyz", test_user["id"]),
        )
        await conn.commit()
    with patch("stripe.checkout.Session.create", return_value=_mock_session()) as m:
        await client.post(
            "/api/billing/checkout",
            json={"tier": "pro", "success_url": "https://x", "cancel_url": "https://x"},
        )
    assert m.call_args.kwargs["customer"] == "cus_existing_xyz"
    # No customer_email when reusing
    assert "customer_email" not in m.call_args.kwargs


@pytest.mark.asyncio
async def test_checkout_first_time_uses_email(client, test_user):
    """First-time customer (no stripe_customer_id) uses customer_email
    so Stripe creates a new Customer."""
    with patch("stripe.checkout.Session.create", return_value=_mock_session()) as m:
        await client.post(
            "/api/billing/checkout",
            json={"tier": "pro", "success_url": "https://x", "cancel_url": "https://x"},
        )
    assert m.call_args.kwargs.get("customer_email") == test_user["email"]
    assert "customer" not in m.call_args.kwargs


@pytest.mark.asyncio
async def test_checkout_missing_price_env_returns_500(client, monkeypatch):
    monkeypatch.delenv("STRIPE_PRICE_PRO", raising=False)
    resp = await client.post(
        "/api/billing/checkout",
        json={"tier": "pro", "success_url": "https://x", "cancel_url": "https://x"},
    )
    assert resp.status_code == 500


@pytest.mark.asyncio
async def test_checkout_missing_api_key_returns_500(client, monkeypatch):
    monkeypatch.delenv("STRIPE_API_KEY", raising=False)
    resp = await client.post(
        "/api/billing/checkout",
        json={"tier": "pro", "success_url": "https://x", "cancel_url": "https://x"},
    )
    assert resp.status_code == 500


@pytest.mark.asyncio
async def test_checkout_requires_auth(anon_client):
    resp = await anon_client.post(
        "/api/billing/checkout",
        json={"tier": "pro", "success_url": "https://x", "cancel_url": "https://x"},
    )
    assert resp.status_code == 401


# ── POST /billing/portal ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_portal_returns_redirect_url(client, test_user):
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET stripe_customer_id = ? WHERE id = ?",
            ("cus_portal_test", test_user["id"]),
        )
        await conn.commit()
    with patch("stripe.billing_portal.Session.create",
               return_value=_mock_session("https://billing.stripe.com/portal/test")) as m:
        resp = await client.post(
            "/api/billing/portal",
            json={"return_url": "https://app/account"},
        )
    assert resp.status_code == 200
    assert resp.json()["url"] == "https://billing.stripe.com/portal/test"
    assert m.call_args.kwargs["customer"] == "cus_portal_test"
    assert m.call_args.kwargs["return_url"] == "https://app/account"


@pytest.mark.asyncio
async def test_portal_no_customer_returns_400(client, test_user):
    """User without stripe_customer_id (never checked out) → 400."""
    resp = await client.post(
        "/api/billing/portal",
        json={"return_url": "https://app/account"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_portal_requires_auth(anon_client):
    resp = await anon_client.post(
        "/api/billing/portal",
        json={"return_url": "https://x"},
    )
    assert resp.status_code == 401
