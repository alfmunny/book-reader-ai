"""
Tests for routers/uploads.py — user book upload endpoints.
"""
import io
import json
import pytest
import aiosqlite
from unittest.mock import AsyncMock, patch
from services.db import (
    get_or_create_user, get_user_by_id,
    save_translation, create_annotation, save_insight,
    save_chapter_summary, upsert_reading_progress, save_word,
)
import services.db as db_module
from services.auth import get_current_user, get_optional_user
from main import app
from httpx import AsyncClient, ASGITransport


# ── Helpers ────────────────────────────────────────────────────────────────────

SAMPLE_TXT = b"""My Test Novel

Chapter 1

This is the first chapter of the book. It has some content that is interesting.

Chapter 2

This is the second chapter. More content follows here and continues on.
"""

SECOND_USER = {
    "google_id": "other-google-id",
    "email": "other@example.com",
    "name": "Other User",
    "picture": "",
}


def _txt_upload(content: bytes = SAMPLE_TXT, filename: str = "test.txt"):
    return {"file": (filename, io.BytesIO(content), "text/plain")}


# ── Tests ─────────────────────────────────────────────────────────────────────

async def test_upload_txt_file_creates_draft_book(client, test_user):
    resp = await client.post("/api/books/upload", files=_txt_upload())
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "book_id" in data
    assert data["format"] == "txt"
    assert isinstance(data["detected_chapters"], list)
    assert len(data["detected_chapters"]) >= 1
    assert data["title"]  # some title detected


async def test_upload_quota_returns_count(client, test_user):
    resp = await client.get("/api/books/upload/quota")
    assert resp.status_code == 200
    data = resp.json()
    assert data["used"] == 0
    assert data["max"] == 10

    # Upload a book and verify count increases
    await client.post("/api/books/upload", files=_txt_upload())
    resp2 = await client.get("/api/books/upload/quota")
    assert resp2.json()["used"] == 1


async def test_upload_quota_exceeded_returns_429(client, test_user):
    # Patch the quota check function to simulate limit reached
    with patch("routers.uploads._user_upload_count", new_callable=AsyncMock, return_value=10):
        resp = await client.post("/api/books/upload", files=_txt_upload())
    assert resp.status_code == 429
    assert "limit" in resp.json()["detail"].lower()


async def test_upload_wrong_format_returns_400(client, test_user):
    resp = await client.post(
        "/api/books/upload",
        files={"file": ("story.pdf", io.BytesIO(b"PDF content"), "application/pdf")},
    )
    assert resp.status_code == 400
    assert "supported" in resp.json()["detail"].lower()


async def test_confirm_chapters_makes_book_readable(client, test_user):
    # Upload first
    upload_resp = await client.post("/api/books/upload", files=_txt_upload())
    assert upload_resp.status_code == 200
    book_id = upload_resp.json()["book_id"]
    detected = upload_resp.json()["detected_chapters"]

    # Confirm chapters
    chapters_to_confirm = [
        {"title": ch["title"], "original_index": ch["index"]}
        for ch in detected
    ]
    confirm_resp = await client.post(
        f"/api/books/{book_id}/chapters/confirm",
        json={"chapters": chapters_to_confirm},
    )
    assert confirm_resp.status_code == 200
    data = confirm_resp.json()
    assert data["ok"] is True
    assert data["chapter_count"] == len(detected)

    # Should now be accessible via /chapters
    chapters_resp = await client.get(f"/api/books/{book_id}/chapters")
    assert chapters_resp.status_code == 200
    ch_data = chapters_resp.json()
    assert len(ch_data["chapters"]) == len(detected)


