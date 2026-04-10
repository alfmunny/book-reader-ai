import os
import httpx

YOUTUBE_API = "https://www.googleapis.com/youtube/v3/search"


async def search_videos(query: str, max_results: int = 5) -> list[dict]:
    api_key = os.environ.get("YOUTUBE_API_KEY", "")
    if not api_key:
        return []
    params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": max_results,
        "key": api_key,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(YOUTUBE_API, params=params)
        resp.raise_for_status()
        data = resp.json()
    results = []
    for item in data.get("items", []):
        vid_id = item["id"]["videoId"]
        snippet = item["snippet"]
        results.append(
            {
                "id": vid_id,
                "title": snippet["title"],
                "channel": snippet["channelTitle"],
                "thumbnail": snippet["thumbnails"]["medium"]["url"],
                "url": f"https://www.youtube.com/watch?v={vid_id}",
            }
        )
    return results
