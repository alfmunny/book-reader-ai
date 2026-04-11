"""LibriVox public API client."""
import httpx

LIBRIVOX_API = "https://librivox.org/api/feed/audiobooks"


def _format(b: dict) -> dict:
    sections = b.get("sections") or []
    authors = b.get("authors") or []
    return {
        "id": b.get("id", ""),
        "title": b.get("title", ""),
        "authors": [
            f"{a.get('first_name', '')} {a.get('last_name', '')}".strip()
            for a in authors
        ],
        "url_librivox": b.get("url_librivox", ""),
        "url_rss": b.get("url_rss", ""),
        "sections": [
            {
                "number": int(s.get("section_number", i + 1)),
                "title": (s.get("title") or "").strip(),
                "duration": s.get("duration", ""),
                "url": s.get("listen_url", ""),
            }
            for i, s in enumerate(sections)
            if s.get("listen_url")
        ],
    }


async def search_audiobooks(title: str, author: str = "") -> list[dict]:
    """Search LibriVox by title (and optional author). Returns up to 10 results with sections."""
    params: dict = {"format": "json", "extended": "1", "limit": "10"}
    if title:
        params["title"] = title
    if author:
        params["author"] = author

    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        resp = await client.get(LIBRIVOX_API, params=params)
        resp.raise_for_status()
        data = resp.json()

    books = data.get("books") or []
    if isinstance(books, str):
        # LibriVox returns the string "false" when nothing found
        return []
    return [_format(b) for b in books]


async def get_audiobook(librivox_id: str) -> dict | None:
    """Fetch a single audiobook by its LibriVox ID."""
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        resp = await client.get(
            LIBRIVOX_API, params={"id": librivox_id, "format": "json", "extended": "1"}
        )
        resp.raise_for_status()
        data = resp.json()

    books = data.get("books") or []
    if not books or isinstance(books, str):
        return None
    return _format(books[0])
