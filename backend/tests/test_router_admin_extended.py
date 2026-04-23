"""
Extended tests for routers/admin.py covering uncovered areas:
- Queue settings GET/PUT (lines 817-882)
- Queue worker control start/stop (lines 805-814)
- Queue items list, enqueue-book, delete item, clear, delete by book (lines 885-947)
- Queue retry single item (lines 950-967)
- Queue enqueue-all (lines 1019-1035)
- Queue cost estimate (lines 1009-1016)
- Import book (lines 190-204)
- Retranslate-all (lines 461-506)
- Bulk translate plan (lines 637-671)
- Bulk translate status/history (lines 716-762)
- Delete chapter audio (line 290)
- Translation move same-index (line 546)
"""

import json
import aiosqlite
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import services.db as db_module
import routers.admin as admin_module
from services.db import (
    init_db, get_or_create_user, get_user_by_id, save_book,
    save_translation, set_user_approved, get_setting,
)
from services.auth import get_current_user, encrypt_api_key
from main import app
from httpx import AsyncClient, ASGITransport


# ── Shared constants and helpers ─────────────────────────────────────────────

ADMIN_USER = {
    "google_id": "ext-admin-google-id",
    "email": "ext-admin@example.com",
    "name": "ExtAdmin",
    "picture": "",
}

BOOK_META = {
    "id": 200,
    "title": "Test Book Extended",
    "authors": ["Author"],
    "languages": ["de"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}

BOOK_TEXT = (
    "CHAPTER I\n\n" + ("Paragraph one. " * 40) + "\n\n"
    + ("Paragraph two. " * 40) + "\n\n"
    + "CHAPTER II\n\n" + ("Paragraph three. " * 40) + "\n\n"
    + ("Paragraph four. " * 40) + "\n\n"
    + "CHAPTER III\n\n" + ("Paragraph five. " * 40) + "\n\n"
    + ("Paragraph six. " * 40)
)


@pytest.fixture
async def admin_db(monkeypatch, tmp_path):
    path = str(tmp_path / "admin-ext-test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    monkeypatch.setattr(admin_module, "DB_PATH", path)

    from unittest.mock import AsyncMock as _AsyncMock
    monkeypatch.setattr("services.db.get_book_epub_bytes", _AsyncMock(return_value=None))
    monkeypatch.setattr("services.book_chapters._background_fetch_epub", _AsyncMock())
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


async def _insert_queue_row(db_path, book_id, chapter_index, lang, status="pending"):
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            """INSERT INTO translation_queue
                   (book_id, chapter_index, target_language, priority, status)
               VALUES (?, ?, ?, 100, ?)""",
            (book_id, chapter_index, lang, status),
        )
        await conn.commit()
        async with conn.execute(
            "SELECT id FROM translation_queue WHERE book_id=? AND chapter_index=? AND target_language=?",
            (book_id, chapter_index, lang),
        ) as cursor:
            row = await cursor.fetchone()
        return row[0]


# ── Audio endpoints ──────────────────────────────────────────────────────────

async def test_delete_chapter_audio(admin_client, admin_db):
    """DELETE /admin/audio/{book_id}/{chapter_index} always returns ok."""
    res = await admin_client.delete("/api/admin/audio/100/0")
    assert res.status_code == 200
    assert res.json()["deleted"] == 0


# ── Import book ──────────────────────────────────────────────────────────────

async def test_import_book_success(admin_client, admin_db):
    with patch("routers.admin.get_book_meta", new_callable=AsyncMock, return_value={
        "title": "New Book",
        "authors": ["Auth"],
        "languages": ["en"],
        "subjects": [],
        "download_count": 10,
        "cover": "",
    }), patch("routers.admin.get_book_text", new_callable=AsyncMock, return_value="Chapter text " * 100):
        res = await admin_client.post("/api/admin/books/import", json={"book_id": 500})

    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["status"] == "imported"
    assert data["title"] == "New Book"
    assert data["text_length"] > 0


async def test_import_book_already_cached(admin_client, admin_db):
    await save_book(200, BOOK_META, BOOK_TEXT)
    res = await admin_client.post("/api/admin/books/import", json={"book_id": 200})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "already_cached"


async def test_import_book_failure_returns_400(admin_client, admin_db):
    with patch("routers.admin.get_book_meta", side_effect=Exception("Not found")):
        res = await admin_client.post("/api/admin/books/import", json={"book_id": 99999})
    assert res.status_code == 400
    assert "Failed to import" in res.json()["detail"]


# ── Retranslate-all ──────────────────────────────────────────────────────────

async def test_retranslate_all_book_not_found(admin_client, admin_db):
    res = await admin_client.post(
        "/api/admin/translations/9999/retranslate-all",
        json={"target_language": "zh"},
    )
    assert res.status_code == 404


async def test_retranslate_all_success(admin_client, admin_db):
    await save_book(200, BOOK_META, BOOK_TEXT)
    await save_translation(200, 0, "zh", ["Old translation."])

    with patch(
        "routers.admin.do_translate",
        new_callable=AsyncMock,
        return_value=["Fresh para."],
    ):
        res = await admin_client.post(
            "/api/admin/translations/200/retranslate-all",
            json={"target_language": "zh"},
        )

    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["chapters"] >= 1
    assert all(r["status"] == "ok" for r in data["results"])


async def test_retranslate_all_falls_back_to_google_on_gemini_failure(admin_client, admin_user, admin_db):
    """When Gemini fails, retranslate-all falls back to Google provider."""
    await save_book(200, BOOK_META, BOOK_TEXT)

    call_count = {"n": 0}

    async def flaky_translate(text, src, tgt, provider="google", gemini_key=None):
        call_count["n"] += 1
        if provider == "gemini":
            raise Exception("quota exceeded")
        return ["Fallback translation."]

    # Give admin a fake gemini key so provider starts as "gemini"
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET gemini_key=? WHERE id=?",
            (encrypt_api_key("fake-gemini-key"), admin_user["id"]),
        )
        await conn.commit()

    with patch("routers.admin.do_translate", side_effect=flaky_translate):
        res = await admin_client.post(
            "/api/admin/translations/200/retranslate-all",
            json={"target_language": "fr"},
        )

    assert res.status_code == 200
    # Should have fallen back, all chapters should be "ok"
    data = res.json()
    assert all(r["status"] == "ok" for r in data["results"])


