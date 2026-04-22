"""Tests for admin endpoints — users, books, audio, translations, stats."""

import json
import pytest
from unittest.mock import patch, AsyncMock
import aiosqlite
import services.db as db_module
import routers.admin as admin_module
from services.db import (
    init_db, get_or_create_user, get_user_by_id, save_book,
    save_translation, set_user_approved, create_annotation, save_insight,
    upsert_reading_progress, save_word, get_vocabulary,
)
from services.auth import get_current_user, create_jwt
from main import app
from httpx import AsyncClient, ASGITransport


ADMIN_USER = {
    "google_id": "admin-google-id",
    "email": "admin@example.com",
    "name": "Admin",
    "picture": "",
}

BOOK_META = {
    "id": 100,
    "title": "Test Book",
    "authors": ["Author"],
    "languages": ["de"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}

BOOK_TEXT = "CHAPTER I\n\nErster Absatz des ersten Kapitels.\n\nZweiter Absatz.\n\nCHAPTER II\n\nErstes Kapitel zwei."


@pytest.fixture
async def admin_db(monkeypatch, tmp_path):
    path = str(tmp_path / "admin-test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    monkeypatch.setattr(admin_module, "DB_PATH", path)

    async def _no_html(_book_id):
        return None
    monkeypatch.setattr("services.book_chapters.get_book_html", _no_html)
    from services.book_chapters import clear_cache as _clear_cache
    _clear_cache()

    await init_db()
    return path


@pytest.fixture
async def admin_user(admin_db):
    """First user is auto-admin."""
    return await get_or_create_user(**ADMIN_USER)


@pytest.fixture
async def admin_client(admin_user):
    async def _override():
        return await get_user_by_id(admin_user["id"])

    app.dependency_overrides[get_current_user] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


# ── Users ────────────────────────────────────────────────────────────────────

async def test_get_users(admin_client, admin_user):
    res = await admin_client.get("/api/admin/users")
    assert res.status_code == 200
    users = res.json()
    assert len(users) >= 1
    assert any(u["email"] == "admin@example.com" for u in users)


async def test_approve_user(admin_client, admin_db):
    user2 = await get_or_create_user(
        google_id="user2", email="u2@test.com", name="User2", picture=""
    )
    res = await admin_client.put(
        f"/api/admin/users/{user2['id']}/approve",
        json={"approved": True},
    )
    assert res.status_code == 200
    updated = await get_user_by_id(user2["id"])
    assert updated["approved"] == 1


async def test_change_role(admin_client, admin_db):
    user2 = await get_or_create_user(
        google_id="user2", email="u2@test.com", name="User2", picture=""
    )
    await set_user_approved(user2["id"], True)
    res = await admin_client.put(
        f"/api/admin/users/{user2['id']}/role",
        json={"role": "admin"},
    )
    assert res.status_code == 200
    updated = await get_user_by_id(user2["id"])
    assert updated["role"] == "admin"


async def test_approve_nonexistent_user_returns_404(admin_client):
    """Approving a user that doesn't exist must return 404, not 200."""
    res = await admin_client.put("/api/admin/users/99999/approve", json={"approved": True})
    assert res.status_code == 404


async def test_change_role_nonexistent_user_returns_404(admin_client):
    """Changing role for a user that doesn't exist must return 404, not 200."""
    res = await admin_client.put("/api/admin/users/99999/role", json={"role": "admin"})
    assert res.status_code == 404


async def test_remove_nonexistent_user_returns_404(admin_client):
    """Deleting a user that doesn't exist must return 404, not 200."""
    res = await admin_client.delete("/api/admin/users/99999")
    assert res.status_code == 404


async def test_change_role_invalid(admin_client):
    res = await admin_client.put("/api/admin/users/1/role", json={"role": "superuser"})
    assert res.status_code == 400


async def test_cannot_demote_self(admin_client, admin_user):
    res = await admin_client.put(
        f"/api/admin/users/{admin_user['id']}/role",
        json={"role": "user"},
    )
    assert res.status_code == 400
    assert "yourself" in res.json()["detail"].lower()


async def test_delete_user(admin_client, admin_db):
    user2 = await get_or_create_user(
        google_id="del-user", email="del@test.com", name="Del", picture=""
    )
    res = await admin_client.delete(f"/api/admin/users/{user2['id']}")
    assert res.status_code == 200
    assert await get_user_by_id(user2["id"]) is None


async def test_cannot_delete_self(admin_client, admin_user):
    res = await admin_client.delete(f"/api/admin/users/{admin_user['id']}")
    assert res.status_code == 400


async def test_delete_user_removes_all_user_data(admin_client, admin_db, admin_user):
    """delete_user must cascade to all user-owned tables — vocabulary,
    word_occurrences, annotations, book_insights, and reading_progress."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    user2 = await get_or_create_user(
        google_id="del-user-cascade", email="cascade@test.com", name="Cascade", picture=""
    )

    with patch("services.db._update_lemma", new_callable=AsyncMock):
        await save_word(user2["id"], "cascadeword", 100, 0, "A cascade sentence.")
    await create_annotation(user2["id"], 100, 0, "Some text.", "", "yellow")
    await save_insight(user2["id"], 100, 0, "Q?", "A.")
    await upsert_reading_progress(user2["id"], 100, 2)

    res = await admin_client.delete(f"/api/admin/users/{user2['id']}")
    assert res.status_code == 200

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        for table, col in [
            ("vocabulary", "user_id"),
            ("annotations", "user_id"),
            ("book_insights", "user_id"),
            ("user_reading_progress", "user_id"),
        ]:
            async with conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {col} = ?", (user2["id"],)
            ) as cur:
                (count,) = await cur.fetchone()
            assert count == 0, f"orphaned rows left in {table} after delete_user"

        async with conn.execute(
            "SELECT COUNT(*) FROM word_occurrences wo "
            "JOIN vocabulary v ON v.id = wo.vocabulary_id "
            "WHERE v.user_id = ?",
            (user2["id"],)
        ) as cur:
            (occ_count,) = await cur.fetchone()
    assert occ_count == 0, "orphaned word_occurrences left after delete_user"


# ── Books ────────────────────────────────────────────────────────────────────

async def test_get_books(admin_client, admin_db):
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.get("/api/admin/books")
    assert res.status_code == 200
    books = res.json()
    assert len(books) >= 1
    assert books[0]["text_length"] > 0
    # New: translations field (empty when none cached)
    assert books[0]["translations"] == {}


async def test_get_books_includes_translation_counts(admin_client, admin_db):
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "en", ["a"])
    await save_translation(100, 1, "en", ["b"])
    await save_translation(100, 0, "zh", ["中"])

    res = await admin_client.get("/api/admin/books")
    assert res.status_code == 200
    books = res.json()
    book = next(b for b in books if b["id"] == 100)
    assert book["translations"] == {"en": 2, "zh": 1}


async def test_delete_book(admin_client, admin_db):
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.delete("/api/admin/books/100")
    assert res.status_code == 200


async def test_delete_book_nonexistent_returns_404(admin_client):
    """DELETE /admin/books/{id} for a non-existent book must return 404, not 200."""
    res = await admin_client.delete("/api/admin/books/99999")
    assert res.status_code == 404


async def test_delete_book_removes_queue_entries(admin_client, admin_db):
    """Regression: delete_book must also delete translation_queue entries.

    If queue entries are left behind with status='skipped' (set by the worker
    when it finds the book missing), a subsequent re-import of the same book_id
    cannot enqueue new translations — INSERT OR IGNORE is blocked by the old
    skipped rows. The re-imported book would never be translated.
    """
    from services.translation_queue import enqueue, queue_status_for_chapter

    await save_book(100, BOOK_META, BOOK_TEXT)
    await enqueue(100, 0, "de")  # Add a pending queue entry

    # Confirm the entry exists before deletion
    status = await queue_status_for_chapter(100, 0, "de")
    assert status["queued"]

    # Delete the book
    res = await admin_client.delete("/api/admin/books/100")
    assert res.status_code == 200

    # Queue entry should be gone — not just skipped, but deleted
    status = await queue_status_for_chapter(100, 0, "de")
    assert not status["queued"]


async def test_delete_book_removes_word_occurrences(admin_client, admin_db):
    await save_book(100, BOOK_META, BOOK_TEXT)
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "INSERT INTO vocabulary (user_id, word) VALUES (1, 'ephemeral')"
        )
        await db.execute(
            "INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text)"
            " VALUES (1, 100, 0, 'The ephemeral moment.')"
        )
        await db.commit()
    await admin_client.delete("/api/admin/books/100")
    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM word_occurrences WHERE book_id = 100"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0


async def test_delete_book_removes_annotations(admin_client, admin_db, admin_user):
    await save_book(100, BOOK_META, BOOK_TEXT)
    await create_annotation(admin_user["id"], 100, 0, "A great line.", "The full quote.", "yellow")
    await admin_client.delete("/api/admin/books/100")
    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM annotations WHERE book_id = 100"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0


async def test_delete_book_removes_book_insights(admin_client, admin_db, admin_user):
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_insight(admin_user["id"], 100, 0, "What is the theme?", "The theme is...", None)
    await admin_client.delete("/api/admin/books/100")
    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM book_insights WHERE book_id = 100"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0


async def test_delete_book_removes_reading_progress(admin_client, admin_db, admin_user):
    await save_book(100, BOOK_META, BOOK_TEXT)
    await upsert_reading_progress(admin_user["id"], 100, 2)
    await admin_client.delete("/api/admin/books/100")
    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM user_reading_progress WHERE book_id = 100"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0


# ── Translations ─────────────────────────────────────────────────────────────

async def test_get_translations(admin_client, admin_db):
    await save_translation(100, 0, "en", ["Hello"])
    res = await admin_client.get("/api/admin/translations")
    assert res.status_code == 200
    assert len(res.json()) >= 1


async def test_delete_book_translations(admin_client, admin_db):
    await save_translation(100, 0, "en", ["Hello"])
    res = await admin_client.delete("/api/admin/translations/100")
    assert res.status_code == 200
    assert res.json()["deleted"] >= 1


async def test_delete_specific_translation(admin_client, admin_db):
    await save_translation(100, 0, "en", ["Hello"])
    await save_translation(100, 0, "de", ["Hallo"])
    res = await admin_client.delete("/api/admin/translations/100/0/en")
    assert res.status_code == 200
    assert res.json()["deleted"] == 1


async def test_delete_specific_translation_not_found_returns_404(admin_client):
    """DELETE specific translation that doesn't exist must return 404, not 200."""
    res = await admin_client.delete("/api/admin/translations/99999/0/de")
    assert res.status_code == 404


# ── Audio ────────────────────────────────────────────────────────────────────

async def test_get_audio_empty(admin_client, admin_db):
    res = await admin_client.get("/api/admin/audio")
    assert res.status_code == 200
    assert res.json() == []


async def test_delete_book_audio(admin_client, admin_db):
    res = await admin_client.delete("/api/admin/audio/999")
    assert res.status_code == 200
    assert res.json()["deleted"] == 0


# ── Stats ────────────────────────────────────────────────────────────────────

async def test_stats(admin_client, admin_db):
    res = await admin_client.get("/api/admin/stats")
    assert res.status_code == 200
    data = res.json()
    assert "users_total" in data
    assert "books_cached" in data
    assert "translations_cached" in data
    assert data["users_total"] >= 1


# ── Retranslate ──────────────────────────────────────────────────────────────

async def test_retranslate_creates_new_translation(admin_client, admin_user):
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "en", ["Old stale translation."])

    with patch(
        "routers.admin.do_translate",
        new_callable=AsyncMock,
        return_value=["Fresh paragraph one.", "Fresh paragraph two."],
    ) as mock_translate:
        res = await admin_client.post("/api/admin/translations/100/0/en/retranslate")

    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["paragraphs_count"] == 2
    mock_translate.assert_awaited_once()


async def test_retranslate_book_not_found(admin_client):
    res = await admin_client.post("/api/admin/translations/999/0/en/retranslate")
    assert res.status_code == 404


async def test_retranslate_chapter_out_of_range(admin_client):
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.post("/api/admin/translations/100/99/en/retranslate")
    assert res.status_code == 400


async def test_retranslate_non_admin_forbidden(admin_db, admin_user):
    user2 = await get_or_create_user(
        google_id="user2", email="user2@example.com", name="User 2", picture=""
    )
    await set_user_approved(user2["id"], True)

    async def _override():
        return await get_user_by_id(user2["id"])

    app.dependency_overrides[get_current_user] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.post("/api/admin/translations/100/0/en/retranslate")
    app.dependency_overrides.clear()

    assert res.status_code == 403


# ── Auth / pending user ──────────────────────────────────────────────────────

async def test_unapproved_user_blocked_on_api(admin_db, admin_user):
    user2 = await get_or_create_user(
        google_id="pending-user", email="pending@example.com", name="Pending", picture=""
    )
    token = create_jwt(user2["id"], user2["email"])
    headers = {"Authorization": f"Bearer {token}"}

    app.dependency_overrides.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.post("/api/ai/translate", headers=headers,
                           json={"text": "hello", "source_language": "en", "target_language": "de"})
        assert res.status_code == 403

        res = await c.get("/api/user/me", headers=headers)
        assert res.status_code == 200
        assert res.json()["approved"] is False


# ── Seed popular books SSE ──────────────────────────────────────────────────

def _parse_sse(body: str) -> list[dict]:
    import json as _json
    events = []
    for block in body.strip().split("\n\n"):
        event = None
        data = None
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                data = _json.loads(line.removeprefix("data:").strip())
        if event and data is not None:
            events.append({"event": event, **data})
    return events


async def test_seed_popular_skips_already_cached(admin_client, admin_db, monkeypatch, tmp_path):
    """A manifest entry whose book is already in the DB is counted as cached,
    not re-downloaded. Verifies the polling-based seed job."""
    import json as _json
    import asyncio
    from services.seed_popular import manager as seed_manager, SeedPopularManager

    # Fresh manager so tests don't share state
    monkeypatch.setattr("services.seed_popular._manager", SeedPopularManager())
    monkeypatch.setattr("routers.admin.bulk_manager", bulk_manager := __import__("services.bulk_translate").bulk_translate.manager)  # unchanged

    manifest = [{
        "id": 100, "title": "Test Book",
        "authors": ["Author"], "languages": ["en"],
        "download_count": 100, "cover": "",
    }]
    manifest_path = tmp_path / "popular_books.json"
    manifest_path.write_text(_json.dumps(manifest))
    import os as _os
    original_join = _os.path.join
    def _fake_join(*parts):
        joined = original_join(*parts)
        if joined.endswith("popular_books.json"):
            return str(manifest_path)
        return joined
    monkeypatch.setattr(_os.path, "join", _fake_join)

    await save_book(100, manifest[0], "Some text")

    with patch("services.seed_popular.get_book_meta") as m_meta, \
         patch("services.seed_popular.get_book_text") as m_text:
        res = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res.status_code == 200

        # Wait for the background task to complete
        mgr = __import__("services.seed_popular", fromlist=["manager"]).manager()
        while mgr.is_running():
            await asyncio.sleep(0.01)

        status = await admin_client.get("/api/admin/books/seed-popular/status")
        body = status.json()
        assert body["state"]["status"] == "completed"
        assert body["state"]["already_cached"] == 1
        assert body["state"]["total"] == 0
        m_meta.assert_not_called()
        m_text.assert_not_called()


async def test_seed_popular_downloads_missing_books(admin_client, admin_db, monkeypatch, tmp_path):
    """A manifest entry whose book isn't cached triggers download + save."""
    import json as _json
    import asyncio
    from services.seed_popular import SeedPopularManager
    monkeypatch.setattr("services.seed_popular._manager", SeedPopularManager())

    manifest = [{
        "id": 101, "title": "New Book",
        "authors": ["Author"], "languages": ["en"],
        "download_count": 50, "cover": "",
    }]
    manifest_path = tmp_path / "popular_books.json"
    manifest_path.write_text(_json.dumps(manifest))
    import os as _os
    original_join = _os.path.join
    def _fake_join(*parts):
        joined = original_join(*parts)
        if joined.endswith("popular_books.json"):
            return str(manifest_path)
        return joined
    monkeypatch.setattr(_os.path, "join", _fake_join)

    meta_mock = AsyncMock(return_value={**manifest[0], "subjects": []})
    text_mock = AsyncMock(return_value="Book text " * 50)
    with patch("services.seed_popular.get_book_meta", meta_mock), \
         patch("services.seed_popular.get_book_text", text_mock):
        res = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res.status_code == 200

        mgr = __import__("services.seed_popular", fromlist=["manager"]).manager()
        while mgr.is_running():
            await asyncio.sleep(0.01)

        status = await admin_client.get("/api/admin/books/seed-popular/status")
        body = status.json()
        assert body["state"]["status"] == "completed"
        assert body["state"]["downloaded"] == 1
        assert body["state"]["failed"] == 0

    from services.db import get_cached_book
    cached = await get_cached_book(101)
    assert cached is not None
    assert cached["title"] == "New Book"


async def test_seed_popular_refuses_concurrent_start(admin_client, admin_db, monkeypatch, tmp_path):
    """Second start while one is running returns 409."""
    import json as _json
    import asyncio
    from services.seed_popular import SeedPopularManager
    monkeypatch.setattr("services.seed_popular._manager", SeedPopularManager())

    manifest = [{"id": 102, "title": "X", "authors": [], "languages": ["en"],
                 "download_count": 1, "cover": ""}]
    manifest_path = tmp_path / "popular_books.json"
    manifest_path.write_text(_json.dumps(manifest))
    import os as _os
    original_join = _os.path.join
    monkeypatch.setattr(
        _os.path, "join",
        lambda *p: str(manifest_path) if original_join(*p).endswith("popular_books.json") else original_join(*p),
    )

    # Make the job slow by mocking get_book_meta to sleep
    async def slow_meta(book_id):
        await asyncio.sleep(1)
        return {"id": book_id, "title": "X", "authors": [], "languages": ["en"],
                "subjects": [], "download_count": 1, "cover": ""}
    async def fake_text(book_id):
        return "text"

    with patch("services.seed_popular.get_book_meta", slow_meta), \
         patch("services.seed_popular.get_book_text", fake_text):
        res1 = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res1.status_code == 200

        res2 = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res2.status_code == 409

        # Clean up — stop the job
        await admin_client.post("/api/admin/books/seed-popular/stop")


async def test_enqueue_book_nonexistent_returns_404(admin_client):
    """POST /admin/queue/enqueue-book for a non-existent book must return 404.

    Without this check enqueue_for_book returns 0 (no chapters to enqueue)
    and the endpoint silently returns 200 with enqueued=0."""
    res = await admin_client.post("/api/admin/queue/enqueue-book", json={
        "book_id": 99999,
        "target_languages": ["de"],
    })
    assert res.status_code == 404


# ── Retry-failed bulk endpoint ───────────────────────────────────────────────

async def _seed_failed(book_id: int, chapter_index: int, target_language: str):
    """Helper: insert a failed queue row for retry-failed tests."""
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            """INSERT INTO translation_queue
                   (book_id, chapter_index, target_language, priority,
                    status, attempts, last_error)
               VALUES (?, ?, ?, ?, 'failed', 3, 'boom')""",
            (book_id, chapter_index, target_language, 100),
        )
        await conn.commit()


