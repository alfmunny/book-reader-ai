"""
Tests for routers/audiobooks.py
"""

import pytest
from unittest.mock import AsyncMock, patch
from services.db import save_audiobook

AUDIOBOOK = {
    "id": "librivox-999",
    "title": "Faust",
    "authors": ["Goethe"],
    "url_librivox": "https://librivox.org/faust",
    "url_rss": "https://librivox.org/faust/feed",
    "sections": [{"number": 1, "title": "Act I", "duration": "1:00:00", "url": "https://a.mp3"}],
}


async def test_get_audiobook_404_when_not_linked(client):
    resp = await client.get("/api/audiobooks/2229")
    assert resp.status_code == 404


async def test_get_audiobook_returns_saved(client):
    await save_audiobook(2229, AUDIOBOOK)
    resp = await client.get("/api/audiobooks/2229")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Faust"


async def test_save_audiobook(client):
    resp = await client.post("/api/audiobooks/2229", json=AUDIOBOOK)
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    get_resp = await client.get("/api/audiobooks/2229")
    assert get_resp.status_code == 200
    assert get_resp.json()["librivox_id"] == "librivox-999"


async def test_delete_audiobook(client):
    await save_audiobook(2229, AUDIOBOOK)
    resp = await client.delete("/api/audiobooks/2229")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    get_resp = await client.get("/api/audiobooks/2229")
    assert get_resp.status_code == 404


async def test_search_audiobooks(client):
    mock_results = [AUDIOBOOK]
    with patch("routers.audiobooks.search_audiobooks", new_callable=AsyncMock, return_value=mock_results):
        resp = await client.get("/api/audiobooks/2229/search?title=Faust&author=Goethe")
    assert resp.status_code == 200
    assert len(resp.json()["results"]) == 1