async def test_delete_uploaded_book(client, test_user):
    upload_resp = await client.post("/api/books/upload", files=_txt_upload())
    book_id = upload_resp.json()["book_id"]

    del_resp = await client.delete(f"/api/books/upload/{book_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["ok"] is True

    # Quota should be back to 0
    quota_resp = await client.get("/api/books/upload/quota")
    assert quota_resp.json()["used"] == 0


async def test_delete_uploaded_book_not_found(client):
    resp = await client.delete("/api/books/upload/99999")
    assert resp.status_code == 404


async def test_cannot_delete_gutenberg_book(client):
    from services.db import save_book
    await save_book(1342, {"id": 1342, "title": "Pride", "authors": [], "languages": [], "subjects": [], "download_count": 0, "cover": ""}, "some text")
    resp = await client.delete("/api/books/upload/1342")
    assert resp.status_code == 400
    assert "gutenberg" in resp.json()["detail"].lower()


async def test_get_draft_chapters_requires_ownership(tmp_db, test_user):
    """Another user cannot access draft chapters that belong to test_user."""
    # Upload as test_user
    async def _test_user_override():
        return await get_user_by_id(test_user["id"])

    app.dependency_overrides[get_current_user] = _test_user_override
    app.dependency_overrides[get_optional_user] = _test_user_override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        upload_resp = await c.post("/api/books/upload", files=_txt_upload())
        book_id = upload_resp.json()["book_id"]
    app.dependency_overrides.clear()

    # Now access as a different user
    other_user = await get_or_create_user(**SECOND_USER)

    async def _other_user_override():
        return await get_user_by_id(other_user["id"])

    app.dependency_overrides[get_current_user] = _other_user_override
    app.dependency_overrides[get_optional_user] = _other_user_override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        draft_resp = await c.get(f"/api/books/{book_id}/chapters/draft")
    app.dependency_overrides.clear()

    assert draft_resp.status_code == 403


async def test_get_draft_chapters_before_confirm(client, test_user):
    upload_resp = await client.post("/api/books/upload", files=_txt_upload())
    book_id = upload_resp.json()["book_id"]

    draft_resp = await client.get(f"/api/books/{book_id}/chapters/draft")
    assert draft_resp.status_code == 200
    data = draft_resp.json()
    assert "chapters" in data
    assert len(data["chapters"]) >= 1


async def test_chapters_endpoint_returns_400_for_draft_book(client, test_user):
    """Before confirming, /books/{id}/chapters should return 400."""
    upload_resp = await client.post("/api/books/upload", files=_txt_upload())
    book_id = upload_resp.json()["book_id"]

    chapters_resp = await client.get(f"/api/books/{book_id}/chapters")
    assert chapters_resp.status_code == 400


# ── Cascade delete tests (#372) ───────────────────────────────────────────────

async def _upload_and_confirm(client) -> int:
    """Upload + confirm an uploaded book; return its book_id."""
    upload_resp = await client.post("/api/books/upload", files=_txt_upload())
    assert upload_resp.status_code == 200
    book_id = upload_resp.json()["book_id"]
    detected = upload_resp.json()["detected_chapters"]
    chapters_to_confirm = [
        {"title": ch["title"], "original_index": ch["index"]}
        for ch in detected
    ]
    confirm_resp = await client.post(
        f"/api/books/{book_id}/chapters/confirm",
        json={"chapters": chapters_to_confirm},
    )
    assert confirm_resp.status_code == 200
    return book_id


async def test_delete_uploaded_book_cascades_child_tables(client, test_user, tmp_db):
    """Regression #372: delete_uploaded_book must remove all child-table rows.

    Without the fix, translations, audio_cache, translation_queue,
    word_occurrences, annotations, book_insights, chapter_summaries,
    reading_history, and user_reading_progress are left as orphans.
    """
    book_id = await _upload_and_confirm(client)

    async with aiosqlite.connect(tmp_db) as db:
        # translations
        await db.execute(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
            "VALUES (?, 0, 'zh', '[]')",
            (book_id,),
        )
        # audio_cache
        await db.execute(
            "INSERT INTO audio_cache (book_id, chapter_index, chunk_index, provider, voice, "
            "content_type, audio) VALUES (?, 0, 0, 'edge', 'v1', 'audio/mpeg', X'00')",
            (book_id,),
        )
        # translation_queue (pending, not running)
        await db.execute(
            "INSERT INTO translation_queue "
            "(book_id, chapter_index, target_language, status, priority) "
            "VALUES (?, 0, 'de', 'pending', 50)",
            (book_id,),
        )
        # chapter_summaries
        await db.execute(
            "INSERT INTO chapter_summaries (book_id, chapter_index, content, model) "
            "VALUES (?, 0, 'Great chapter.', 'gemini')",
            (book_id,),
        )
        # reading_history
        await db.execute(
            "INSERT INTO reading_history (user_id, book_id, chapter_index, read_at) "
            "VALUES (?, ?, 0, CURRENT_TIMESTAMP)",
            (test_user["id"], book_id),
        )
        # user_reading_progress
        await db.execute(
            "INSERT INTO user_reading_progress (user_id, book_id, chapter_index) "
            "VALUES (?, ?, 0)",
            (test_user["id"], book_id),
        )
        await db.commit()

    # annotations, book_insights via service helpers (they re-read DB_PATH)
    await create_annotation(test_user["id"], book_id, 0, "Interesting line.", "Quote", "yellow")
    await save_insight(test_user["id"], book_id, 0, "What is the theme?", "The theme is adventure.")

    del_resp = await client.delete(f"/api/books/upload/{book_id}")
    assert del_resp.status_code == 200

    async with aiosqlite.connect(tmp_db) as db:
        for table, col in [
            ("translations", "book_id"),
            ("audio_cache", "book_id"),
            ("translation_queue", "book_id"),
            ("annotations", "book_id"),
            ("book_insights", "book_id"),
            ("chapter_summaries", "book_id"),
            ("reading_history", "book_id"),
            ("user_reading_progress", "book_id"),
        ]:
            async with db.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {col}=?", (book_id,)
            ) as cur:
                (count,) = await cur.fetchone()
            assert count == 0, f"orphaned rows left in {table} after delete_uploaded_book (#372)"

        # word_occurrences — joined through vocabulary
        async with db.execute(
            "SELECT COUNT(*) FROM word_occurrences WHERE book_id=?", (book_id,)
        ) as cur:
            (wo_count,) = await cur.fetchone()
        assert wo_count == 0, "orphaned word_occurrences left after delete_uploaded_book (#372)"


