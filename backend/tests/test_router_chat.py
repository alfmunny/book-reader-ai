"""Tests for /api/chat/* endpoints (InsightChat history persistence, #907)."""

import pytest
import aiosqlite

import services.db as db_module
from services.db import (
    CHAT_MESSAGE_MAX_BYTES,
    get_or_create_user,
    get_user_by_id,
    append_chat_message,
    get_chat_messages,
    clear_chat_messages,
)
from services.auth import get_current_user, get_optional_user
from main import app
from httpx import AsyncClient, ASGITransport


TEST_BOOK_ID = 7001


async def _seed_book(book_id: int) -> None:
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO books (id, title, images, source) "
            "VALUES (?, 'T', '[]', 'gutenberg')",
            (book_id,),
        )
        await db.commit()


# ── helpers ──────────────────────────────────────────────────────────────────


async def test_append_and_get_single_message(tmp_db):
    user = await get_or_create_user("chat-u", "u@t.com", "U", "")
    await _seed_book(TEST_BOOK_ID)
    row = await append_chat_message(user["id"], TEST_BOOK_ID, "user", "Hello?")
    assert row["role"] == "user"
    assert row["content"] == "Hello?"
    assert row["user_id"] == user["id"]
    assert row["book_id"] == TEST_BOOK_ID
    assert row["id"] > 0

    msgs = await get_chat_messages(user["id"], TEST_BOOK_ID)
    assert len(msgs) == 1
    assert msgs[0]["content"] == "Hello?"


async def test_get_messages_newest_first_and_paginates(tmp_db):
    user = await get_or_create_user("chat-p", "p@t.com", "P", "")
    await _seed_book(TEST_BOOK_ID)
    for i in range(7):
        await append_chat_message(
            user["id"], TEST_BOOK_ID, "user" if i % 2 == 0 else "assistant",
            f"message-{i}",
        )

    page1 = await get_chat_messages(user["id"], TEST_BOOK_ID, limit=3)
    assert len(page1) == 3
    # Newest-first ordering: most recent message is `message-6`
    assert page1[0]["content"] == "message-6"
    assert page1[2]["content"] == "message-4"

    # Reverse paginate using before_id
    oldest_on_page = page1[-1]["id"]
    page2 = await get_chat_messages(
        user["id"], TEST_BOOK_ID, limit=3, before_id=oldest_on_page
    )
    assert len(page2) == 3
    assert page2[0]["content"] == "message-3"


async def test_get_messages_scoped_to_user_and_book(tmp_db):
    user_a = await get_or_create_user("ua", "a@t.com", "A", "")
    user_b = await get_or_create_user("ub", "b@t.com", "B", "")
    await _seed_book(TEST_BOOK_ID)
    await _seed_book(TEST_BOOK_ID + 1)

    await append_chat_message(user_a["id"], TEST_BOOK_ID, "user", "a-on-book-1")
    await append_chat_message(user_a["id"], TEST_BOOK_ID + 1, "user", "a-on-book-2")
    await append_chat_message(user_b["id"], TEST_BOOK_ID, "user", "b-on-book-1")

    a_book1 = await get_chat_messages(user_a["id"], TEST_BOOK_ID)
    assert [m["content"] for m in a_book1] == ["a-on-book-1"]

    b_book1 = await get_chat_messages(user_b["id"], TEST_BOOK_ID)
    assert [m["content"] for m in b_book1] == ["b-on-book-1"]


async def test_clear_chat_messages_scoped(tmp_db):
    user = await get_or_create_user("uc", "c@t.com", "C", "")
    await _seed_book(TEST_BOOK_ID)
    await _seed_book(TEST_BOOK_ID + 1)
    for _ in range(3):
        await append_chat_message(user["id"], TEST_BOOK_ID, "user", "x")
    await append_chat_message(user["id"], TEST_BOOK_ID + 1, "user", "y")

    deleted = await clear_chat_messages(user["id"], TEST_BOOK_ID)
    assert deleted == 3
    # Other book untouched
    assert len(await get_chat_messages(user["id"], TEST_BOOK_ID + 1)) == 1
    assert len(await get_chat_messages(user["id"], TEST_BOOK_ID)) == 0


async def test_fk_cascade_on_user_delete(tmp_db):
    from services.db import delete_user

    user = await get_or_create_user("cascade-u", "cu@t.com", "CU", "")
    await _seed_book(TEST_BOOK_ID)
    await append_chat_message(user["id"], TEST_BOOK_ID, "user", "will be gone")

    await delete_user(user["id"])
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM chat_messages WHERE user_id=?", (user["id"],)
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0, "chat_messages should cascade-delete with the user"


