"""
Tests for routers/books.py

External calls (Gutenberg) are mocked so tests are fast and offline.
"""

import pytest
from unittest.mock import AsyncMock, patch
from services.db import save_book

MOCK_META = {
    "id": 1342,
    "title": "Pride and Prejudice",
    "authors": ["Jane Austen"],
    "languages": ["en"],
    "subjects": ["Fiction"],
    "download_count": 50000,
    "cover": "https://cover.url",
}


async def test_cached_books_empty(client):
    resp = await client.get("/api/books/cached")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_cached_books_returns_saved_books(client):
    await save_book(1342, MOCK_META, "Some text")
    resp = await client.get("/api/books/cached")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Pride and Prejudice"


async def test_cached_books_does_not_include_text(client):
    await save_book(1342, MOCK_META, "Full book text here")
    resp = await client.get("/api/books/cached")
    assert "text" not in resp.json()[0]


async def test_book_meta_served_from_cache(client):
    await save_book(1342, MOCK_META, "text")
    resp = await client.get("/api/books/1342")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Pride and Prejudice"


async def test_book_meta_fetches_from_gutenberg_if_not_cached(client):
    with patch("routers.books.get_book_meta", new_callable=AsyncMock, return_value=MOCK_META):
        resp = await client.get("/api/books/1342")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Pride and Prejudice"


async def test_book_meta_404_when_gutenberg_fails(client):
    with patch("routers.books.get_book_meta", side_effect=Exception("Not found")):
        resp = await client.get("/api/books/99999")
    assert resp.status_code == 404
    detail = resp.json()["detail"]
    assert "Not found" not in detail
    assert ":" not in detail


async def test_book_chapters_served_from_cache(client):
    text = "Chapter I\n\nIt is a truth universally acknowledged.\n\nChapter II\n\nSome more text."
    await save_book(1342, MOCK_META, text, [])
    resp = await client.get("/api/books/1342/chapters")
    assert resp.status_code == 200
    data = resp.json()
    assert data["book_id"] == 1342
    assert len(data["chapters"]) >= 1


async def test_book_chapters_fetches_and_caches(client):
    text = "Chapter I\n\nFirst chapter text."
    with (
        patch("routers.books.get_book_meta", new_callable=AsyncMock, return_value=MOCK_META),
        patch("routers.books.get_book_text", new_callable=AsyncMock, return_value=text),
    ):
        resp = await client.get("/api/books/1342/chapters")
    assert resp.status_code == 200
    assert resp.json()["book_id"] == 1342


async def test_book_chapters_404_when_fetch_fails(client):
    with patch("routers.books._fetch_and_cache", side_effect=Exception("Network error")):
        resp = await client.get("/api/books/99999/chapters")
    assert resp.status_code == 404
    detail = resp.json()["detail"]
    assert "Network error" not in detail
    assert ":" not in detail


async def test_search_delegates_to_gutenberg(client):
    mock_result = {"count": 1, "books": [MOCK_META]}
    with patch("routers.books.search_books", new_callable=AsyncMock, return_value=mock_result):
        resp = await client.get("/api/books/search?q=austen")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1


# ── /books/popular pagination ────────────────────────────────────────────────

def _make_books(start: int, count: int, lang: str = "en") -> list[dict]:
    return [
        {"id": start + i, "title": f"Book {start + i}", "authors": [f"Author {start + i}"],
         "languages": [lang], "download_count": (start + i) * 100, "cover": ""}
        for i in range(count)
    ]


POPULAR_CACHE_DICT = {
    "": _make_books(1, 120),        # 120 all-language books
    "en": _make_books(1, 120),      # same for English in this fixture
    "de": _make_books(200, 30),     # 30 German books
}

import routers.books as _books_router


@pytest.fixture(autouse=False)
def popular_cache(monkeypatch):
    monkeypatch.setattr(_books_router, "_popular_cache", POPULAR_CACHE_DICT)
    yield
    monkeypatch.setattr(_books_router, "_popular_cache", None)


async def test_popular_books_returns_paginated_shape(client, popular_cache):
    resp = await client.get("/api/books/popular")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 120
    assert data["page"] == 1
    assert data["per_page"] == 50
    assert len(data["books"]) == 50
    assert data["books"][0]["id"] == 1