async def test_delete_uploaded_book_rejects_when_translation_running(client, test_user, tmp_db):
    """Regression #372: delete_uploaded_book must return 409 when a queue row
    is currently running — deleting mid-job leaves orphaned translations."""
    book_id = await _upload_and_confirm(client)

    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO translation_queue "
            "(book_id, chapter_index, target_language, status, priority) "
            "VALUES (?, 0, 'de', 'running', 100)",
            (book_id,),
        )
        await db.commit()

    del_resp = await client.delete(f"/api/books/upload/{book_id}")
    assert del_resp.status_code == 409, (
        "delete_uploaded_book must return 409 when a translation job is running (#372)"
    )

    # Book must still exist
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT id FROM books WHERE id=?", (book_id,)) as cur:
            row = await cur.fetchone()
    assert row is not None, "Book must not be deleted when a queue job is running"


def _make_bypass_status_check_uploads(real_aiosqlite):
    """Patch aiosqlite so the running-status SELECT returns 'pending', bypassing
    the Python 409 check, while all other SQL runs against the real DB.
    This simulates the race where a row becomes 'running' after the Python check.
    """
    orig_connect = real_aiosqlite.connect
    _select_done = [False]

    class FakeStatusRow:
        def __getitem__(self, k): return "pending"

    class FakeCursor:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def fetchone(self): return FakeStatusRow()

    class SpyConn:
        def __init__(self, real):
            self._r = real

        @property
        def row_factory(self): return self._r.row_factory

        @row_factory.setter
        def row_factory(self, v): self._r.row_factory = v

        def execute(self, sql, *args, **kwargs):
            s = sql.strip().upper()
            if s.startswith("SELECT") and "status" in sql.lower() and not _select_done[0]:
                _select_done[0] = True
                return FakeCursor()
            return self._r.execute(sql, *args, **kwargs)

        async def commit(self): await self._r.commit()
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return await self._r.__aexit__(*a)

    def patched_connect(database, **kw):
        real_cm = orig_connect(database, **kw)

        class WrappedCM:
            async def __aenter__(self_):
                conn = await real_cm.__aenter__()
                return SpyConn(conn)

            async def __aexit__(self_, *a):
                return await real_cm.__aexit__(*a)

        return WrappedCM()

    class FakeAiosqlite:
        connect = staticmethod(patched_connect)
        Row = real_aiosqlite.Row

    return FakeAiosqlite()


async def test_delete_uploaded_book_sweeps_vocabulary_orphans(client, test_user, tmp_db):
    """Regression #377: delete_uploaded_book must sweep vocabulary entries that
    have no remaining word_occurrences after the book's occurrences are removed."""
    book_id = await _upload_and_confirm(client)

    with patch("services.db._update_lemma", new_callable=AsyncMock):
        await save_word(test_user["id"], "ephem", book_id, 0, "An ephemeral moment.")

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM vocabulary WHERE user_id=? AND word='ephem'",
            (test_user["id"],),
        ) as cur:
            (count,) = await cur.fetchone()
    assert count == 1, "pre-condition: vocabulary row must exist before delete"

    del_resp = await client.delete(f"/api/books/upload/{book_id}")
    assert del_resp.status_code == 200

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM vocabulary WHERE user_id=? AND word='ephem'",
            (test_user["id"],),
        ) as cur:
            (orphan_count,) = await cur.fetchone()
    assert orphan_count == 0, (
        "orphaned vocabulary entries must be swept after delete_uploaded_book (#377)"
    )