async def test_fk_cascade_on_book_delete(tmp_db):
    user = await get_or_create_user("cascade-b", "cb@t.com", "CB", "")
    await _seed_book(TEST_BOOK_ID)
    await append_chat_message(user["id"], TEST_BOOK_ID, "user", "will be gone")

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("DELETE FROM books WHERE id=?", (TEST_BOOK_ID,))
        await db.commit()
        async with db.execute(
            "SELECT COUNT(*) FROM chat_messages WHERE book_id=?", (TEST_BOOK_ID,)
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0, "chat_messages should cascade-delete with the book"


# ── router tests ─────────────────────────────────────────────────────────────


async def test_router_post_and_get_roundtrip(client, test_user):
    await _seed_book(TEST_BOOK_ID)

    res = await client.post(
        f"/api/chat/{TEST_BOOK_ID}/messages",
        json={"role": "user", "content": "What happens in chapter 12?"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["content"] == "What happens in chapter 12?"

    res = await client.get(f"/api/chat/{TEST_BOOK_ID}/messages")
    assert res.status_code == 200
    data = res.json()
    assert len(data["messages"]) == 1
    assert data["has_more"] is False


async def test_router_requires_auth(anon_client):
    res = await anon_client.get(f"/api/chat/{TEST_BOOK_ID}/messages")
    assert res.status_code == 401

    res = await anon_client.post(
        f"/api/chat/{TEST_BOOK_ID}/messages",
        json={"role": "user", "content": "hi"},
    )
    assert res.status_code == 401

    res = await anon_client.delete(f"/api/chat/{TEST_BOOK_ID}/messages")
    assert res.status_code == 401


async def test_router_404_for_missing_book(client):
    res = await client.get("/api/chat/99999/messages")
    assert res.status_code == 404


async def test_router_post_404_for_missing_book(client, test_user):
    """Regression #1374: POST /chat/{id}/messages with non-existent book must return 404."""
    res = await client.post(
        "/api/chat/99999/messages",
        json={"role": "user", "content": "hello"},
    )
    assert res.status_code == 404


async def test_router_delete_404_for_missing_book(client, test_user):
    """Regression #1374: DELETE /chat/{id}/messages with non-existent book must return 404."""
    res = await client.delete("/api/chat/99999/messages")
    assert res.status_code == 404


async def test_router_clear(client, test_user):
    await _seed_book(TEST_BOOK_ID)
    for i in range(4):
        await append_chat_message(
            test_user["id"], TEST_BOOK_ID, "user", f"m{i}"
        )

    res = await client.delete(f"/api/chat/{TEST_BOOK_ID}/messages")
    assert res.status_code == 200
    assert res.json()["deleted"] == 4

    res = await client.get(f"/api/chat/{TEST_BOOK_ID}/messages")
    assert res.json()["messages"] == []


async def test_router_rejects_oversize_message(client, test_user):
    await _seed_book(TEST_BOOK_ID)
    oversize = "x" * (CHAT_MESSAGE_MAX_BYTES + 1)
    res = await client.post(
        f"/api/chat/{TEST_BOOK_ID}/messages",
        json={"role": "user", "content": oversize},
    )
    assert res.status_code == 413


async def test_router_rejects_invalid_role(client, test_user):
    await _seed_book(TEST_BOOK_ID)
    res = await client.post(
        f"/api/chat/{TEST_BOOK_ID}/messages",
        json={"role": "system", "content": "hi"},
    )
    assert res.status_code == 422  # pydantic pattern mismatch


async def test_router_pagination_has_more(client, test_user):
    await _seed_book(TEST_BOOK_ID)
    for i in range(55):
        await append_chat_message(
            test_user["id"], TEST_BOOK_ID, "user", f"m{i}"
        )

    res = await client.get(f"/api/chat/{TEST_BOOK_ID}/messages?limit=50")
    assert res.status_code == 200
    data = res.json()
    assert len(data["messages"]) == 50
    assert data["has_more"] is True

    # Second page via before_id
    last_id = data["messages"][-1]["id"]
    res2 = await client.get(
        f"/api/chat/{TEST_BOOK_ID}/messages?limit=50&before_id={last_id}"
    )
    data2 = res2.json()
    assert len(data2["messages"]) == 5
    assert data2["has_more"] is False


async def test_router_user_isolation(client, test_user):
    """User A's GET must not return user B's messages."""
    await _seed_book(TEST_BOOK_ID)
    other = await get_or_create_user("chat-other", "other@t.com", "Other", "")
    await append_chat_message(other["id"], TEST_BOOK_ID, "user", "other's secret")

    res = await client.get(f"/api/chat/{TEST_BOOK_ID}/messages")
    assert res.status_code == 200
    assert res.json()["messages"] == []


# ── Issue #1116: whitespace-only content bypasses validation ─────────────────


async def test_router_rejects_whitespace_only_content(client, test_user):
    """Regression #1116: POST /chat/{book_id}/messages with content="   " must
    return 422, not store an empty whitespace message."""
    await _seed_book(TEST_BOOK_ID)
    res = await client.post(
        f"/api/chat/{TEST_BOOK_ID}/messages",
        json={"role": "user", "content": "   "},
    )
    assert res.status_code == 422, (
        f"Expected 422 for whitespace-only content, got {res.status_code}: {res.text}"
    )

    # Confirm nothing was persisted.
    get_res = await client.get(f"/api/chat/{TEST_BOOK_ID}/messages")
    assert get_res.status_code == 200
    assert get_res.json()["messages"] == []


async def test_router_rejects_tab_newline_only_content(client, test_user):
    """Regression #1116: tabs and newlines also must not bypass validation."""
    await _seed_book(TEST_BOOK_ID)
    res = await client.post(
        f"/api/chat/{TEST_BOOK_ID}/messages",
        json={"role": "user", "content": "\t\n  "},
    )
    assert res.status_code == 422, (
        f"Expected 422 for tab/newline-only content, got {res.status_code}: {res.text}"
    )
