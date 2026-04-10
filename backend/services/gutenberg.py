import httpx
from bs4 import BeautifulSoup
from typing import Optional

GUTENBERG_SEARCH = "https://gutendex.com/books"
GUTENBERG_BASE = "https://www.gutenberg.org"


async def search_books(query: str, language: str = "", page: int = 1) -> dict:
    params = {"search": query, "page": page}
    if language:
        params["languages"] = language
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(GUTENBERG_SEARCH, params=params)
        resp.raise_for_status()
        data = resp.json()
    results = []
    for book in data.get("results", []):
        results.append(_format_book_meta(book))
    return {"count": data.get("count", 0), "books": results}


async def get_book_meta(book_id: int) -> dict:
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(f"{GUTENBERG_SEARCH}/{book_id}")
        resp.raise_for_status()
        book = resp.json()
    return _format_book_meta(book)


async def get_book_text(book_id: int) -> str:
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
                    # Normalize line endings so regex patterns work consistently
                    return resp.text.replace('\r\n', '\n').replace('\r', '\n')
                last_error = f"HTTP {resp.status_code} for {url}"
            except Exception as e:
                last_error = f"{type(e).__name__} fetching {url}: {e}"
                continue
    raise ValueError(f"Could not fetch text for book {book_id}. Last error: {last_error}")


def _format_book_meta(book: dict) -> dict:
    formats = book.get("formats", {})
    cover = formats.get("image/jpeg", "")
    return {
        "id": book["id"],
        "title": book.get("title", "Unknown"),
        "authors": [a["name"] for a in book.get("authors", [])],
        "languages": book.get("languages", []),
        "subjects": book.get("subjects", [])[:5],
        "download_count": book.get("download_count", 0),
        "cover": cover,
    }