async def test_delete_uploaded_book_sql_guard_preserves_running_queue_row(
    client, test_user, tmp_db
):
    """Regression #372: even if Python 409 check races, SQL guard must
    preserve running translation_queue rows when deleting an uploaded book."""
    book_id = await _upload_and_confirm(client)

    async with aiosqlite.connect(tmp_db) as db:
        cursor = await db.execute(
            "INSERT INTO translation_queue "
            "(book_id, chapter_index, target_language, status, priority) "
            "VALUES (?, 0, 'fr', 'running', 100)",
            (book_id,),
        )
        running_id = cursor.lastrowid
        await db.commit()

    import aiosqlite as _real_aio
    import routers.uploads as uploads_mod

    old_aio = uploads_mod.aiosqlite
    uploads_mod.aiosqlite = _make_bypass_status_check_uploads(_real_aio)
    try:
        del_resp = await client.delete(f"/api/books/upload/{book_id}")
    finally:
        uploads_mod.aiosqlite = old_aio

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT status FROM translation_queue WHERE id=?", (running_id,)
        ) as cur:
            row = await cur.fetchone()
    assert row is not None and row[0] == "running", (
        "SQL guard (AND status != 'running') must preserve running queue rows "
        "even when Python 409 check is bypassed (#372)"
    )


# ── Uploaded book chapter-split fix (#380) ────────────────────────────────────

async def test_translation_status_uploaded_book_reports_correct_chapter_count(
    client, test_user, tmp_db
):
    """Regression #380: translation-status must report the correct chapter count
    for uploaded books. Previously, split_with_html_preference received JSON text
    and produced wrong chapter counts."""
    book_id = await _upload_and_confirm(client)

    resp = await client.get(f"/api/books/{book_id}/translation-status?target_language=zh")
    assert resp.status_code == 200
    data = resp.json()
    # The sample TXT has 2 chapters (Chapter 1 and Chapter 2); must not be 1 or garbage
    assert data["total_chapters"] >= 2, (
        f"total_chapters={data['total_chapters']} — split_with_html_preference "
        "must return the uploaded book's pre-split chapters, not split JSON text (#380)"
    )


async def test_split_with_html_preference_handles_uploaded_book_json():
    """Regression #380: split_with_html_preference must return correct chapters
    when passed uploaded-book JSON text instead of raw book text."""
    import json
    from services.book_chapters import split_with_html_preference, clear_cache

    uploaded_json = json.dumps({
        "draft": False,
        "chapters": [
            {"title": "Chapter One", "text": "The first chapter content here."},
            {"title": "Chapter Two", "text": "The second chapter content here."},
            {"title": "Chapter Three", "text": "The third chapter content here."},
        ]
    })

    clear_cache(99999)
    chapters = await split_with_html_preference(99999, uploaded_json)
    clear_cache(99999)

    assert len(chapters) == 3, (
        f"Expected 3 chapters from uploaded JSON, got {len(chapters)} (#380)"
    )
    assert chapters[0].title == "Chapter One"
    assert "first chapter" in chapters[0].text
    assert chapters[2].title == "Chapter Three"


async def test_translation_status_draft_book_reports_zero_chapters(client, test_user):
    """Regression #380: translation-status must report total_chapters=0 for a
    draft uploaded book (not yet confirmed by the user)."""
    # Upload but do NOT confirm → book stays in draft state
    upload_resp = await client.post("/api/books/upload", files=_txt_upload())
    assert upload_resp.status_code == 200
    book_id = upload_resp.json()["book_id"]

    resp = await client.get(f"/api/books/{book_id}/translation-status?target_language=zh")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_chapters"] == 0, (
        f"Draft uploaded book must report total_chapters=0, got {data['total_chapters']} (#380)"
    )


async def test_request_translation_rejects_draft_book(client, test_user):
    """Regression #380: POST /books/{id}/chapters/{ch}/translation must return
    400 for a draft uploaded book — chapters not yet confirmed."""
    upload_resp = await client.post("/api/books/upload", files=_txt_upload())
    book_id = upload_resp.json()["book_id"]

    resp = await client.post(
        f"/api/books/{book_id}/chapters/0/translation",
        json={"target_language": "zh"},
    )
    assert resp.status_code == 400, (
        f"Expected 400 for draft book translation request, got {resp.status_code} (#380)"
    )
    assert "draft" in resp.json()["detail"].lower() or "confirm" in resp.json()["detail"].lower()
