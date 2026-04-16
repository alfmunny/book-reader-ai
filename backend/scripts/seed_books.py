#!/usr/bin/env python3
"""
Seed the database with popular Project Gutenberg books.

Downloads the top N books (by download count) for each language and caches
them in the local SQLite database. Idempotent — skips books already cached.

Usage:
    python scripts/seed_books.py                    # default: 100 books, en+de+fr
    python scripts/seed_books.py --count 50         # fewer books
    python scripts/seed_books.py --languages en,de  # specific languages
    python scripts/seed_books.py --dry-run           # just list, don't download

On Railway:
    railway run python scripts/seed_books.py
"""

import argparse
import asyncio
import json
import os
import sys

# Add the backend directory to the Python path so we can import services
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from services.db import init_db, get_cached_book, save_book, DB_PATH


GUTENDEX_API = "https://gutendex.com/books"
DEFAULT_LANGUAGES = ["en", "de", "fr"]
DEFAULT_COUNT = 100  # total across all languages


def _get_text_url(formats: dict) -> str:
    """Extract the plain-text download URL from Gutendex formats."""
    for key, url in formats.items():
        if key.startswith("text/plain"):
            return url
    return ""


async def fetch_popular(language: str, count: int) -> list[dict]:
    """Fetch the top `count` most-downloaded books for a language from Gutendex."""
    books = []
    page = 1
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        while len(books) < count:
            params = {
                "languages": language,
                "sort": "popular",
                "page": page,
            }
            try:
                resp = await client.get(GUTENDEX_API, params=params)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                print(f"  ⚠ Failed to fetch page {page} for {language}: {e}")
                break

            results = data.get("results", [])
            if not results:
                break

            for book in results:
                text_url = _get_text_url(book.get("formats", {}))
                if not text_url:
                    continue  # skip books without plain text
                cover = book.get("formats", {}).get("image/jpeg", "")
                books.append({
                    "id": book["id"],
                    "title": book.get("title", "Unknown"),
                    "authors": [a["name"] for a in book.get("authors", [])],
                    "languages": book.get("languages", []),
                    "subjects": book.get("subjects", [])[:5],
                    "download_count": book.get("download_count", 0),
                    "cover": cover,
                    "text_url": text_url,
                })
                if len(books) >= count:
                    break

            if not data.get("next"):
                break
            page += 1

    return books


async def download_book_text(text_url: str) -> str:
    """Download the plain-text content of a book."""
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(text_url)
        resp.raise_for_status()
        return resp.text.replace("\r\n", "\n").replace("\r", "\n")


async def seed(languages: list[str], total_count: int, dry_run: bool = False):
    """Main seed function."""
    await init_db()

    per_lang = max(1, total_count // len(languages))
    all_books: list[dict] = []

    print(f"Fetching top {per_lang} books per language ({', '.join(languages)})…\n")

    for lang in languages:
        print(f"── {lang.upper()} ──")
        books = await fetch_popular(lang, per_lang)
        print(f"  Found {len(books)} books with plain text")
        all_books.extend(books)

    # Deduplicate by ID (some books appear in multiple languages)
    seen = set()
    unique = []
    for b in all_books:
        if b["id"] not in seen:
            seen.add(b["id"])
            unique.append(b)
    all_books = unique[:total_count]

    print(f"\n{len(all_books)} unique books to process.\n")

    if dry_run:
        for i, b in enumerate(all_books, 1):
            lang = ",".join(b["languages"])
            print(f"  {i:3d}. [{lang}] {b['title']} — {', '.join(b['authors'])} (downloads: {b['download_count']:,})")
        print(f"\n(dry run — nothing downloaded)")
        return all_books

    downloaded = 0
    skipped = 0
    failed = 0

    for i, b in enumerate(all_books, 1):
        # Skip if already cached
        cached = await get_cached_book(b["id"])
        if cached and cached.get("text"):
            skipped += 1
            print(f"  [{i:3d}/{len(all_books)}] ✓ Already cached: {b['title']}")
            continue

        # Download
        try:
            print(f"  [{i:3d}/{len(all_books)}] ↓ Downloading: {b['title']}…", end="", flush=True)
            text = await download_book_text(b["text_url"])
            meta = {k: v for k, v in b.items() if k != "text_url"}
            await save_book(b["id"], meta, text)
            downloaded += 1
            print(f" ({len(text):,} chars)")

            # Brief pause to be polite to Gutenberg's servers
            await asyncio.sleep(0.5)
        except Exception as e:
            failed += 1
            print(f" FAILED: {e}")

    print(f"\nDone! Downloaded: {downloaded}, Skipped (cached): {skipped}, Failed: {failed}")
    print(f"DB path: {DB_PATH}")
    return all_books


def main():
    parser = argparse.ArgumentParser(description="Seed the database with popular Gutenberg books")
    parser.add_argument("--count", type=int, default=DEFAULT_COUNT,
                        help=f"Total number of books to seed (default: {DEFAULT_COUNT})")
    parser.add_argument("--languages", type=str, default=",".join(DEFAULT_LANGUAGES),
                        help=f"Comma-separated language codes (default: {','.join(DEFAULT_LANGUAGES)})")
    parser.add_argument("--dry-run", action="store_true",
                        help="Just list the books without downloading")
    parser.add_argument("--append", action="store_true",
                        help="Merge into the existing popular_books.json (keep old entries, "
                             "add new ones by ID). Default behaviour replaces the manifest.")
    args = parser.parse_args()

    languages = [l.strip() for l in args.languages.split(",")]
    books = asyncio.run(seed(languages, args.count, args.dry_run))

    # In dry-run mode, don't touch the manifest file
    if args.dry_run:
        return

    # Write a JSON manifest for the frontend "Popular Books" page
    manifest_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "popular_books.json")
    new_entries = [
        {
            "id": b["id"],
            "title": b["title"],
            "authors": b["authors"],
            "languages": b["languages"],
            "download_count": b["download_count"],
            "cover": b.get("cover", ""),
        }
        for b in books
    ]

    if args.append and os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            existing = json.load(f)
        by_id: dict[int, dict] = {b["id"]: b for b in existing}
        for entry in new_entries:
            by_id[entry["id"]] = entry   # overwrite if duplicate ID
        manifest = list(by_id.values())
        # Keep popularity ordering across the merged set
        manifest.sort(key=lambda x: x.get("download_count", 0), reverse=True)
    else:
        manifest = new_entries

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"Manifest written to {manifest_path} ({len(manifest)} books)")


if __name__ == "__main__":
    main()
