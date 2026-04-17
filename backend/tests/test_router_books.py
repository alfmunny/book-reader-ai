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


async def test_search_delegates_to_gutenberg(client):
    mock_result = {"count": 1, "books": [MOCK_META]}
    with patch("routers.books.search_books", new_callable=AsyncMock, return_value=mock_result):
        resp = await client.get("/api/books/search?q=austen")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1


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


async def test_import_stream_translates_chapters(client):
    text = ("CHAPTER I\n\n" + ("Erster Absatz. " * 40)
            + "\n\nCHAPTER II\n\n" + ("Zweiter Absatz. " * 40))
    meta = {**MOCK_META, "languages": ["de"]}
    await save_book(1342, meta, text)

    with patch(
        "routers.books.translate_text",
        new_callable=AsyncMock,
        return_value=["Translated paragraph."],
    ) as mock_translate:
        resp = await client.get("/api/books/1342/import-stream?target_language=en")

    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    stages = [e["stage"] for e in events if e["event"] == "stage"]
    assert "translating" in stages
    # translate_text should have been called at least once (per chapter)
    assert mock_translate.await_count >= 1


async def test_import_stream_skips_already_translated(client):
    """Chapters with existing translation cache are reported as cached."""
    from services.db import save_translation
    text = ("CHAPTER I\n\n" + ("Erster. " * 40)
            + "\n\nCHAPTER II\n\n" + ("Zweiter. " * 40))
    meta = {**MOCK_META, "languages": ["de"]}
    await save_book(1342, meta, text)
    # Pre-seed chapter 0 translation
    await save_translation(1342, 0, "en", ["Already done."])

    with patch("routers.books.translate_text",
               new_callable=AsyncMock, return_value=["x"]) as mock_translate:
        resp = await client.get("/api/books/1342/import-stream?target_language=en")

    events = _parse_sse(resp.text)
    translating = [e for e in events
                   if e["event"] == "progress" and e.get("stage") == "translating"]
    cached_count = sum(1 for e in translating if e.get("cached"))
    assert cached_count >= 1
    # Only chapter 1 should have been actually translated (0 was cached)
    assert mock_translate.await_count <= 1


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

    await save_book(1342, MOCK_META, "text")
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
