"""
Tests for services/youtube.py
"""

import pytest
import respx
import httpx
from unittest.mock import patch
from services.youtube import search_videos

YOUTUBE_API = "https://www.googleapis.com/youtube/v3/search"

FAKE_RESPONSE = {
    "items": [
        {
            "id": {"videoId": "abc123"},
            "snippet": {
                "title": "Faust - Full Movie",
                "channelTitle": "Classic Films",
                "thumbnails": {"medium": {"url": "https://thumb.example.com/abc123.jpg"}},
            },
        },
        {
            "id": {"videoId": "def456"},
            "snippet": {
                "title": "Faust Opera",
                "channelTitle": "Opera Channel",
                "thumbnails": {"medium": {"url": "https://thumb.example.com/def456.jpg"}},
            },
        },
    ]
}


async def test_search_videos_returns_empty_when_no_api_key():
    with patch.dict("os.environ", {}, clear=True):
        result = await search_videos("Faust opera")
    assert result == []


async def test_search_videos_returns_formatted_results():
    with patch.dict("os.environ", {"YOUTUBE_API_KEY": "fake-key"}):
        with respx.mock:
            respx.get(YOUTUBE_API).mock(return_value=httpx.Response(200, json=FAKE_RESPONSE))
            result = await search_videos("Faust opera")

    assert len(result) == 2
    assert result[0]["id"] == "abc123"
    assert result[0]["title"] == "Faust - Full Movie"
    assert result[0]["channel"] == "Classic Films"
    assert result[0]["url"] == "https://www.youtube.com/watch?v=abc123"
    assert "thumbnail" in result[0]


async def test_search_videos_passes_query_and_max_results():
    with patch.dict("os.environ", {"YOUTUBE_API_KEY": "fake-key"}):
        with respx.mock:
            route = respx.get(YOUTUBE_API).mock(return_value=httpx.Response(200, json={"items": []}))
            await search_videos("Hamlet", max_results=3)

    params = route.calls[0].request.url.params
    assert params["q"] == "Hamlet"
    assert params["maxResults"] == "3"


async def test_search_videos_empty_items():
    with patch.dict("os.environ", {"YOUTUBE_API_KEY": "fake-key"}):
        with respx.mock:
            respx.get(YOUTUBE_API).mock(return_value=httpx.Response(200, json={"items": []}))
            result = await search_videos("nothing found")

    assert result == []