async def test_retranslate_all_google_failure_marks_failed(admin_client, admin_db):
    """When google provider also fails, chapter is marked failed."""
    await save_book(200, BOOK_META, BOOK_TEXT)

    async def always_fail(text, src, tgt, provider="google", gemini_key=None):
        raise Exception("network error")

    with patch("routers.admin.do_translate", side_effect=always_fail):
        res = await admin_client.post(
            "/api/admin/translations/200/retranslate-all",
            json={"target_language": "fr"},
        )

    assert res.status_code == 200
    data = res.json()
    assert all(r["status"] == "failed" for r in data["results"])


# ── Move translation same-index rejection ────────────────────────────────────

async def test_move_translation_rejects_same_index(admin_client, admin_db):
    await save_book(200, BOOK_META, BOOK_TEXT)
    await save_translation(200, 0, "en", ["Some text."])
    res = await admin_client.post(
        "/api/admin/translations/200/0/en/move",
        json={"new_chapter_index": 0},
    )
    assert res.status_code == 400
    assert "same as the source" in res.json()["detail"]


# ── Queue settings GET ────────────────────────────────────────────────────────

async def test_queue_get_settings_default(admin_client, admin_db):
    """GET /admin/queue/settings returns defaults when nothing is configured."""
    res = await admin_client.get("/api/admin/queue/settings")
    assert res.status_code == 200
    data = res.json()
    assert "enabled" in data
    assert "has_api_key" in data
    assert "auto_translate_languages" in data
    assert isinstance(data["auto_translate_languages"], list)
    assert "model_chain" in data


async def test_queue_get_settings_reflects_stored_values(admin_client, admin_db):
    """After storing settings, GET returns them correctly."""
    from services.db import set_setting
    from services.translation_queue import SETTING_RPM, SETTING_RPD, SETTING_MODEL

    await set_setting(SETTING_RPM, "20")
    await set_setting(SETTING_RPD, "500")
    await set_setting(SETTING_MODEL, "gemini-2.5-flash")

    res = await admin_client.get("/api/admin/queue/settings")
    assert res.status_code == 200
    data = res.json()
    assert data["rpm"] == 20
    assert data["rpd"] == 500
    assert data["model"] == "gemini-2.5-flash"


