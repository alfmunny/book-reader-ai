"""Extended tests for services/gutenberg.py — error paths and edge cases not covered by test_gutenberg.py."""

import pytest
import respx
import httpx
from services.gutenberg import search_books, get_book_meta, get_book_html, get_book_text


BOOK_ID = 1342
META_URL = f"https://gutendex.com/books/{BOOK_ID}"
SEARCH_URL = "https://gutendex.com/books"

RAW_BOOK = {
    "id": BOOK_ID,
    "title": "Pride and Prejudice",
    "authors": [{"name": "Austen, Jane"}],
    "languages": ["en"],
    "subjects": [],
    "download_count": 50000,
    "formats": {
        "image/jpeg": "https://covers.example.com/1342.jpg",
        "text/plain; charset=utf-8": "https://www.gutenberg.org/ebooks/1342.txt.utf-8",
    },
}


# ── search_books error / retry paths ─────────────────────────────────────────

async def test_search_books_filters_out_books_without_text():
    """Books with no text/plain format should be excluded from results."""
    book_no_text = {**RAW_BOOK, "formats": {"image/jpeg": "cover.jpg"}}
    payload = {"count": 1, "results": [book_no_text]}
    with respx.mock:
        respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=payload))
        result = await search_books("Pride")

    assert result["count"] == 0
    assert result["books"] == []