async def test_admin_retry_failed_by_book_and_lang(admin_client, admin_db):
    """POST /admin/queue/retry-failed with {book_id, target_language}
    revives only failed rows matching both filters — other failed rows
    stay failed."""
    await _seed_failed(100, 0, "zh")
    await _seed_failed(100, 1, "zh")
    await _seed_failed(100, 0, "fr")   # different language
    await _seed_failed(200, 0, "zh")   # different book

    res = await admin_client.post(
        "/api/admin/queue/retry-failed",
        json={"book_id": 100, "target_language": "zh"},
    )
    assert res.status_code == 200
    assert res.json()["updated"] == 2

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(
            "SELECT book_id, chapter_index, target_language, status, attempts "
            "FROM translation_queue ORDER BY book_id, chapter_index, target_language",
        ) as cursor:
            rows = [dict(r) for r in await cursor.fetchall()]

    by_key = {
        (r["book_id"], r["chapter_index"], r["target_language"]): r for r in rows
    }
    # Matched rows reset.
    assert by_key[(100, 0, "zh")]["status"] == "pending"
    assert by_key[(100, 0, "zh")]["attempts"] == 0
    assert by_key[(100, 1, "zh")]["status"] == "pending"
    # Non-matching stay failed.
    assert by_key[(100, 0, "fr")]["status"] == "failed"
    assert by_key[(200, 0, "zh")]["status"] == "failed"