# ── Queue settings PUT ────────────────────────────────────────────────────────

async def test_queue_put_settings_enable(admin_client, admin_db):
    res = await admin_client.put("/api/admin/queue/settings", json={"enabled": True})
    assert res.status_code == 200
    assert res.json()["ok"] is True

    from services.translation_queue import SETTING_ENABLED
    stored = await get_setting(SETTING_ENABLED)
    assert stored == "1"


async def test_queue_put_settings_disable(admin_client, admin_db):
    res = await admin_client.put("/api/admin/queue/settings", json={"enabled": False})
    assert res.status_code == 200

    from services.translation_queue import SETTING_ENABLED
    stored = await get_setting(SETTING_ENABLED)
    assert stored == "0"


async def test_queue_put_settings_set_api_key(admin_client, admin_db):
    res = await admin_client.put("/api/admin/queue/settings", json={"api_key": "my-gemini-key"})
    assert res.status_code == 200

    from services.translation_queue import SETTING_API_KEY
    stored = await get_setting(SETTING_API_KEY)
    # Key should be stored encrypted (not plaintext)
    assert stored is not None
    assert stored != "my-gemini-key"


async def test_queue_put_settings_clear_api_key(admin_client, admin_db):
    """Sending api_key='' clears the stored key."""
    from services.translation_queue import SETTING_API_KEY
    from services.db import set_setting
    await set_setting(SETTING_API_KEY, "some-encrypted-key")

    res = await admin_client.put("/api/admin/queue/settings", json={"api_key": ""})
    assert res.status_code == 200

    stored = await get_setting(SETTING_API_KEY)
    assert stored == ""


async def test_queue_put_settings_auto_languages(admin_client, admin_db):
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"auto_translate_languages": ["zh", "de", "fr"]},
    )
    assert res.status_code == 200

    from services.translation_queue import SETTING_AUTO_LANGS
    stored = await get_setting(SETTING_AUTO_LANGS)
    langs = json.loads(stored)
    assert langs == ["zh", "de", "fr"]


async def test_queue_put_settings_rpm_rpd(admin_client, admin_db):
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"rpm": 15, "rpd": 800},
    )
    assert res.status_code == 200

    from services.translation_queue import SETTING_RPM, SETTING_RPD
    assert await get_setting(SETTING_RPM) == "15"
    assert await get_setting(SETTING_RPD) == "800"


async def test_queue_put_settings_model(admin_client, admin_db):
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"model": "gemini-2.5-pro"},
    )
    assert res.status_code == 200

    from services.translation_queue import SETTING_MODEL
    assert await get_setting(SETTING_MODEL) == "gemini-2.5-pro"


async def test_queue_put_settings_model_chain_updates_model_too(admin_client, admin_db):
    """Setting model_chain also updates the legacy single-model setting to chain[0]."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"model_chain": ["gemini-2.5-pro", "gemini-2.5-flash"]},
    )
    assert res.status_code == 200

    from services.translation_queue import SETTING_MODEL, SETTING_MODEL_CHAIN
    chain_raw = await get_setting(SETTING_MODEL_CHAIN)
    chain = json.loads(chain_raw)
    assert chain == ["gemini-2.5-pro", "gemini-2.5-flash"]

    # Legacy model setting should be the head of the chain
    model = await get_setting(SETTING_MODEL)
    assert model == "gemini-2.5-pro"


async def test_queue_put_settings_empty_model_chain_returns_400(admin_client, admin_db):
    """Regression #474: empty model_chain must be rejected (would leave SETTING_MODEL stale)."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"model_chain": []},
    )
    assert res.status_code == 400, f"Expected 400 for empty model_chain, got {res.status_code}"


async def test_queue_put_settings_max_output_tokens(admin_client, admin_db):
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"max_output_tokens": 4096},
    )
    assert res.status_code == 200

    from services.translation_queue import SETTING_MAX_OUTPUT_TOKENS
    assert await get_setting(SETTING_MAX_OUTPUT_TOKENS) == "4096"


