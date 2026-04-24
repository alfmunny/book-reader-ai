"""Backfill stored EPUBs for Gutenberg books that don't have one yet.

Motivation
----------
The EPUB audit (`scripts/epub_split_audit.py`, #832 + #839) only scans books
with a row in `book_epubs`. As of 2026-04-24, 1 of 122 Gutenberg books has a
stored EPUB — the rest won't contribute signal until someone opens them in
the reader and `_background_fetch_epub` fires.

This script iterates Gutenberg books with no stored EPUB, fetches the
no-images edition via `services.gutenberg.get_book_epub`, and persists it
via `services.db.save_book_epub`. Books where Gutenberg has no EPUB at all
are skipped silently.

Usage
-----
    python -m scripts.backfill_epubs                 # all missing books
    python -m scripts.backfill_epubs --limit 20      # cap to first 20
    python -m scripts.backfill_epubs --delay 2.0     # sleep between fetches
    python -m scripts.backfill_epubs --dry-run       # log only, no writes

Exits 0 on success.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time

import aiosqlite

# Import the db module so tests can monkeypatch DB_PATH after module load.
import services.db as _db_module
from services.db import list_cached_books, save_book_epub
from services.gutenberg import get_book_epub


DEFAULT_DELAY = 1.5  # seconds between fetches — be polite to gutenberg.org


async def list_books_missing_epub() -> list[dict]:
    all_books = await list_cached_books()
    missing: list[dict] = []
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        async with db.execute("SELECT book_id FROM book_epubs") as cur:
            have = {r[0] for r in await cur.fetchall()}
    for b in all_books:
        if b["id"] not in have:
            missing.append(b)
    return missing


async def backfill(
    limit: int | None = None,
    delay: float = DEFAULT_DELAY,
    dry_run: bool = False,
) -> tuple[int, int, int]:
    """Returns (fetched, missing_upstream, errored)."""
    books = await list_books_missing_epub()
    if limit is not None:
        books = books[:limit]

    print(f"Backfilling EPUBs for {len(books)} book(s). delay={delay}s dry_run={dry_run}")

    fetched = 0
    missing_upstream = 0
    errored = 0

    for i, book in enumerate(books, 1):
        bid = book["id"]
        title = (book.get("title") or "")[:60]
        prefix = f"[{i}/{len(books)}] book {bid} — {title}"
        try:
            result = await get_book_epub(bid)
        except Exception as e:  # noqa: BLE001
            print(f"{prefix}: ERROR fetching: {e}")
            errored += 1
            continue

        if result is None:
            print(f"{prefix}: no EPUB available upstream")
            missing_upstream += 1
        else:
            epub_bytes, epub_url = result
            kb = len(epub_bytes) // 1024
            if dry_run:
                print(f"{prefix}: would save {kb} KB from {epub_url}")
            else:
                await save_book_epub(bid, epub_bytes, epub_url)
                print(f"{prefix}: saved {kb} KB from {epub_url}")
            fetched += 1

        if i < len(books) and delay > 0:
            time.sleep(delay)

    return fetched, missing_upstream, errored


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Backfill stored EPUBs for Gutenberg books that don't have one.",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Cap the number of books to process (default: all missing).",
    )
    parser.add_argument(
        "--delay", type=float, default=DEFAULT_DELAY,
        help=f"Delay (seconds) between fetches (default: {DEFAULT_DELAY}).",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Fetch and report sizes, but don't write to the DB.",
    )
    args = parser.parse_args(argv)

    fetched, missing_upstream, errored = asyncio.run(
        backfill(limit=args.limit, delay=args.delay, dry_run=args.dry_run)
    )

    print()
    print(f"Fetched from Gutenberg: {fetched}")
    print(f"No EPUB upstream:       {missing_upstream}")
    print(f"Errors:                 {errored}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