# The short BOOK_TEXT above collapses to a single chapter under the
# splitter's minimum-length heuristic. Move tests need ≥2 real chapters
# so the "new_chapter_index" range check has room to exercise both
# success and out-of-range paths.
MOVE_BOOK_TEXT = (
    "CHAPTER I\n\n" + ("Paragraph one. " * 40) + "\n\n"
    + ("Paragraph two. " * 40) + "\n\n"
    + "CHAPTER II\n\n" + ("Paragraph three. " * 40) + "\n\n"
    + ("Paragraph four. " * 40) + "\n\n"
    + "CHAPTER III\n\n" + ("Paragraph five. " * 40) + "\n\n"
    + ("Paragraph six. " * 40)
)


async def test_import_translations_inserts_rows(admin_client, admin_db):
    """POST /admin/translations/import writes pre-translated chapters into
    the cache without going through Gemini. Companion to the offline
    translate_book.py script used to seed prod from a dev-side run."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={
            "entries": [
                {
                    "book_id": 100,
                    "chapter_index": 0,
                    "target_language": "zh",
                    "paragraphs": ["第一段。", "第二段。"],
                    "provider": "gemini",
                    "model": "gemini-2.5-flash",
                },
            ],
        },
    )
    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True, "imported": 1}

    from services.db import get_cached_translation
    cached = await get_cached_translation(100, 0, "zh")
    assert cached == ["第一段。", "第二段。"]


async def test_import_translations_skips_empty_paragraphs(admin_client, admin_db):
    """Empty paragraph arrays are skipped — seeding shouldn't clobber an
    existing translation with an empty placeholder if the export has a
    chapter where translation failed."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "zh", ["existing"])
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={
            "entries": [
                {
                    "book_id": 100,
                    "chapter_index": 0,
                    "target_language": "zh",
                    "paragraphs": [],  # empty — skip
                },
            ],
        },
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 0
    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "zh") == ["existing"]