async def test_search_books_500_then_success():
    """A 500 error on the first attempt is retried and succeeds on second."""
    payload = {"count": 1, "results": [RAW_BOOK]}
    call_count = 0

    def side_effect(request, *args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(500)
        return httpx.Response(200, json=payload)

    with respx.mock:
        respx.get(SEARCH_URL).mock(side_effect=side_effect)
        result = await search_books("Pride")

    assert result["count"] == 1
    assert call_count == 2


async def test_search_books_4xx_raises_immediately():
    """A 4xx error should raise ValueError without retry."""
    with respx.mock:
        respx.get(SEARCH_URL).mock(return_value=httpx.Response(404))
        with pytest.raises(ValueError, match="404"):
            await search_books("Pride")


async def test_search_books_timeout_both_attempts_raises():
    """Two consecutive timeouts should raise ValueError with timeout message."""
    with respx.mock:
        respx.get(SEARCH_URL).mock(side_effect=httpx.TimeoutException("timed out"))
        with pytest.raises(ValueError, match="timed out"):
            await search_books("Pride")


async def test_search_books_connect_error_both_attempts_raises():
    """Two consecutive connect errors should raise ValueError."""
    with respx.mock:
        respx.get(SEARCH_URL).mock(side_effect=httpx.ConnectError("connection refused"))
        with pytest.raises(ValueError, match="Gutenberg search failed"):
            await search_books("Pride")


async def test_search_books_500_both_attempts_raises():
    """Two consecutive 500 errors should eventually raise ValueError."""
    with respx.mock:
        respx.get(SEARCH_URL).mock(return_value=httpx.Response(500))
        with pytest.raises(ValueError, match="Gutenberg search failed"):
            await search_books("Pride")


# ── get_book_meta error paths ─────────────────────────────────────────────────

async def test_get_book_meta_http_error_raises():
    """A non-200 response should propagate via raise_for_status."""
    with respx.mock:
        respx.get(META_URL).mock(return_value=httpx.Response(404))
        with pytest.raises(httpx.HTTPStatusError):
            await get_book_meta(BOOK_ID)


# ── get_book_html paths ───────────────────────────────────────────────────────

async def test_get_book_html_returns_none_on_metadata_error():
    """If the metadata request fails, get_book_html should return None."""
    with respx.mock:
        respx.get(META_URL).mock(side_effect=httpx.ConnectError("fail"))
        result = await get_book_html(BOOK_ID)
    assert result is None


async def test_get_book_html_returns_none_when_no_html_format():
    """If no text/html format is present, return None."""
    book_meta = {**RAW_BOOK, "formats": {"text/plain; charset=utf-8": "https://example.com/book.txt"}}
    with respx.mock:
        respx.get(META_URL).mock(return_value=httpx.Response(200, json=book_meta))
        result = await get_book_html(BOOK_ID)
    assert result is None


async def test_get_book_html_prefers_url_with_images():
    """When both a plain html URL and an images-URL exist, the images one is preferred."""
    html_images_url = "https://www.gutenberg.org/files/1342/1342-h/1342-h.htm"
    html_plain_url = "https://www.gutenberg.org/ebooks/1342.html.utf8"
    book_meta = {
        **RAW_BOOK,
        "formats": {
            "text/html": html_plain_url,
            "text/html; charset=utf-8": html_images_url,
        },
    }
    # Override the URL check by putting "images" in the images url
    html_images_url_with_images = "https://www.gutenberg.org/files/1342/1342-h/images/1342-h.htm"
    book_meta["formats"]["text/html; charset=utf-8"] = html_images_url_with_images

    with respx.mock:
        respx.get(META_URL).mock(return_value=httpx.Response(200, json=book_meta))
        respx.get(html_images_url_with_images).mock(
            return_value=httpx.Response(200, text="<html>HTML with images</html>")
        )
        result = await get_book_html(BOOK_ID)

    assert result == "<html>HTML with images</html>"


async def test_get_book_html_falls_back_to_plain_html():
    """When no images URL exists, falls back to any text/html format."""
    html_plain_url = "https://www.gutenberg.org/ebooks/1342.html.utf8"
    book_meta = {**RAW_BOOK, "formats": {"text/html": html_plain_url}}

    with respx.mock:
        respx.get(META_URL).mock(return_value=httpx.Response(200, json=book_meta))
        respx.get(html_plain_url).mock(
            return_value=httpx.Response(200, text="<html>Plain HTML</html>")
        )
        result = await get_book_html(BOOK_ID)

    assert result == "<html>Plain HTML</html>"


async def test_get_book_html_returns_none_on_download_error():
    """If the HTML download itself throws an exception, return None."""
    html_url = "https://www.gutenberg.org/ebooks/1342.html.utf8"
    book_meta = {**RAW_BOOK, "formats": {"text/html": html_url}}

    with respx.mock:
        respx.get(META_URL).mock(return_value=httpx.Response(200, json=book_meta))
        respx.get(html_url).mock(side_effect=httpx.ConnectError("network fail"))
        result = await get_book_html(BOOK_ID)

    assert result is None


async def test_get_book_html_returns_none_on_non_200_download():
    """If the HTML download returns a non-200 status, return None."""
    html_url = "https://www.gutenberg.org/ebooks/1342.html.utf8"
    book_meta = {**RAW_BOOK, "formats": {"text/html": html_url}}

    with respx.mock:
        respx.get(META_URL).mock(return_value=httpx.Response(200, json=book_meta))
        respx.get(html_url).mock(return_value=httpx.Response(404))
        result = await get_book_html(BOOK_ID)

    assert result is None


# ── get_book_text API URL path ─────────────────────────────────────────────────

async def test_get_book_text_uses_api_provided_url():
    """When the Gutendex API provides a text URL, it should be tried first."""
    api_text_url = "https://www.gutenberg.org/ebooks/1342.txt.utf-8"
    with respx.mock:
        respx.get(META_URL).mock(return_value=httpx.Response(200, json=RAW_BOOK))
        respx.get(api_text_url).mock(return_value=httpx.Response(200, text="Book text from API."))
        result = await get_book_text(BOOK_ID)

    assert result == "Book text from API."


async def test_get_book_text_api_url_fails_falls_back():
    """If the API-provided URL returns non-200, fall back to pattern URLs."""
    api_text_url = "https://www.gutenberg.org/ebooks/1342.txt.utf-8"
    fallback_url = f"https://www.gutenberg.org/files/{BOOK_ID}/{BOOK_ID}-0.txt"

    with respx.mock:
        respx.get(META_URL).mock(return_value=httpx.Response(200, json=RAW_BOOK))
        respx.get(api_text_url).mock(return_value=httpx.Response(404))
        respx.get(fallback_url).mock(return_value=httpx.Response(200, text="Fallback text."))
        # Mock remaining fallback URLs
        respx.get(f"https://www.gutenberg.org/files/{BOOK_ID}/{BOOK_ID}.txt").mock(
            return_value=httpx.Response(404)
        )
        respx.get(f"https://www.gutenberg.org/cache/epub/{BOOK_ID}/pg{BOOK_ID}.txt").mock(
            return_value=httpx.Response(404)
        )
        result = await get_book_text(BOOK_ID)

    assert result == "Fallback text."


async def test_get_book_text_exception_during_url_fetch_continues():
    """An exception while fetching a fallback URL should be swallowed and the next tried."""
    fallback_url_0 = f"https://www.gutenberg.org/files/{BOOK_ID}/{BOOK_ID}-0.txt"
    fallback_url_1 = f"https://www.gutenberg.org/files/{BOOK_ID}/{BOOK_ID}.txt"
    fallback_url_cache = f"https://www.gutenberg.org/cache/epub/{BOOK_ID}/pg{BOOK_ID}.txt"

    with respx.mock:
        # Make get_book_meta fail so we skip API URL
        respx.get(META_URL).mock(side_effect=httpx.ConnectError("meta fail"))
        # First fallback throws an exception
        respx.get(fallback_url_0).mock(side_effect=httpx.ConnectError("network fail"))
        # Second fallback returns 404
        respx.get(fallback_url_1).mock(return_value=httpx.Response(404))
        # Third fallback succeeds
        respx.get(fallback_url_cache).mock(return_value=httpx.Response(200, text="Cache text."))

        result = await get_book_text(BOOK_ID)

    assert result == "Cache text."
