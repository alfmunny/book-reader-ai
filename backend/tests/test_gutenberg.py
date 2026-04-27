"""
Tests for services/gutenberg.py

All HTTP calls are mocked with respx.
"""

import pytest
import respx
import httpx
from services.gutenberg import search_books, get_book_meta, get_book_text, _format_book_meta


RAW_BOOK = {
    "id": 1342,
    "title": "Pride and Prejudice",
    "authors": [{"name": "Austen, Jane"}],
    "languages": ["en"],
    "subjects": ["Fiction", "Love stories", "England -- Fiction"],
    "download_count": 50000,
    "formats": {
        "image/jpeg": "https://covers.example.com/1342.jpg",
        "text/plain; charset=utf-8": "https://www.gutenberg.org/ebooks/1342.txt.utf-8",
    },
}


# ── _format_book_meta (pure function) ────────────────────────────────────────

def test_format_book_meta_basic():
    result = _format_book_meta(RAW_BOOK)
    assert result["id"] == 1342
    assert result["title"] == "Pride and Prejudice"
    assert result["authors"] == ["Austen, Jane"]
    assert result["languages"] == ["en"]
    assert result["cover"] == "https://covers.example.com/1342.jpg"


def test_format_book_meta_caps_subjects_at_5():
    book = {**RAW_BOOK, "subjects": [f"Subject {i}" for i in range(10)]}
    result = _format_book_meta(book)
    assert len(result["subjects"]) == 5


def test_format_book_meta_missing_cover():
    book = {**RAW_BOOK, "formats": {}}
    result = _format_book_meta(book)
    assert result["cover"] == ""


def test_format_book_meta_missing_optional_fields():
    result = _format_book_meta({"id": 1})
    assert result["title"] == "Unknown"
    assert result["authors"] == []
    assert result["download_count"] == 0


# ── search_books ──────────────────────────────────────────────────────────────

async def test_search_books_returns_results():
    payload = {"count": 1, "results": [RAW_BOOK]}
    with respx.mock:
        respx.get("https://gutendex.com/books").mock(return_value=httpx.Response(200, json=payload))
        result = await search_books("Pride")

    assert result["count"] == 1
    assert result["books"][0]["id"] == 1342


async def test_search_books_with_language():
    payload = {"count": 0, "results": []}
    with respx.mock:
        route = respx.get("https://gutendex.com/books").mock(return_value=httpx.Response(200, json=payload))
        await search_books("Pride", language="en")

    assert "languages=en" in str(route.calls[0].request.url) or \
           route.calls[0].request.url.params.get("languages") == "en"


async def test_search_books_empty_results():
    with respx.mock:
        respx.get("https://gutendex.com/books").mock(return_value=httpx.Response(200, json={"count": 0, "results": []}))
        result = await search_books("nonexistent xyz")

    assert result["count"] == 0
    assert result["books"] == []


# ── get_book_meta ─────────────────────────────────────────────────────────────

async def test_get_book_meta_returns_formatted_book():
    with respx.mock:
        respx.get("https://gutendex.com/books/1342").mock(return_value=httpx.Response(200, json=RAW_BOOK))
        result = await get_book_meta(1342)

    assert result["id"] == 1342
    assert result["title"] == "Pride and Prejudice"


# ── get_book_text ─────────────────────────────────────────────────────────────

async def test_get_book_text_first_url_succeeds():
    with respx.mock:
        respx.get("https://www.gutenberg.org/files/1342/1342-0.txt").mock(
            return_value=httpx.Response(200, text="Book text here.")
        )
        result = await get_book_text(1342)

    assert result == "Book text here."


async def test_get_book_text_falls_back_to_second_url():
    with respx.mock:
        respx.get("https://www.gutenberg.org/files/1342/1342-0.txt").mock(
            return_value=httpx.Response(404)
        )
        respx.get("https://www.gutenberg.org/files/1342/1342.txt").mock(
            return_value=httpx.Response(200, text="Fallback text.")
        )
        result = await get_book_text(1342)

    assert result == "Fallback text."


async def test_get_book_text_falls_back_to_cache_url():
    with respx.mock:
        respx.get("https://www.gutenberg.org/files/1342/1342-0.txt").mock(return_value=httpx.Response(404))
        respx.get("https://www.gutenberg.org/files/1342/1342.txt").mock(return_value=httpx.Response(404))
        respx.get("https://www.gutenberg.org/cache/epub/1342/pg1342.txt").mock(
            return_value=httpx.Response(200, text="Cache text.")
        )
        result = await get_book_text(1342)

    assert result == "Cache text."


async def test_get_book_text_all_urls_fail_raises():
    with respx.mock:
        respx.get("https://www.gutenberg.org/files/1342/1342-0.txt").mock(return_value=httpx.Response(404))
        respx.get("https://www.gutenberg.org/files/1342/1342.txt").mock(return_value=httpx.Response(404))
        respx.get("https://www.gutenberg.org/cache/epub/1342/pg1342.txt").mock(return_value=httpx.Response(404))

        with pytest.raises(ValueError, match="Could not fetch text"):
            await get_book_text(1342)


async def test_get_book_text_normalizes_line_endings():
    with respx.mock:
        respx.get("https://www.gutenberg.org/files/1342/1342-0.txt").mock(
            return_value=httpx.Response(200, text="Line1\r\nLine2\r\nLine3")
        )
        result = await get_book_text(1342)

    assert "\r" not in result
    assert result == "Line1\nLine2\nLine3"