# ── Queue worker start/stop ──────────────────────────────────────────────────

async def test_queue_start(admin_client, admin_db):
    with patch("routers.admin.queue_worker") as mock_worker_factory:
        mock_worker = MagicMock()
        mock_worker.start = AsyncMock()
        mock_worker_factory.return_value = mock_worker

        res = await admin_client.post("/api/admin/queue/start")

    assert res.status_code == 200
    assert res.json()["ok"] is True


async def test_queue_stop(admin_client, admin_db):
    with patch("routers.admin.queue_worker") as mock_worker_factory:
        mock_worker = MagicMock()
        mock_worker.stop = AsyncMock()
        mock_worker_factory.return_value = mock_worker

        res = await admin_client.post("/api/admin/queue/stop")

    assert res.status_code == 200
    assert res.json()["ok"] is True


# ── Queue status ──────────────────────────────────────────────────────────────

async def test_queue_status_endpoint(admin_client, admin_db):
    res = await admin_client.get("/api/admin/queue/status")
    assert res.status_code == 200
    data = res.json()
    assert "running" in data
    assert "state" in data
    assert "counts" in data


# ── Queue items ──────────────────────────────────────────────────────────────

async def test_queue_items_empty(admin_client, admin_db):
    res = await admin_client.get("/api/admin/queue/items")
    assert res.status_code == 200
    assert res.json() == []


async def test_queue_items_with_filter_status(admin_client, admin_db):
    await _insert_queue_row(db_module.DB_PATH, 200, 0, "zh", "pending")
    await _insert_queue_row(db_module.DB_PATH, 200, 1, "zh", "failed")

    res = await admin_client.get("/api/admin/queue/items?status=pending")
    assert res.status_code == 200
    items = res.json()
    assert all(item["status"] == "pending" for item in items)


async def test_queue_items_with_book_id_filter(admin_client, admin_db):
    await _insert_queue_row(db_module.DB_PATH, 200, 0, "zh")
    await _insert_queue_row(db_module.DB_PATH, 300, 0, "zh")

    res = await admin_client.get("/api/admin/queue/items?book_id=200")
    assert res.status_code == 200
    items = res.json()
    assert all(item["book_id"] == 200 for item in items)


# ── Queue enqueue-book ────────────────────────────────────────────────────────

