"""
Tests for services/librivox.py

All HTTP calls are mocked with respx.
"""

import respx
import httpx
from services.librivox import search_audiobooks, get_audiobook, _format

LIBRIVOX_API = "https://librivox.org/api/feed/audiobooks"

RAW_BOOK = {
    "id": "999",
    "title": "Faust",
    "authors": [{"first_name": "Johann Wolfgang", "last_name": "von Goethe"}],
    "url_librivox": "https://librivox.org/faust",
    "url_rss": "https://librivox.org/faust/feed",
    "sections": [
        {"section_number": "1", "title": "Act I", "duration": "1:00:00", "listen_url": "https://a.mp3"},
        {"section_number": "2", "title": "Act II", "duration": "0:45:00", "listen_url": "https://b.mp3"},
        # Section with no listen_url should be excluded
        {"section_number": "3", "title": "Silent", "duration": "0:00:00", "listen_url": ""},
    ],
}


# ── _format (pure function) ───────────────────────────────────────────────────

def test_format_basic():
    result = _format(RAW_BOOK)
    assert result["id"] == "999"
    assert result["title"] == "Faust"
    assert result["authors"] == ["Johann Wolfgang von Goethe"]
    assert len(result["sections"]) == 2  # silent section excluded


def test_format_excludes_sections_without_url():
    book = {**RAW_BOOK, "sections": [
        {"section_number": "1", "listen_url": ""},
        {"section_number": "2", "listen_url": "https://ok.mp3"},
    ]}
    result = _format(book)
    assert len(result["sections"]) == 1
    assert result["sections"][0]["url"] == "https://ok.mp3"


def test_format_missing_fields():
    result = _format({})
    assert result["id"] == ""
    assert result["title"] == ""
    assert result["authors"] == []
    assert result["sections"] == []


def test_format_strips_author_whitespace():
    book = {**RAW_BOOK, "authors": [{"first_name": "", "last_name": "Austen"}]}
    result = _format(book)
    assert result["authors"] == ["Austen"]


# ── search_audiobooks ─────────────────────────────────────────────────────────

async def test_search_audiobooks_returns_results():
    with respx.mock:
        respx.get(LIBRIVOX_API).mock(return_value=httpx.Response(200, json={"books": [RAW_BOOK]}))
        result = await search_audiobooks("Faust", "Goethe")

    assert len(result) == 1
    assert result[0]["title"] == "Faust"


async def test_search_audiobooks_empty_when_books_is_false_string():
    """LibriVox returns {"books": "false"} when no results found."""
    with respx.mock:
        respx.get(LIBRIVOX_API).mock(return_value=httpx.Response(200, json={"books": "false"}))
        result = await search_audiobooks("nonexistent xyz")

    assert result == []


async def test_search_audiobooks_empty_when_books_list_is_empty():
    with respx.mock:
        respx.get(LIBRIVOX_API).mock(return_value=httpx.Response(200, json={"books": []}))
        result = await search_audiobooks("nothing")

    assert result == []


async def test_search_audiobooks_without_author():
    with respx.mock:
        route = respx.get(LIBRIVOX_API).mock(return_value=httpx.Response(200, json={"books": []}))
        await search_audiobooks("Faust")

    params = route.calls[0].request.url.params
    assert "title" in params
    assert "author" not in params


# ── get_audiobook ─────────────────────────────────────────────────────────────

async def test_get_audiobook_returns_formatted():
    with respx.mock:
        respx.get(LIBRIVOX_API).mock(return_value=httpx.Response(200, json={"books": [RAW_BOOK]}))
        result = await get_audiobook("999")

    assert result is not None
    assert result["id"] == "999"


async def test_get_audiobook_returns_none_when_not_found():
    with respx.mock:
        respx.get(LIBRIVOX_API).mock(return_value=httpx.Response(200, json={"books": "false"}))
        result = await get_audiobook("unknown")

    assert result is None


async def test_get_audiobook_returns_none_for_empty_list():
    with respx.mock:
        respx.get(LIBRIVOX_API).mock(return_value=httpx.Response(200, json={"books": []}))
        result = await get_audiobook("999")

    assert result is None
