import httpx

GUTENBERG_SEARCH = "https://gutendex.com/books"
GUTENBERG_BASE = "https://www.gutenberg.org"


async def search_books(query: str, language: str = "", page: int = 1) -> dict:
    """Search Gutendex with one automatic retry on timeout/server-error."""
    params = {"search": query, "page": page}
    if language:
        params["languages"] = language

    last_error: Exception | None = None
    for attempt in range(2):  # 1 initial + 1 retry
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(GUTENBERG_SEARCH, params=params)
                resp.raise_for_status()
                data = resp.json()
            results = []
            for book in data.get("results", []):
                meta = _format_book_meta(book)
                # Only include books that have a plain text version available.
                # Audio-only, image-only, or non-text books are filtered out.
                if meta["has_text"]:
                    results.append(meta)
            return {"count": len(results), "books": results}
        except httpx.TimeoutException as e:
            last_error = e
            if attempt == 0:
                import asyncio
                await asyncio.sleep(2)
        except httpx.HTTPStatusError as e:
            if e.response.status_code >= 500 and attempt == 0:
                last_error = e
                import asyncio
                await asyncio.sleep(2)
            else:
                raise ValueError(f"Gutenberg search failed: {e.response.status_code}")
        except httpx.ConnectError as e:
            last_error = e
            if attempt == 0:
                import asyncio
                await asyncio.sleep(2)

    if isinstance(last_error, httpx.TimeoutException):
        raise ValueError("Gutenberg search timed out. Please try again.")
    raise ValueError(f"Gutenberg search failed: {last_error}")


async def get_book_meta(book_id: int) -> dict:
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(f"{GUTENBERG_SEARCH}/{book_id}")
        resp.raise_for_status()
        book = resp.json()
    return _format_book_meta(book)


async def get_book_html(book_id: int) -> str | None:
    """Download the HTML edition of a Gutenberg book, if available.

    Returns None if the book has no HTML format. HTML editions have explicit
    `<div class="chapter">` markup which is much more reliable than regex on
    plain text (see services.splitter.build_chapters_from_html).
    """
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(f"{GUTENBERG_SEARCH}/{book_id}")
            resp.raise_for_status()
            formats = resp.json().get("formats", {})
    except Exception:
        return None

    html_url = ""
    for key, url in formats.items():
        if key.startswith("text/html") and "images" in url:
            html_url = url
            break
    if not html_url:
        for key, url in formats.items():
            if key.startswith("text/html"):
                html_url = url
                break
    if not html_url:
        return None

    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            resp = await client.get(html_url)
            if resp.status_code == 200:
                return resp.text
    except Exception:
        return None
    return None


async def get_book_text(book_id: int) -> str:
    """Download the plain-text version of a Gutenberg book.

    Strategy:
    1. Ask the Gutendex API for the book's text/plain URL (most reliable)
    2. Fall back to well-known URL patterns if the API doesn't provide one
    """
    # Try the API-provided text URL first (most reliable)
    try:
        meta = await get_book_meta(book_id)
        api_url = meta.get("text_url", "")
        if api_url:
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                resp = await client.get(api_url)
                if resp.status_code == 200:
                    return resp.text.replace('\r\n', '\n').replace('\r', '\n')
    except Exception:
        pass  # fall through to the pattern-based approach

    # Fallback: try well-known Gutenberg URL patterns
    urls = [
        f"https://www.gutenberg.org/files/{book_id}/{book_id}-0.txt",
        f"https://www.gutenberg.org/files/{book_id}/{book_id}.txt",
        f"https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.txt",
    ]
    last_error = ""
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        for url in urls:
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return resp.text.replace('\r\n', '\n').replace('\r', '\n')
                last_error = f"HTTP {resp.status_code} for {url}"
            except Exception as e:
                last_error = f"{type(e).__name__} fetching {url}: {e}"
                continue
    raise ValueError(f"Could not fetch text for book {book_id}. Last error: {last_error}")


def _get_text_url(formats: dict) -> str:
    """Extract the plain-text download URL from Gutendex formats, or ''."""
    # Gutendex uses MIME keys like "text/plain; charset=utf-8" or "text/plain"
    for key, url in formats.items():
        if key.startswith("text/plain"):
            return url
    return ""


def _format_book_meta(book: dict) -> dict:
    formats = book.get("formats", {})
    cover = formats.get("image/jpeg", "")
    text_url = _get_text_url(formats)
    return {
        "id": book["id"],
        "title": book.get("title", "Unknown"),
        "authors": [a["name"] for a in book.get("authors", [])],
        "languages": book.get("languages", []),
        "subjects": book.get("subjects", [])[:5],
        "download_count": book.get("download_count", 0),
        "cover": cover,
        "has_text": bool(text_url),
        "text_url": text_url,
    }