async def test_queue_enqueue_book(admin_client, admin_db):
    await save_book(200, BOOK_META, BOOK_TEXT)

    from services.db import set_setting
    from services.translation_queue import SETTING_AUTO_LANGS
    await set_setting(SETTING_AUTO_LANGS, json.dumps(["zh"]))

    res = await admin_client.post(
        "/api/admin/queue/enqueue-book",
        json={"book_id": 200},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["enqueued"] >= 0


async def test_queue_enqueue_book_with_explicit_languages(admin_client, admin_db):
    await save_book(200, BOOK_META, BOOK_TEXT)

    res = await admin_client.post(
        "/api/admin/queue/enqueue-book",
        json={"book_id": 200, "target_languages": ["zh", "fr"]},
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True


# ── Queue delete item ────────────────────────────────────────────────────────

async def test_queue_delete_item(admin_client, admin_db):
    item_id = await _insert_queue_row(db_module.DB_PATH, 200, 0, "zh")

    res = await admin_client.delete(f"/api/admin/queue/items/{item_id}")
    assert res.status_code == 200
    assert res.json()["deleted"] == 1


async def test_queue_delete_nonexistent_item(admin_client, admin_db):
    res = await admin_client.delete("/api/admin/queue/items/99999")
    assert res.status_code == 404


# ── Queue clear ──────────────────────────────────────────────────────────────

async def test_queue_clear_all(admin_client, admin_db):
    await _insert_queue_row(db_module.DB_PATH, 200, 0, "zh")
    await _insert_queue_row(db_module.DB_PATH, 200, 1, "zh")

    res = await admin_client.delete("/api/admin/queue")
    assert res.status_code == 200
    assert res.json()["deleted"] == 2


async def test_queue_clear_by_status(admin_client, admin_db):
    await _insert_queue_row(db_module.DB_PATH, 200, 0, "zh", "failed")
    await _insert_queue_row(db_module.DB_PATH, 200, 1, "zh", "pending")

    res = await admin_client.delete("/api/admin/queue?status=failed")
    assert res.status_code == 200
    assert res.json()["deleted"] == 1

    # Pending row should still be there
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute("SELECT COUNT(*) FROM translation_queue WHERE status='pending'") as cur:
            (count,) = await cur.fetchone()
    assert count == 1


# ── Queue delete by book ──────────────────────────────────────────────────────

async def test_queue_delete_book_all_langs(admin_client, admin_db):
    await _insert_queue_row(db_module.DB_PATH, 200, 0, "zh")
    await _insert_queue_row(db_module.DB_PATH, 200, 0, "fr")

    res = await admin_client.delete("/api/admin/queue/book/200")
    assert res.status_code == 200
    assert res.json()["deleted"] == 2


async def test_queue_delete_book_specific_lang(admin_client, admin_db):
    await _insert_queue_row(db_module.DB_PATH, 200, 0, "zh")
    await _insert_queue_row(db_module.DB_PATH, 200, 0, "fr")

    res = await admin_client.delete("/api/admin/queue/book/200?target_language=zh")
    assert res.status_code == 200
    assert res.json()["deleted"] == 1

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM translation_queue WHERE book_id=200 AND target_language='fr'"
        ) as cur:
            (count,) = await cur.fetchone()
    assert count == 1


# ── Queue retry single item ──────────────────────────────────────────────────

async def test_queue_retry_item(admin_client, admin_db):
    item_id = await _insert_queue_row(db_module.DB_PATH, 200, 0, "zh", "failed")

    # Set attempts to 3 for the item
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            "UPDATE translation_queue SET attempts=3, last_error='boom' WHERE id=?",
            (item_id,),
        )
        await conn.commit()

    res = await admin_client.post(f"/api/admin/queue/items/{item_id}/retry")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["updated"] == 1

    # Verify item is now pending with attempts=0
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT status, attempts, last_error, priority FROM translation_queue WHERE id=?",
            (item_id,),
        ) as cur:
            row = await cur.fetchone()

    assert row[0] == "pending"
    assert row[1] == 0
    assert row[2] is None
    assert row[3] == 100


async def test_queue_retry_nonexistent_item(admin_client, admin_db):
    res = await admin_client.post("/api/admin/queue/items/99999/retry")
    assert res.status_code == 404


# ── Queue cost estimate ──────────────────────────────────────────────────────

async def test_queue_cost_estimate_empty_queue(admin_client, admin_db):
    res = await admin_client.get("/api/admin/queue/cost-estimate")
    assert res.status_code == 200
    # Returns a dict (may have cost entries per model or be empty)
    assert isinstance(res.json(), dict)


# ── Queue enqueue-all ────────────────────────────────────────────────────────

async def test_queue_enqueue_all_no_languages_returns_400(admin_client, admin_db):
    # No auto-languages configured
    res = await admin_client.post("/api/admin/queue/enqueue-all")
    assert res.status_code == 400
    assert "auto_translate_languages" in res.json()["detail"]


async def test_queue_enqueue_all_with_languages(admin_client, admin_db):
    await save_book(200, BOOK_META, BOOK_TEXT)

    from services.db import set_setting
    from services.translation_queue import SETTING_AUTO_LANGS
    await set_setting(SETTING_AUTO_LANGS, json.dumps(["zh"]))

    res = await admin_client.post("/api/admin/queue/enqueue-all")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["books_scanned"] >= 1
    assert "enqueued" in data


# ── Queue plan endpoint ──────────────────────────────────────────────────────

