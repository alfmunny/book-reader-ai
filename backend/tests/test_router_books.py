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