async def test_import_translations_overwrites_existing(admin_client, admin_db):
    """Non-empty imports DO overwrite — the whole point of seeding is
    often to replace bad translations with fresh ones."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "zh", ["old translation"])
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={
            "entries": [
                {
                    "book_id": 100,
                    "chapter_index": 0,
                    "target_language": "zh",
                    "paragraphs": ["new translation"],
                },
            ],
        },
    )
    assert res.status_code == 200
    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "zh") == ["new translation"]


async def test_import_translations_requires_admin(admin_db, admin_user):
    user2 = await get_or_create_user(
        google_id="user2", email="u2@test.com", name="U2", picture="",
    )
    await set_user_approved(user2["id"], True)

    async def _override():
        return await get_user_by_id(user2["id"])

    app.dependency_overrides[get_current_user] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.post(
            "/api/admin/translations/import",
            json={"entries": []},
        )
    app.dependency_overrides.clear()
    assert res.status_code == 403


async def test_move_translation_shifts_chapter_index(admin_client, admin_db):
    """POST /admin/translations/{id}/{idx}/{lang}/move reassigns an existing
    cached translation to a different chapter_index without retranslating.
    Used to rescue stale translations after a splitter change."""
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    await save_translation(100, 1, "en", ["Old chapter 2 text."])
    res = await admin_client.post(
        "/api/admin/translations/100/1/en/move",
        json={"new_chapter_index": 0},
    )
    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True, "from": 1, "to": 0}

    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "en") == ["Old chapter 2 text."]
    assert await get_cached_translation(100, 1, "en") is None


async def test_move_translation_rejects_when_target_occupied(admin_client, admin_db):
    """Target collision returns 409 so the admin can't silently overwrite
    a translation they meant to keep."""
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    await save_translation(100, 0, "en", ["First."])
    await save_translation(100, 1, "en", ["Second."])
    res = await admin_client.post(
        "/api/admin/translations/100/1/en/move",
        json={"new_chapter_index": 0},
    )
    assert res.status_code == 409

    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "en") == ["First."]
    assert await get_cached_translation(100, 1, "en") == ["Second."]


async def test_move_translation_rejects_out_of_range(admin_client, admin_db):
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    await save_translation(100, 0, "en", ["First."])
    res = await admin_client.post(
        "/api/admin/translations/100/0/en/move",
        json={"new_chapter_index": 99},
    )
    assert res.status_code == 400


async def test_move_translation_404_when_source_missing(admin_client, admin_db):
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    res = await admin_client.post(
        "/api/admin/translations/100/0/en/move",
        json={"new_chapter_index": 1},
    )
    assert res.status_code == 404


async def test_move_translation_clears_queue_at_destination(admin_client, admin_db):
    """If a queue row exists at the destination (pending/failed/whatever),
    it would later cause the worker to translate over the moved row.
    The move must clean it up."""
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    await save_translation(100, 1, "en", ["From slot 1."])
    await _seed_failed(100, 0, "en")

    res = await admin_client.post(
        "/api/admin/translations/100/1/en/move",
        json={"new_chapter_index": 0},
    )
    assert res.status_code == 200

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM translation_queue "
            "WHERE book_id=100 AND chapter_index=0 AND target_language='en'",
        ) as cursor:
            (count,) = await cursor.fetchone()
    assert count == 0


async def test_admin_retry_failed_without_filters_retries_all(admin_client, admin_db):
    await _seed_failed(100, 0, "zh")
    await _seed_failed(200, 0, "fr")

    res = await admin_client.post("/api/admin/queue/retry-failed", json={})
    assert res.status_code == 200
    assert res.json()["updated"] == 2

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM translation_queue WHERE status='failed'",
        ) as cursor:
            (count,) = await cursor.fetchone()
    assert count == 0


async def test_delete_book_removes_orphaned_vocabulary(admin_client, admin_db, admin_user):
    """Vocab entries whose only occurrences were in the deleted book must be
    removed; a word shared with another book must survive."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_book(
        200,
        {**BOOK_META, "id": 200, "title": "Second Book"},
        BOOK_TEXT,
    )

    with patch("services.db._update_lemma", new_callable=AsyncMock):
        # "orphan" only appears in book 100
        await save_word(admin_user["id"], "orphan", 100, 0, "An orphan word.")
        # "shared" appears in both books
        await save_word(admin_user["id"], "shared", 100, 0, "A shared word in book 100.")
        await save_word(admin_user["id"], "shared", 200, 0, "A shared word in book 200.")

    vocab_before = await get_vocabulary(admin_user["id"])
    words_before = {v["word"] for v in vocab_before}
    assert "orphan" in words_before
    assert "shared" in words_before

    res = await admin_client.delete("/api/admin/books/100")
    assert res.status_code == 200

    vocab_after = await get_vocabulary(admin_user["id"])
    words_after = {v["word"] for v in vocab_after}

    # Orphaned word (only in deleted book) must be gone
    assert "orphan" not in words_after, "orphaned vocab entry survived delete_book"
    # Shared word (also in book 200) must survive
    assert "shared" in words_after