async def test_queue_plan_empty(admin_client, admin_db):
    res = await admin_client.post(
        "/api/admin/queue/plan",
        json={"target_language": "zh"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_books"] == 0
    assert data["total_chapters"] == 0
    assert "estimated_minutes_at_rpm" in data
    assert "estimated_days_at_rpd" in data


async def test_queue_plan_with_books(admin_client, admin_db):
    await save_book(200, BOOK_META, BOOK_TEXT)

    res = await admin_client.post(
        "/api/admin/queue/plan",
        json={"target_language": "zh"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_books"] >= 1
    assert len(data["books"]) >= 1
    book_entry = data["books"][0]
    assert "id" in book_entry
    assert "title" in book_entry
    assert "chapters_to_translate" in book_entry


async def test_queue_plan_normalizes_language(admin_client, admin_db):
    await save_book(200, BOOK_META, BOOK_TEXT)
    res = await admin_client.post(
        "/api/admin/queue/plan",
        json={"target_language": "ZH-CN"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_books"] >= 1


# ── Queue dry-run endpoint ───────────────────────────────────────────────────

async def test_queue_dry_run_no_api_key_returns_400(admin_client, admin_db):
    res = await admin_client.post(
        "/api/admin/queue/dry-run",
        json={"target_language": "zh"},
    )
    assert res.status_code == 400
    assert "API key" in res.json()["detail"]


async def test_queue_dry_run_no_books_returns_empty(admin_client, admin_db):
    from services.db import set_setting
    from services.auth import encrypt_api_key
    from services.translation_queue import SETTING_API_KEY
    await set_setting(SETTING_API_KEY, encrypt_api_key("fake-key"))

    res = await admin_client.post(
        "/api/admin/queue/dry-run",
        json={"target_language": "zh"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_chapters"] == 0
    assert data["total_books"] == 0
    assert data["preview"] == {}


async def test_queue_dry_run_calls_translate_and_returns_preview(admin_client, admin_db):
    from services.db import set_setting
    from services.auth import encrypt_api_key
    from services.translation_queue import SETTING_API_KEY
    from unittest.mock import AsyncMock, patch

    await save_book(200, BOOK_META, BOOK_TEXT)
    await set_setting(SETTING_API_KEY, encrypt_api_key("fake-key"))

    fake_translations = {0: ["Translation of chapter 0."]}

    with patch(
        "routers.admin.translate_chapters_batch",
        new_callable=AsyncMock,
        return_value=fake_translations,
    ):
        res = await admin_client.post(
            "/api/admin/queue/dry-run",
            json={"target_language": "zh"},
        )

    assert res.status_code == 200
    data = res.json()
    assert data["total_books"] >= 1
    assert data["total_chapters"] >= 1
    assert "preview" in data
    assert "preview_book_title" in data


# ── Non-admin access is blocked ──────────────────────────────────────────────

async def test_queue_settings_non_admin_blocked(admin_db, admin_user):
    user2 = await get_or_create_user(
        google_id="non-admin2", email="nonadmin2@example.com", name="NA2", picture=""
    )
    await set_user_approved(user2["id"], True)

    async def _override():
        return await get_user_by_id(user2["id"])

    app.dependency_overrides[get_current_user] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.get("/api/admin/queue/settings")
    app.dependency_overrides.clear()

    assert res.status_code == 403


async def test_queue_put_settings_non_admin_blocked(admin_db, admin_user):
    user2 = await get_or_create_user(
        google_id="non-admin3", email="nonadmin3@example.com", name="NA3", picture=""
    )
    await set_user_approved(user2["id"], True)

    async def _override():
        return await get_user_by_id(user2["id"])

    app.dependency_overrides[get_current_user] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.put("/api/admin/queue/settings", json={"enabled": True})
    app.dependency_overrides.clear()

    assert res.status_code == 403


# ── Corrupted Gemini key in admin endpoints ───────────────────────────────────

_CORRUPT_KEY = "not-a-valid-fernet-token"


async def test_retranslate_with_corrupted_key_falls_back_to_google(admin_client, admin_user, admin_db):
    """Corrupted admin Gemini key must not cause 500 — should fall back to Google."""
    await save_book(200, BOOK_META, BOOK_TEXT)
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET gemini_key=? WHERE id=?", (_CORRUPT_KEY, admin_user["id"])
        )
        await conn.commit()

    captured = []

    async def capture_translate(text, src, tgt, provider="google", gemini_key=None):
        captured.append(provider)
        return ["Translated."]

    with patch("routers.admin.do_translate", side_effect=capture_translate):
        res = await admin_client.post("/api/admin/translations/200/0/fr/retranslate")

    assert res.status_code == 200
    assert captured and captured[0] == "google"


async def test_retranslate_all_with_corrupted_key_falls_back_to_google(admin_client, admin_user, admin_db):
    """Corrupted admin Gemini key in retranslate-all must fall back to Google."""
    await save_book(200, BOOK_META, BOOK_TEXT)
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET gemini_key=? WHERE id=?", (_CORRUPT_KEY, admin_user["id"])
        )
        await conn.commit()

    captured = []

    async def capture_translate(text, src, tgt, provider="google", gemini_key=None):
        captured.append(provider)
        return ["Translated."]

    with patch("routers.admin.do_translate", side_effect=capture_translate):
        res = await admin_client.post(
            "/api/admin/translations/200/retranslate-all", json={"target_language": "fr"}
        )

    assert res.status_code == 200
    assert captured and all(p == "google" for p in captured)


# ── Retranslate preserves old translation on failure (regression #306) ────────

async def test_retranslate_preserves_old_translation_on_failure(admin_client, admin_db):
    """When translation fails, the old cached translation must not be deleted.

    Previously: DELETE old translation → try translate → on failure, old is gone.
    Fixed: translate first; save_translation (INSERT OR REPLACE) overwrites on success;
    on failure, old row is never touched.
    """
    await save_book(200, BOOK_META, BOOK_TEXT)
    await save_translation(200, 0, "fr", ["original paragraph"])

    from services.db import get_cached_translation

    async def always_fail(text, src, tgt, provider="google", gemini_key=None):
        raise Exception("simulated network error")

    with patch("routers.admin.do_translate", side_effect=always_fail):
        # The unhandled exception propagates through the ASGI transport in tests.
        with pytest.raises(Exception, match="simulated network error"):
            await admin_client.post("/api/admin/translations/200/0/fr/retranslate")

    # Old translation must survive regardless of the translate failure
    cached = await get_cached_translation(200, 0, "fr")
    assert cached == ["original paragraph"], (
        "Old translation was deleted before confirming the new one succeeded"
    )


async def test_retranslate_all_preserves_old_translations_on_failure(admin_client, admin_db):
    """When translation fails for every chapter, old translations must not be deleted.

    Previously: DELETE ALL → loop → all fail → old translations gone.
    Fixed: no upfront DELETE; save_translation only called on success.
    """
    await save_book(200, BOOK_META, BOOK_TEXT)
    await save_translation(200, 0, "fr", ["original ch0"])
    await save_translation(200, 1, "fr", ["original ch1"])

    from services.db import get_cached_translation

    async def always_fail(text, src, tgt, provider="google", gemini_key=None):
        raise Exception("simulated network error")

    with patch("routers.admin.do_translate", side_effect=always_fail):
        res = await admin_client.post(
            "/api/admin/translations/200/retranslate-all",
            json={"target_language": "fr"},
        )

    assert res.status_code == 200
    # All chapters failed to translate — original rows must remain intact
    assert await get_cached_translation(200, 0, "fr") == ["original ch0"], (
        "Chapter 0 old translation was deleted before confirming new one succeeded"
    )
    assert await get_cached_translation(200, 1, "fr") == ["original ch1"], (
        "Chapter 1 old translation was deleted before confirming new one succeeded"
    )


# ── Issue #572: admin request body bounds ────────────────────────────────────

async def test_queue_plan_oversized_language_returns_422(admin_client, admin_db):
    """Regression #572: POST /admin/queue/plan with target_language > 20 chars must return 422."""
    res = await admin_client.post(
        "/api/admin/queue/plan",
        json={"target_language": "x" * 21},
    )
    assert res.status_code == 422, (
        f"Expected 422 for oversized target_language in /queue/plan, got {res.status_code}: {res.text}"
    )


async def test_queue_retry_failed_oversized_language_returns_422(admin_client, admin_db):
    """Regression #572: POST /admin/queue/retry-failed with target_language > 20 chars must return 422."""
    res = await admin_client.post(
        "/api/admin/queue/retry-failed",
        json={"target_language": "x" * 21},
    )
    assert res.status_code == 422, (
        f"Expected 422 for oversized target_language in /queue/retry-failed, got {res.status_code}: {res.text}"
    )
