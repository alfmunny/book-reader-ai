"""Tests for routers/insights.py — POST, GET, DELETE endpoints."""

import pytest
from httpx import AsyncClient


async def test_post_creates_insight_and_returns_it(client: AsyncClient):
    payload = {
        "book_id": 1,
        "chapter_index": 2,
        "question": "What is the theme?",
        "answer": "The theme is love.",
    }
    resp = await client.post("/api/insights", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["book_id"] == 1
    assert data["chapter_index"] == 2
    assert data["question"] == "What is the theme?"
    assert data["answer"] == "The theme is love."
    assert "id" in data


async def test_post_with_null_chapter_index(client: AsyncClient):
    payload = {
        "book_id": 5,
        "chapter_index": None,
        "question": "Who is the author?",
        "answer": "Jane Austen.",
    }
    resp = await client.post("/api/insights", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["chapter_index"] is None
    assert data["book_id"] == 5


async def test_get_returns_insights_for_book_id(client: AsyncClient):
    # Create two insights for book 10 and one for book 99
    for i in range(2):
        await client.post(
            "/api/insights",
            json={"book_id": 10, "question": f"Q{i}", "answer": f"A{i}"},
        )
    await client.post(
        "/api/insights",
        json={"book_id": 99, "question": "Other", "answer": "Other"},
    )

    resp = await client.get("/api/insights", params={"book_id": 10})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert all(item["book_id"] == 10 for item in data)


async def test_get_returns_only_current_users_insights(client: AsyncClient, test_user):
    """A second authenticated client should not see the first user's insights."""
    import services.db as db_module
    from services.db import save_insight

    # Create insight for test_user (via client fixture)
    await client.post(
        "/api/insights",
        json={"book_id": 7, "question": "Q1", "answer": "A1"},
    )

    # Create insight for a different user directly in DB
    from services.db import get_or_create_user
    other_user = await get_or_create_user(
        google_id="other-google",
        email="other@example.com",
        name="Other User",
        picture="",
    )
    await save_insight(other_user["id"], 7, None, "Q2", "A2")

    resp = await client.get("/api/insights", params={"book_id": 7})
    assert resp.status_code == 200
    data = resp.json()
    # Only the current user's insight should be returned
    assert len(data) == 1
    assert data[0]["question"] == "Q1"


async def test_delete_returns_ok(client: AsyncClient):
    resp = await client.post(
        "/api/insights",
        json={"book_id": 3, "question": "Delete me", "answer": "Yes"},
    )
    insight_id = resp.json()["id"]

    del_resp = await client.delete(f"/api/insights/{insight_id}")
    assert del_resp.status_code == 200
    assert del_resp.json() == {"ok": True}


async def test_delete_returns_404_if_not_found(client: AsyncClient):
    resp = await client.delete("/api/insights/999999")
    assert resp.status_code == 404


async def test_delete_returns_404_if_wrong_user(client: AsyncClient, test_user):
    """Insight belonging to another user should not be deletable."""
    from services.db import save_insight, get_or_create_user

    other_user = await get_or_create_user(
        google_id="other-google-2",
        email="other2@example.com",
        name="Other 2",
        picture="",
    )
    insight = await save_insight(other_user["id"], 4, None, "Q?", "A!")
    insight_id = insight["id"]

    del_resp = await client.delete(f"/api/insights/{insight_id}")
    assert del_resp.status_code == 404