# ── get_book_epub (issue #1615) ───────────────────────────────────────────────


async def test_get_book_epub_returns_noimages_epub():
    """Regression #1615: get_book_epub must prefer the noimages EPUB URL over
    any other EPUB format (lines 116-117: epub_url = url; break)."""
    from services.gutenberg import get_book_epub
    formats = {
        "application/epub+zip": "https://www.gutenberg.org/ebooks/1342.epub",
        "application/epub+zip; noimages": "https://www.gutenberg.org/ebooks/1342.epub.noimages",
    }
    with respx.mock:
        respx.get("https://gutendex.com/books/1342").mock(
            return_value=httpx.Response(200, json={"formats": formats})
        )
        respx.get("https://www.gutenberg.org/ebooks/1342.epub.noimages").mock(
            return_value=httpx.Response(200, content=b"epub-bytes")
        )
        result = await get_book_epub(1342)

    assert result is not None
    assert result[0] == b"epub-bytes"
    assert "noimages" in result[1]


async def test_get_book_epub_returns_none_when_no_epub_format():
    """Regression #1615: get_book_epub must return None when the formats dict
    has no EPUB key (line 122: return None)."""
    from services.gutenberg import get_book_epub
    with respx.mock:
        respx.get("https://gutendex.com/books/1342").mock(
            return_value=httpx.Response(200, json={"formats": {"text/plain": "https://example.com/1342.txt"}})
        )
        result = await get_book_epub(1342)

    assert result is None


async def test_get_book_epub_returns_none_on_metadata_fetch_error():
    """Regression #1615: get_book_epub must return None when the Gutendex API
    call raises (lines 109-110: except Exception: return None)."""
    from services.gutenberg import get_book_epub
    with respx.mock:
        respx.get("https://gutendex.com/books/1342").mock(side_effect=httpx.ConnectError("timeout"))
        result = await get_book_epub(1342)

    assert result is None


async def test_get_book_epub_returns_none_on_download_error():
    """Regression #1615: get_book_epub must return None when the EPUB download
    raises (lines 129-131: except Exception: return None)."""
    from services.gutenberg import get_book_epub
    with respx.mock:
        respx.get("https://gutendex.com/books/1342").mock(
            return_value=httpx.Response(200, json={
                "formats": {"application/epub+zip": "https://www.gutenberg.org/ebooks/1342.epub"}
            })
        )
        respx.get("https://www.gutenberg.org/ebooks/1342.epub").mock(
            side_effect=httpx.ConnectError("download failed")
        )
        result = await get_book_epub(1342)

    assert result is None


async def test_get_book_epub_returns_none_on_non_200_download():
    """Regression #1615: get_book_epub must return None when the EPUB download
    returns a non-200 status (line 131: return None after try block)."""
    from services.gutenberg import get_book_epub
    with respx.mock:
        respx.get("https://gutendex.com/books/1342").mock(
            return_value=httpx.Response(200, json={
                "formats": {"application/epub+zip": "https://www.gutenberg.org/ebooks/1342.epub"}
            })
        )
        respx.get("https://www.gutenberg.org/ebooks/1342.epub").mock(
            return_value=httpx.Response(404)
        )
        result = await get_book_epub(1342)

    assert result is None


async def test_get_book_text_uses_api_text_url_when_available():
    """Regression #1615: get_book_text must use the API-provided text_url fast
    path when get_book_meta returns a non-empty text_url (lines 145-149)."""
    from services.gutenberg import get_book_text
    api_text_url = "https://www.gutenberg.org/cache/epub/1342/pg1342.txt"
    meta_response = {
        "id": 1342,
        "title": "Pride and Prejudice",
        "authors": [{"name": "Austen, Jane"}],
        "languages": ["en"],
        "subjects": [],
        "download_count": 50000,
        "formats": {
            "text/plain; charset=utf-8": api_text_url,
            "image/jpeg": "https://covers.example.com/1342.jpg",
        },
    }
    with respx.mock:
        respx.get("https://gutendex.com/books/1342").mock(
            return_value=httpx.Response(200, json=meta_response)
        )
        respx.get(api_text_url).mock(
            return_value=httpx.Response(200, text="API fast path text.")
        )
        result = await get_book_text(1342)

    assert result == "API fast path text."


async def test_get_book_text_falls_back_when_api_text_url_empty():
    """Regression #1615: when metadata returns no text_url, get_book_text must
    fall through to the pattern-based fallback (branch 145->154 False branch)."""
    from services.gutenberg import get_book_text
    meta_response = {
        "id": 1342,
        "title": "Pride and Prejudice",
        "authors": [{"name": "Austen, Jane"}],
        "languages": ["en"],
        "subjects": [],
        "download_count": 50000,
        "formats": {"image/jpeg": "https://covers.example.com/1342.jpg"},
    }
    with respx.mock:
        respx.get("https://gutendex.com/books/1342").mock(
            return_value=httpx.Response(200, json=meta_response)
        )
        respx.get("https://www.gutenberg.org/files/1342/1342-0.txt").mock(
            return_value=httpx.Response(200, text="Fallback text.")
        )
        result = await get_book_text(1342)

    assert result == "Fallback text."


