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
