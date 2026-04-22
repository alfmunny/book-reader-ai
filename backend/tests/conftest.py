"""
Shared fixtures for router/integration tests.

Provides:
  - `client`  — AsyncClient pointed at a fresh test app with a temp DB
  - `auth_headers` — Bearer token for a pre-created test user
  - `insert_private_book` — factory that inserts an upload-sourced book owned by a given user
"""

import json
import pytest
import aiosqlite
from unittest.mock import AsyncMock, patch
import services.db as db_module
from services.db import init_db, get_or_create_user, get_user_by_id
from services.auth import create_jwt, get_current_user, get_optional_user
from main import app
from httpx import AsyncClient, ASGITransport


TEST_USER = {
    "google_id": "test-google-id",
    "email": "test@example.com",
    "name": "Test User",
    "picture": "",
}


@pytest.fixture(autouse=True)
def no_wiktionary_http(monkeypatch):
    """Prevent _update_lemma from making real HTTP calls in every test."""
    monkeypatch.setattr(db_module, "_update_lemma", AsyncMock(return_value=None))


@pytest.fixture(autouse=True)
def clear_chapter_cache():
    """Reset the in-memory chapter-split cache between tests.

    The cache is a process-level dict keyed by book_id. Without this,
    a test that confirms an uploaded book (id=1) populates the cache,
    and a later test that uploads a *draft* book (also id=1 in a fresh
    temp DB) receives stale confirmed chapters — causing wrong
    total_chapters counts.
    """
    from services.book_chapters import clear_cache
    clear_cache()
    yield
    clear_cache()


@pytest.fixture
async def tmp_db(monkeypatch, tmp_path):
    path = str(tmp_path / "test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()
    return path


@pytest.fixture
async def test_user(tmp_db):
    return await get_or_create_user(**TEST_USER)


@pytest.fixture
async def client(test_user):
    """AsyncClient authenticated as test_user (overrides both auth dependencies)."""
    async def _override():
        return await get_user_by_id(test_user["id"])

    app.dependency_overrides[get_current_user] = _override
    app.dependency_overrides[get_optional_user] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
async def anon_client(tmp_db):
    """AsyncClient with no authentication (get_optional_user returns None)."""
    app.dependency_overrides[get_optional_user] = lambda: None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(test_user):
    token = create_jwt(test_user["id"], test_user["email"])
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def insert_private_book():
    """Return a coroutine that inserts an upload-sourced private book owned by the given user.

    Usage in tests::

        await insert_private_book(book_id=8801, owner_user_id=owner["id"])
    """
    async def _impl(book_id: int, owner_user_id: int) -> None:
        chapters = json.dumps({"draft": False, "chapters": [{"title": "Ch1", "text": "private"}]})
        async with aiosqlite.connect(db_module.DB_PATH) as db:
            await db.execute(
                """INSERT OR REPLACE INTO books
                   (id, title, authors, languages, subjects, download_count,
                    cover, text, images, source, owner_user_id)
                   VALUES (?, 'Private', '[]', '["en"]', '[]', 0, '', ?, '[]', 'upload', ?)""",
                (book_id, chapters, owner_user_id),
            )
            await db.commit()
    return _impl