async def test_popular_books_page2(client, popular_cache):
    resp = await client.get("/api/books/popular?page=2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 2
    assert len(data["books"]) == 50
    assert data["books"][0]["id"] == 51


async def test_popular_books_last_page(client, popular_cache):
    resp = await client.get("/api/books/popular?page=3")
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 3
    assert len(data["books"]) == 20


async def test_popular_books_language_filter(client, popular_cache):
    resp = await client.get("/api/books/popular?language=de")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 30
    assert data["books"][0]["id"] == 200


async def test_popular_books_unknown_language_falls_back_to_all(client, popular_cache):
    resp = await client.get("/api/books/popular?language=xx")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 120  # falls back to "" collection


async def test_popular_books_oversized_language_returns_422(client, popular_cache):
    """Regression #568: GET /books/popular?language= must reject strings > 20 chars."""
    resp = await client.get("/api/books/popular?language=" + "x" * 21)
    assert resp.status_code == 422, (
        f"Expected 422 for oversized language in /books/popular, got {resp.status_code}: {resp.text}"
    )


async def test_popular_books_empty_when_no_manifest(client):
    import routers.books as br
    original = br._popular_cache
    br._popular_cache = None
    with patch("routers.books.os.path.isfile", return_value=False):
        resp = await client.get("/api/books/popular")
    br._popular_cache = original
    assert resp.status_code == 200
    data = resp.json()
    assert data["books"] == []
    assert data["total"] == 0


# ── Import stream (SSE) ──────────────────────────────────────────────────────

def _parse_sse(body: str) -> list[dict]:
    """Parse an SSE response body into (event, data) dicts."""
    import json
    events = []
    for block in body.strip().split("\n\n"):
        event = None
        data = None
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                data = json.loads(line.removeprefix("data:").strip())
        if event:
            events.append({"event": event, **data})
    return events


async def test_import_stream_cached_book_skips_fetch(client):
    """Book already in cache → streams stages for splitting, no fetch."""
    # A short text with two chapter keywords so the splitter finds them
    text = ("CHAPTER I\n\n" + ("Lorem ipsum dolor sit amet. " * 30)
            + "\n\nCHAPTER II\n\n" + ("Consectetur adipiscing elit. " * 30))
    await save_book(1342, MOCK_META, text)

    # target_language = source language → translation stage should be skipped
    resp = await client.get("/api/books/1342/import-stream?target_language=en")
    assert resp.status_code == 200
    events = _parse_sse(resp.text)

    stages = [e["stage"] for e in events if e["event"] == "stage"]
    assert "fetching" in stages
    assert "splitting" in stages
    # "translating" is skipped because target == source
    assert "translating" not in stages

    done = [e for e in events if e["event"] == "done"]
    assert len(done) == 1
    assert done[0]["book_id"] == 1342


async def test_import_stream_does_not_translate(client):
    """Translation is NOT done during import — user must confirm separately."""
    text = ("CHAPTER I\n\n" + ("Erster Absatz. " * 40)
            + "\n\nCHAPTER II\n\n" + ("Zweiter Absatz. " * 40))
    meta = {**MOCK_META, "languages": ["de"]}
    await save_book(1342, meta, text)

    resp = await client.get("/api/books/1342/import-stream")

    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    stages = [e["stage"] for e in events if e["event"] == "stage"]
    assert "translating" not in stages
    assert any(e["event"] == "done" for e in events)


async def test_import_stream_chapters_event_has_total_words(client):
    """chapters event includes total_words for cost estimation in the frontend."""
    text = ("CHAPTER I\n\n" + ("Word " * 100) + "\n\nCHAPTER II\n\n" + ("Word " * 100))
    await save_book(1342, MOCK_META, text)

    resp = await client.get("/api/books/1342/import-stream")

    events = _parse_sse(resp.text)
    chapters_ev = next(e for e in events if e["event"] == "chapters")
    assert "total_words" in chapters_ev
    assert chapters_ev["total_words"] > 0


async def test_import_stream_done_event_on_uncached_book(client):
    """A book not in cache → fetching stage + done event."""
    text = ("CHAPTER I\n\n" + ("Word " * 50) + "\n\nCHAPTER II\n\n" + ("Word " * 50))
    with patch("routers.books._fetch_and_cache",
               new_callable=AsyncMock, return_value=(MOCK_META, text)):
        resp = await client.get("/api/books/1342/import-stream")

    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert any(e["event"] == "done" for e in events)


# ── Retry-failed-chapter endpoint ────────────────────────────────────────────

async def test_retry_chapter_translation_revives_failed_row(client):
    """POST /chapters/{idx}/translation/retry resets a 'failed' queue row
    to 'pending' with attempts=0 so the worker picks it up again. Without
    this endpoint the reader's normal translation request (INSERT OR IGNORE)
    would leave the row failed forever."""
    import aiosqlite
    import services.db as db_module

    await save_book(1342, MOCK_META, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            """INSERT INTO translation_queue
                   (book_id, chapter_index, target_language, priority,
                    status, attempts, last_error)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (1342, 0, "zh", 100, "failed", 3, "boom"),
        )
        await conn.commit()

    resp = await client.post(
        "/api/books/1342/chapters/0/translation/retry",
        json={"target_language": "zh"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending"
    assert data["attempts"] == 0

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(
            "SELECT status, attempts, last_error, priority "
            "FROM translation_queue WHERE book_id=1342 AND chapter_index=0 AND target_language='zh'",
        ) as cursor:
            row = await cursor.fetchone()
    assert row["status"] == "pending"
    assert row["attempts"] == 0
    assert row["last_error"] is None
    # Reader-initiated retry uses priority=10 (matches request_chapter_translation)
    assert row["priority"] == 10


async def test_enqueue_all_chapters_for_user(client):
    """POST /books/{id}/translations/enqueue-all queues every not-yet-
    translated chapter of the book in the requested language at
    priority=20 (between admin per-book 50 and reader on-demand 10)."""
    import aiosqlite
    import services.db as db_module
    # Long enough text to split into 2 chapters under the plain-text splitter.
    text = (
        "CHAPTER I\n\n" + ("First chapter word. " * 40) + "\n\n"
        + ("More first chapter text. " * 40) + "\n\n"
        + "CHAPTER II\n\n" + ("Second chapter word. " * 40) + "\n\n"
        + ("More second chapter text. " * 40)
    )
    await save_book(1342, MOCK_META, text)
    resp = await client.post(
        "/api/books/1342/translations/enqueue-all",
        json={"target_language": "zh"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["ok"] is True
    assert data["enqueued"] >= 1

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(
            "SELECT chapter_index, priority, status FROM translation_queue "
            "WHERE book_id=1342 AND target_language='zh' ORDER BY chapter_index",
        ) as cursor:
            rows = [dict(r) for r in await cursor.fetchall()]
    assert rows
    for row in rows:
        assert row["status"] == "pending"
        assert row["priority"] == 20


async def test_retry_chapter_translation_inserts_if_no_row(client):
    """If no queue row exists yet (e.g. failed row was deleted), retry
    still succeeds and creates a pending row."""
    import aiosqlite
    import services.db as db_module
    from services.book_chapters import clear_cache as _clear

    text = "\n\n".join(
        f"CHAPTER {i}\n\n" + "word " * 200 for i in range(1, 4)
    )
    await save_book(1342, MOCK_META, text)
    _clear()
    resp = await client.post(
        "/api/books/1342/chapters/2/translation/retry",
        json={"target_language": "fr"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(
            "SELECT status, priority FROM translation_queue "
            "WHERE book_id=1342 AND chapter_index=2 AND target_language='fr'",
        ) as cursor:
            row = await cursor.fetchone()
    assert row["status"] == "pending"
    assert row["priority"] == 10


# ── Access and translation gates ─────────────────────────────────────────────

# ── Translation status endpoint ──────────────────────────────────────────────

async def test_translation_status_nonexistent_book_returns_404(client):
    """translation-status for a book that doesn't exist must return 404."""
    resp = await client.get("/api/books/99999/translation-status?target_language=de")
    assert resp.status_code == 404


async def test_translation_status_cached_book_no_translations(client):
    """Cached book with no translations → total_chapters≥0, translated_chapters=0."""
    await save_book(9998, MOCK_META, "Chapter I\n\nSome text here.")
    resp = await client.get("/api/books/9998/translation-status?target_language=de")
    assert resp.status_code == 200
    data = resp.json()
    assert data["translated_chapters"] == 0
    assert "bulk_active" not in data


async def test_translation_status_with_translations(client):
    """Cached book with one chapter translated returns correct counts."""
    from services.db import save_translation
    from services.book_chapters import clear_cache
    book_id = 8888  # distinct ID — avoids _chapter_cache collision with 1342
    meta = {**MOCK_META, "id": book_id}
    text = (
        "CHAPTER I\n\n" + ("The quick brown fox jumps. " * 80) + "\n\n"
        + "CHAPTER II\n\n" + ("A lazy dog sat by the fire. " * 80)
    )
    clear_cache(book_id)
    await save_book(book_id, meta, text)
    await save_translation(book_id, 0, "zh", ["第一章"])

    resp = await client.get(f"/api/books/{book_id}/translation-status?target_language=zh")
    assert resp.status_code == 200
    data = resp.json()
    assert data["translated_chapters"] == 1
    assert data["total_chapters"] >= 2


# ── Chapter queue-status endpoint ────────────────────────────────────────────

async def test_chapter_queue_status_nonexistent_book_returns_404(client):
    """GET queue-status for a book that isn't cached must return 404.

    Without this check the endpoint returns 200/{queued:false} for any
    book_id — indistinguishable from a real book with nothing queued."""
    resp = await client.get(
        "/api/books/99999/chapters/0/queue-status?target_language=zh"
    )
    assert resp.status_code == 404


async def test_chapter_queue_status_no_row(client):
    """Chapter not in queue → queued=False, status=null (book must exist)."""
    await save_book(1342, MOCK_META, "text")
    resp = await client.get(
        "/api/books/1342/chapters/0/queue-status?target_language=en"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["queued"] is False
    assert data["status"] is None


async def test_chapter_queue_status_pending(client):
    """Chapter in queue with pending status → queued=True, position>=1."""
    import aiosqlite
    import services.db as db_module
    await save_book(1342, MOCK_META, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            """INSERT INTO translation_queue
                   (book_id, chapter_index, target_language, priority, status)
               VALUES (?, ?, ?, ?, ?)""",
            (1342, 0, "zh", 10, "pending"),
        )
        await conn.commit()

    resp = await client.get(
        "/api/books/1342/chapters/0/queue-status?target_language=zh"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["queued"] is True
    assert data["status"] == "pending"


# ── Popular books flat-list format ───────────────────────────────────────────

async def test_popular_books_flat_list_language_filter(client, monkeypatch):
    """Legacy flat-list manifest format is filtered by language field."""
    flat = [
        {"id": 1, "title": "A", "authors": [], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""},
        {"id": 2, "title": "B", "authors": [], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""},
        {"id": 3, "title": "C", "authors": [], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""},
    ]
    import routers.books as br
    monkeypatch.setattr(br, "_popular_cache", flat)
    resp = await client.get("/api/books/popular?language=en")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert all(b["id"] in (1, 3) for b in data["books"])


async def test_popular_books_null_subjects_normalized(client, monkeypatch):
    """Null subjects/authors/languages in manifest are normalized to empty lists."""
    import routers.books as br
    # Bypass the file-load path by pre-setting a raw list (simulates loaded but unnormalized)
    # The normalization happens at load time in the actual endpoint, so test via the route.
    br._popular_cache = None
    import json, tempfile, os
    raw = [{"id": 99, "title": "No Subjects", "authors": ["A"], "languages": ["en"],
            "download_count": 0, "cover": ""}]  # subjects absent
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(raw, f)
        tmp_path = f.name
    monkeypatch.setattr(br, "_POPULAR_BOOKS_PATH", tmp_path)
    try:
        resp = await client.get("/api/books/popular")
        assert resp.status_code == 200
        books = resp.json()["books"]
        assert books[0]["subjects"] == []
    finally:
        os.unlink(tmp_path)
        br._popular_cache = None


# ── Access gates ─────────────────────────────────────────────────────────────

async def test_import_stream_public_without_login(anon_client):
    """All books are publicly accessible without login."""
    await save_book(9999, {**MOCK_META, "id": 9999}, "text")
    resp = await anon_client.get("/api/books/9999/import-stream")
    assert resp.status_code == 200


# ── GET /chapters/{idx}/translation — read-only cache check ──────────────────

async def test_get_chapter_translation_cached(client):
    """GET returns cached translation when it exists."""
    from services.db import save_translation
    await save_book(9999, MOCK_META, "text")
    await save_translation(9999, 0, "de", ["Übersetzung"])
    resp = await client.get("/api/books/9999/chapters/0/translation?target_language=de")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert data["paragraphs"] == ["Übersetzung"]


async def test_get_chapter_translation_not_cached(client):
    """GET returns 404 when no cached translation exists."""
    resp = await client.get("/api/books/9999/chapters/0/translation?target_language=fr")
    assert resp.status_code == 404


async def test_get_chapter_translation_no_cache_returns_404_for_guest(anon_client):
    """GET returns 404 (not 401) when no cached translation exists — public endpoint."""
    resp = await anon_client.get("/api/books/9999/chapters/0/translation?target_language=de")
    assert resp.status_code == 404


async def test_get_chapter_translation_cached_served_to_guest(anon_client):
    """GET serves cached translation to unauthenticated users."""
    from services.db import save_translation
    await save_book(9999, MOCK_META, "text")
    await save_translation(9999, 0, "es", ["Hola mundo"])
    resp = await anon_client.get("/api/books/9999/chapters/0/translation?target_language=es")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert data["paragraphs"] == ["Hola mundo"]


async def test_chapter_translation_requires_gemini_key(client):
    """Logged-in user without a Gemini key cannot enqueue new translation."""
    await save_book(9999, MOCK_META, "text")
    resp = await client.post(
        "/api/books/9999/chapters/0/translation",
        json={"target_language": "de"},
    )
    assert resp.status_code == 403
    assert "Gemini" in resp.json()["detail"]


async def test_chapter_translation_allowed_with_gemini_key(client, test_user):
    """Logged-in user with a Gemini key can enqueue translation."""
    from services.db import set_user_gemini_key
    from services.auth import encrypt_api_key
    await save_book(9999, MOCK_META, "text")
    await set_user_gemini_key(test_user["id"], encrypt_api_key("my-key"))
    resp = await client.post(
        "/api/books/9999/chapters/0/translation",
        json={"target_language": "de"},
    )
    assert resp.status_code == 200


async def test_chapter_translation_cache_served_without_login(anon_client):
    """Cached translation is served to unauthenticated users."""
    from services.db import save_translation
    await save_translation(9999, 0, "de", ["Übersetzung"])
    resp = await anon_client.post(
        "/api/books/9999/chapters/0/translation",
        json={"target_language": "de"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert data["paragraphs"] == ["Übersetzung"]


async def test_chapter_translation_requires_login_when_not_cached(anon_client):
    """Unauthenticated request for a non-cached chapter → 401."""
    await save_book(9999, MOCK_META, "text")
    resp = await anon_client.post(
        "/api/books/9999/chapters/0/translation",
        json={"target_language": "de"},
    )
    assert resp.status_code == 401


async def test_chapter_translation_same_language_returns_400(client):
    """Translating an English book into English is rejected with 400."""
    en_meta = {**MOCK_META, "id": 7001}
    await save_book(7001, en_meta, "Chapter I\n\nSome English text here.")
    resp = await client.post(
        "/api/books/7001/chapters/0/translation",
        json={"target_language": "en"},
    )
    assert resp.status_code == 400
    assert "same" in resp.json()["detail"].lower()


async def test_enqueue_all_same_language_returns_400(client):
    """Enqueue-all for the same language as the book is rejected with 400."""
    en_meta = {**MOCK_META, "id": 7002}
    await save_book(7002, en_meta, "Chapter I\n\nSome English text here.")
    resp = await client.post(
        "/api/books/7002/translations/enqueue-all",
        json={"target_language": "en"},
    )
    assert resp.status_code == 400


async def test_chapter_translation_corrupted_gemini_key_returns_403(client, test_user):
    """Regression: a corrupted (non-Fernet) Gemini key must return 403, not 500.

    books.py line 261 calls decrypt_api_key() without a try/except, so an
    InvalidToken raises HTTPException(500) instead of falling through to 403.
    """
    from services.db import set_user_gemini_key
    await save_book(9999, MOCK_META, "text")
    # Store a raw string that is not valid Fernet ciphertext
    await set_user_gemini_key(test_user["id"], "not-valid-fernet-ciphertext")
    resp = await client.post(
        "/api/books/9999/chapters/0/translation",
        json={"target_language": "de"},
    )
    assert resp.status_code == 403
    assert "Gemini" in resp.json()["detail"]


async def test_chapter_translation_rejects_nonexistent_book(client, test_user):
    """POST translation for a non-existent book must return 404 (not 403/500).

    SQLite FK enforcement is OFF — without this check the endpoint would
    either leak auth status or silently enqueue work for a ghost book."""
    from services.db import set_user_gemini_key
    from services.auth import encrypt_api_key
    await set_user_gemini_key(test_user["id"], encrypt_api_key("my-key"))
    resp = await client.post(
        "/api/books/888888/chapters/0/translation",
        json={"target_language": "de"},
    )
    assert resp.status_code == 404


async def test_enqueue_all_rejects_nonexistent_book(client):
    """POST enqueue-all for a non-existent book must return 404."""
    resp = await client.post(
        "/api/books/888888/translations/enqueue-all",
        json={"target_language": "de"},
    )
    assert resp.status_code == 404


async def test_retry_translation_rejects_nonexistent_book(client):
    """POST retry for a non-existent book must return 404."""
    resp = await client.post(
        "/api/books/888888/chapters/0/translation/retry",
        json={"target_language": "de"},
    )
    assert resp.status_code == 404


async def test_get_chapter_translation_normalizes_language(client):
    """GET .../translation?target_language=ZH must find a cached 'zh' row.

    Without normalization the lookup uses 'ZH' as-is and misses the 'zh' entry."""
    from services.db import save_translation
    await save_book(9999, MOCK_META, "text")
    await save_translation(9999, 0, "zh", ["翻译"])
    resp = await client.get("/api/books/9999/chapters/0/translation?target_language=ZH")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"
    assert resp.json()["paragraphs"] == ["翻译"]


async def test_chapter_translation_normalizes_language_for_cache_hit(anon_client):
    """POST .../translation with 'ZH-CN' must hit a cached 'zh' entry.

    Without normalization the cache lookup uses 'ZH-CN' and misses 'zh',
    forcing an unnecessary re-enqueue."""
    from services.db import save_translation
    await save_translation(9999, 0, "zh", ["翻译"])
    resp = await anon_client.post(
        "/api/books/9999/chapters/0/translation",
        json={"target_language": "ZH-CN"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"


async def test_translation_status_normalizes_language(client):
    """GET /books/{id}/translation-status?target_language=ZH-CN must count
    translations stored under 'zh', not 'ZH-CN'."""
    from services.db import save_translation
    await save_book(1342, MOCK_META, "text")
    await save_translation(1342, 0, "zh", ["翻译"])
    resp = await client.get(
        "/api/books/1342/translation-status?target_language=ZH-CN"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["translated_chapters"] == 1, (
        f"Expected 1 translated chapter but got {data.get('translated_chapters')}; "
        "target_language was not normalized before DB lookup"
    )


async def test_chapter_queue_status_normalizes_language(client):
    """GET .../queue-status?target_language=ZH-CN must find rows stored under 'zh'."""
    import aiosqlite
    import services.db as db_module
    await save_book(1342, MOCK_META, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            """INSERT INTO translation_queue
                   (book_id, chapter_index, target_language, priority, status)
               VALUES (?, ?, ?, ?, ?)""",
            (1342, 0, "zh", 10, "pending"),
        )
        await conn.commit()
    resp = await client.get(
        "/api/books/1342/chapters/0/queue-status?target_language=ZH-CN"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["queued"] is True, (
        "Expected queued=True for 'ZH-CN' when row stored under 'zh'; "
        "target_language was not normalized"
    )


# ── import-stream uses HTML splitter (issue #276) ─────────────────────────────

async def test_import_stream_uses_epub_splitter_chapter_count(client):
    """import-stream must use split_with_html_preference (EPUB path), not build_chapters.

    When the EPUB edition produces a different chapter count than the plain-text
    splitter, the import dialog chapter count must match the reader (issue #276).
    Before the fix the stream called build_chapters(text) and returned 2;
    after the fix it calls split_with_html_preference with EPUB and returns 3.
    """
    from unittest.mock import AsyncMock, patch
    from services.book_chapters import clear_cache
    from services.splitter import Chapter

    book_id = 7777
    meta = {**MOCK_META, "id": book_id}
    # Plain-text content that produces 2 chapters via build_chapters
    text = (
        "CHAPTER I\n\n" + ("First chapter. " * 40) + "\n\n"
        "CHAPTER II\n\n" + ("Second chapter. " * 40)
    )
    clear_cache(book_id)
    await save_book(book_id, meta, text)

    # EPUB path returns 3 chapters — different from the plain-text count.
    epub_3ch = [
        Chapter(title="Chapter I", text="word " * 110),
        Chapter(title="Chapter II", text="word " * 110),
        Chapter(title="Chapter III", text="word " * 110),
    ]

    with (
        patch("services.db.get_book_epub_bytes", new_callable=AsyncMock, return_value=b"fake_epub"),
        patch("services.book_chapters.build_chapters_from_epub", return_value=epub_3ch),
    ):
        resp = await client.get(f"/api/books/{book_id}/import-stream")

    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    chapters_ev = next((e for e in events if e["event"] == "chapters"), None)
    assert chapters_ev is not None, "chapters event missing from import stream"
    assert chapters_ev["total"] == 3, (
        f"import-stream reported {chapters_ev['total']} chapters but expected 3 "
        "(EPUB splitter); build_chapters on the plain text would return 2"
    )
    clear_cache(book_id)


# ── reader retry running-guard (issue #316) ───────────────────────────────────

async def test_reader_retry_rejects_running_item(client):
    """POST /chapters/{idx}/translation/retry must return 409 when the row is
    already 'running'.

    Before the fix, enqueue(reset_failed=True) silently reset 'running' → 'pending'
    in-place, then mark_queue_row_done (called by the worker on success) deleted the
    re-queued pending row — making the retry a no-op and corrupting the attempt counter.

    After the fix the endpoint returns 409, consistent with the admin
    queue_retry_item endpoint (PR #295).
    """
    import aiosqlite
    import services.db as db_module

    await save_book(1342, MOCK_META, "text")
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            """INSERT INTO translation_queue
                   (book_id, chapter_index, target_language, priority, status, attempts)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (1342, 0, "zh", 10, "running", 1),
        )
        await conn.commit()

    resp = await client.post(
        "/api/books/1342/chapters/0/translation/retry",
        json={"target_language": "zh"},
    )
    assert resp.status_code == 409, (
        f"Expected 409 for running item, got {resp.status_code}: {resp.text}"
    )
    assert "running" in resp.json()["detail"].lower()

    # Row must remain 'running' — not reset
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(
            "SELECT status, attempts FROM translation_queue "
            "WHERE book_id=1342 AND chapter_index=0 AND target_language='zh'",
        ) as cursor:
            row = await cursor.fetchone()
    assert row["status"] == "running"
    assert row["attempts"] == 1


# ── Upload book access control integration tests ───────────────────────────

import json as _json_books
import aiosqlite as _aio_books
import services.db as _db_books


async def _insert_upload_book(book_id: int, owner_user_id: int) -> None:
    chapters = _json_books.dumps({"draft": False, "chapters": [{"title": "Ch1", "text": "private content"}]})
    async with _aio_books.connect(_db_books.DB_PATH) as db:
        await db.execute(
            """INSERT OR REPLACE INTO books
               (id, title, authors, languages, subjects, download_count,
                cover, text, images, source, owner_user_id)
               VALUES (?, 'Private Book', '[]', '["en"]', '[]', 0, '', ?, '[]', 'upload', ?)""",
            (book_id, chapters, owner_user_id),
        )
        await db.commit()


async def test_upload_book_meta_blocked_for_non_owner(client, test_user, tmp_db):
    from services.db import get_or_create_user, set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("owner-gid", "owner@ex.com", "Owner", "")
    await _insert_upload_book(9901, owner["id"])
    resp = await client.get("/api/books/9901")
    assert resp.status_code == 403, resp.text


async def test_upload_book_chapters_blocked_for_non_owner(client, test_user, tmp_db):
    from services.db import get_or_create_user, set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("owner-gid2", "owner2@ex.com", "Owner2", "")
    await _insert_upload_book(9902, owner["id"])
    resp = await client.get("/api/books/9902/chapters")
    assert resp.status_code == 403, resp.text


async def test_upload_book_translation_status_blocked_for_non_owner(client, test_user, tmp_db):
    from services.db import get_or_create_user, set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("owner-gid3", "owner3@ex.com", "Owner3", "")
    await _insert_upload_book(9903, owner["id"])
    resp = await client.get("/api/books/9903/translation-status?target_language=en")
    assert resp.status_code == 403, resp.text


async def test_upload_book_queue_status_blocked_for_non_owner(client, test_user, tmp_db):
    from services.db import get_or_create_user, set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("owner-gid4", "owner4@ex.com", "Owner4", "")
    await _insert_upload_book(9904, owner["id"])
    resp = await client.get("/api/books/9904/chapters/0/queue-status?target_language=en")
    assert resp.status_code == 403, resp.text


async def test_upload_book_get_translation_blocked_for_non_owner(client, test_user, tmp_db):
    from services.db import get_or_create_user, set_user_role, save_translation
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("owner-gid5", "owner5@ex.com", "Owner5", "")
    await _insert_upload_book(9905, owner["id"])
    await save_translation(9905, 0, "de", ["Übersetzung"])
    resp = await client.get("/api/books/9905/chapters/0/translation?target_language=de")
    assert resp.status_code == 403, resp.text


async def test_upload_book_post_translation_blocked_for_non_owner(client, test_user, tmp_db):
    from services.db import get_or_create_user, set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("owner-gid6", "owner6@ex.com", "Owner6", "")
    await _insert_upload_book(9906, owner["id"])
    resp = await client.post("/api/books/9906/chapters/0/translation", json={"target_language": "de"})
    assert resp.status_code == 403, resp.text


async def test_upload_book_enqueue_all_blocked_for_non_owner(client, test_user, tmp_db):
    from services.db import get_or_create_user, set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("owner-gid7", "owner7@ex.com", "Owner7", "")
    await _insert_upload_book(9907, owner["id"])
    resp = await client.post("/api/books/9907/translations/enqueue-all", json={"target_language": "de"})
    assert resp.status_code == 403, resp.text


async def test_upload_book_retry_translation_blocked_for_non_owner(client, test_user, tmp_db):
    from services.db import get_or_create_user, set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("owner-gid8", "owner8@ex.com", "Owner8", "")
    await _insert_upload_book(9908, owner["id"])
    resp = await client.post(
        "/api/books/9908/chapters/0/translation/retry", json={"target_language": "de"}
    )
    assert resp.status_code == 403, resp.text


async def test_import_stream_blocked_for_non_owner_of_uploaded_book(anon_client, tmp_db):
    """Regression #383: import-stream must return 403 for an uploaded (private)
    book when the requester is not the owner. Previously the access check was
    missing and chapter titles / word counts were leaked."""
    import services.db as _db
    from services.db import get_or_create_user
    owner = await get_or_create_user("owner-gid-is", "owner-is@ex.com", "OwnerIS", "")
    await _insert_upload_book(9909, owner["id"])
    resp = await anon_client.get("/api/books/9909/import-stream")
    assert resp.status_code == 403, (
        f"Expected 403 for unauthenticated access to private uploaded book import-stream, "
        f"got {resp.status_code} (#383)"
    )


async def test_gutenberg_book_still_accessible_to_any_user(client, test_user, tmp_db):
    await save_book(9910, MOCK_META, "some text")
    resp = await client.get("/api/books/9910")
    assert resp.status_code == 200, resp.text


async def test_owner_can_access_own_upload_book(client, test_user, tmp_db):
    await _insert_upload_book(9911, test_user["id"])
    resp = await client.get("/api/books/9911")
    assert resp.status_code == 200, resp.text


# ── chapter_index bounds checks ───────────────────────────────────────────────

async def test_request_translation_out_of_bounds_chapter_returns_400(client, test_user):
    """Regression #429: POST /translation with chapter_index beyond chapter count must
    return 400 instead of silently enqueuing impossible work.
    """
    from services.db import set_user_gemini_key
    from services.auth import encrypt_api_key
    from services.book_chapters import clear_cache as _clear

    text = "CHAPTER I\n\n" + "word " * 200 + "\n\nCHAPTER II\n\n" + "word " * 200
    await save_book(9877, {**MOCK_META, "id": 9877, "languages": ["de"]}, text)
    _clear()
    await set_user_gemini_key(test_user["id"], encrypt_api_key("test-key"))

    resp = await client.post(
        "/api/books/9877/chapters/999/translation",
        json={"target_language": "en"},
    )
    assert resp.status_code == 400, (
        f"Expected 400 for out-of-bounds chapter_index=999 on 2-chapter book, "
        f"got {resp.status_code}: {resp.text}"
    )


async def test_retry_translation_out_of_bounds_chapter_returns_400(client, test_user):
    """Regression #429: POST /translation/retry with out-of-bounds chapter_index
    must return 400 instead of silently enqueuing impossible work.
    """
    from services.book_chapters import clear_cache as _clear

    text = "CHAPTER I\n\n" + "word " * 200 + "\n\nCHAPTER II\n\n" + "word " * 200
    await save_book(9878, {**MOCK_META, "id": 9878, "languages": ["de"]}, text)
    _clear()

    resp = await client.post(
        "/api/books/9878/chapters/999/translation/retry",
        json={"target_language": "en"},
    )
    assert resp.status_code == 400, (
        f"Expected 400 for out-of-bounds chapter_index=999 on 2-chapter book, "
        f"got {resp.status_code}: {resp.text}"
    )


async def test_queue_status_out_of_bounds_chapter_returns_400(client, test_user):
    """Regression #457: GET /books/{book_id}/chapters/{chapter_index}/queue-status
    with chapter_index beyond the book's chapter count must return 400.

    Without the bounds check any authenticated user gets a silent "not queued"
    response for a chapter that does not exist."""
    from services.book_chapters import clear_cache as _clear

    text = "CHAPTER I\n\n" + "word " * 200 + "\n\nCHAPTER II\n\n" + "word " * 200
    await save_book(9879, {**MOCK_META, "id": 9879}, text)
    _clear()

    resp = await client.get(
        "/api/books/9879/chapters/999/queue-status?target_language=de"
    )
    assert resp.status_code == 400, (
        f"Expected 400 for out-of-bounds chapter_index=999 on 2-chapter book, "
        f"got {resp.status_code}: {resp.text}"
    )
    assert "out of range" in resp.json()["detail"].lower()


# ── GET /books/cached hides private uploads (Issue #478) ─────────────────────

async def test_cached_books_hides_uploaded_books(client, test_user, tmp_db, insert_private_book):
    """Regression #478: GET /books/cached must not return private uploaded books.

    Any unauthenticated user calling /books/cached should only see publicly
    available Gutenberg books, not titles of other users' private uploads.
    """
    import aiosqlite
    import services.db as db_module

    # Insert a confirmed uploaded book (source='upload') owned by test_user
    await insert_private_book(book_id=9891, owner_user_id=test_user["id"])

    # Also insert a public Gutenberg book
    await save_book(9892, {**MOCK_META, "id": 9892}, "some text")

    resp = await client.get("/api/books/cached")
    assert resp.status_code == 200
    returned_ids = {b["id"] for b in resp.json()}
    assert 9892 in returned_ids, "Public Gutenberg book must appear in cached list"
    assert 9891 not in returned_ids, (
        "Private uploaded book must NOT appear in cached list — its title is private"
    )


# ── Issue #513: target_language max_length ────────────────────────────────────


async def test_request_translation_oversized_target_language_returns_422(client, test_user):
    """Regression #513: POST /books/{id}/chapters/0/translation with target_language > 20 chars
    must return 422, not silently store a huge string in translation_queue."""
    await save_book(9801, {**MOCK_META, "id": 9801}, "some text")
    resp = await client.post(
        "/api/books/9801/chapters/0/translation",
        json={"target_language": "x" * 21},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for oversized target_language, got {resp.status_code}: {resp.text}"
    )


async def test_enqueue_all_oversized_target_language_returns_422(client, test_user):
    """Regression #513: POST /books/{id}/translations/enqueue-all with target_language > 20 chars
    must return 422."""
    await save_book(9802, {**MOCK_META, "id": 9802}, "some text")
    resp = await client.post(
        "/api/books/9802/translations/enqueue-all",
        json={"target_language": "y" * 21},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for oversized target_language in enqueue-all, got {resp.status_code}: {resp.text}"
    )


async def test_retry_translation_oversized_target_language_returns_422(client, test_user):
    """Regression #513: POST /books/{id}/chapters/{idx}/translation/retry with target_language > 20 chars
    must return 422."""
    await save_book(9803, {**MOCK_META, "id": 9803}, "some text")
    resp = await client.post(
        "/api/books/9803/chapters/0/translation/retry",
        json={"target_language": "z" * 21},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for oversized target_language in retry, got {resp.status_code}: {resp.text}"
    )


# ── Issue #517: Unbounded GET query params ────────────────────────────────────


async def test_search_oversized_q_returns_422(client):
    """Regression #517: GET /books/search?q=<201 chars> must return 422."""
    resp = await client.get(f"/api/books/search?q={'x' * 201}")
    assert resp.status_code == 422, (
        f"Expected 422 for oversized q in /books/search, got {resp.status_code}: {resp.text}"
    )


async def test_search_oversized_language_returns_422(client):
    """Regression #517: GET /books/search?language=<21 chars> must return 422."""
    resp = await client.get(f"/api/books/search?q=test&language={'x' * 21}")
    assert resp.status_code == 422, (
        f"Expected 422 for oversized language in /books/search, got {resp.status_code}: {resp.text}"
    )


async def test_translation_status_oversized_target_language_returns_422(client):
    """Regression #517: GET /books/{id}/translation-status?target_language=<21 chars> must return 422."""
    resp = await client.get(f"/api/books/1/translation-status?target_language={'x' * 21}")
    assert resp.status_code == 422, (
        f"Expected 422 for oversized target_language in translation-status, got {resp.status_code}: {resp.text}"
    )


async def test_chapter_queue_status_oversized_target_language_returns_422(client, test_user):
    """Regression #517: GET /books/{id}/chapters/{idx}/queue-status?target_language=<21 chars> must return 422."""
    resp = await client.get(f"/api/books/1/chapters/0/queue-status?target_language={'x' * 21}")
    assert resp.status_code == 422, (
        f"Expected 422 for oversized target_language in chapter queue-status, got {resp.status_code}: {resp.text}"
    )


async def test_chapter_translation_oversized_target_language_returns_422(client):
    """Regression #517: GET /books/{id}/chapters/{idx}/translation?target_language=<21 chars> must return 422."""
    resp = await client.get(f"/api/books/1/chapters/0/translation?target_language={'x' * 21}")
    assert resp.status_code == 422, (
        f"Expected 422 for oversized target_language in chapter translation, got {resp.status_code}: {resp.text}"
    )


async def test_chapter_translation_negative_chapter_index_returns_422(client, test_user, tmp_db):
    """Regression #719: GET/POST /books/{id}/chapters/{idx}/translation with idx<0 must return 422."""
    resp = await client.get("/api/books/1/chapters/-1/translation?target_language=en")
    assert resp.status_code == 422, f"GET: expected 422, got {resp.status_code}: {resp.text}"

    resp = await client.post("/api/books/1/chapters/-1/translation",
                             json={"target_language": "en"})
    assert resp.status_code == 422, f"POST: expected 422, got {resp.status_code}: {resp.text}"

    resp = await client.get("/api/books/1/chapters/-1/queue-status?target_language=en")
    assert resp.status_code == 422, f"queue-status: expected 422, got {resp.status_code}: {resp.text}"


# ── Issue #727: ge=1 bounds on remaining book_id path params ─────────────────


async def test_translation_status_negative_book_id_returns_422(client):
    """Regression #727: GET /books/{book_id}/translation-status with negative book_id must return 422."""
    resp = await client.get("/api/books/-1/translation-status?target_language=en")
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_enqueue_all_negative_book_id_returns_422(client, test_user):
    """Regression #727: POST /books/{book_id}/translations/enqueue-all with negative book_id must return 422."""
    resp = await client.post("/api/books/-1/translations/enqueue-all", json={"target_language": "en"})
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_book_meta_negative_book_id_returns_422(client):
    """Regression #727: GET /books/{book_id} with negative book_id must return 422."""
    resp = await client.get("/api/books/-1")
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_book_chapters_negative_book_id_returns_422(client):
    """Regression #727: GET /books/{book_id}/chapters with negative book_id must return 422."""
    resp = await client.get("/api/books/-1/chapters")
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_import_stream_negative_book_id_returns_422(client):
    """Regression #727: GET /books/{book_id}/import-stream with negative book_id must return 422."""
    resp = await client.get("/api/books/-1/import-stream")
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


# ── Issue #739: le=10000 on page query param ──────────────────────────────────


async def test_search_page_too_large_returns_422(client):
    """Regression #739: GET /books/search?page=10001 must return 422."""
    resp = await client.get("/api/books/search?q=test&page=10001")
    assert resp.status_code == 422, f"Expected 422 for page > 10000, got {resp.status_code}: {resp.text}"


async def test_popular_books_page_too_large_returns_422(client):
    """Regression #739: GET /books/popular?page=10001 must return 422."""
    resp = await client.get("/api/books/popular?page=10001")
    assert resp.status_code == 422, f"Expected 422 for page > 10000, got {resp.status_code}: {resp.text}"


# ── Issue #772: min_length=1 on target_language in RequestTranslationBody ────


async def test_request_translation_empty_target_language_returns_422(client, test_user):
    """Regression #772: POST /books/{id}/chapters/{i}/translation with target_language="" must return 422."""
    resp = await client.post(
        "/api/books/1/chapters/0/translation",
        json={"target_language": ""},
    )
    assert resp.status_code == 422, f"Expected 422 for empty target_language, got {resp.status_code}: {resp.text}"


# ── Issue #786: min_length=1 on target_language query params in books router ──


async def test_translation_status_empty_target_language_returns_422(client, test_user):
    """Regression #786: GET /books/{id}/translation-status?target_language="" must return 422."""
    resp = await client.get("/api/books/1/translation-status?target_language=")
    assert resp.status_code == 422, (
        f"Expected 422 for empty target_language in translation-status, got {resp.status_code}: {resp.text}"
    )


async def test_chapter_queue_status_empty_target_language_returns_422(client, test_user):
    """Regression #786: GET /books/{id}/chapters/{i}/queue-status?target_language="" must return 422."""
    resp = await client.get("/api/books/1/chapters/0/queue-status?target_language=")
    assert resp.status_code == 422, (
        f"Expected 422 for empty target_language in queue-status, got {resp.status_code}: {resp.text}"
    )


async def test_chapter_translation_get_empty_target_language_returns_422(client, test_user):
    """Regression #786: GET /books/{id}/chapters/{i}/translation?target_language="" must return 422."""
    resp = await client.get("/api/books/1/chapters/0/translation?target_language=")
    assert resp.status_code == 422, (
        f"Expected 422 for empty target_language in GET translation, got {resp.status_code}: {resp.text}"
    )
