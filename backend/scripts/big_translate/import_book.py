#!/usr/bin/env python3
"""Fetch a Gutenberg book's metadata + plain text and save it to the
local DB via `save_book`. Called by the multi-book driver when the
next book in state.json isn't cached locally yet.

Usage:
    PYTHONPATH=backend backend/venv/bin/python \\
        backend/scripts/big_translate/import_book.py --book-id 84
"""
import argparse
import asyncio
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, BACKEND)

from services.db import get_cached_book, init_db, save_book  # noqa: E402
from services.gutenberg import get_book_meta, get_book_text  # noqa: E402


async def run(book_id: int) -> None:
    await init_db()
    existing = await get_cached_book(book_id)
    if existing and existing.get("text"):
        print(f"book {book_id} already cached: {existing.get('title')!r}")
        return
    meta = await get_book_meta(book_id)
    text = await get_book_text(book_id)
    await save_book(book_id, meta, text)
    print(f"imported book {book_id}: {meta.get('title')!r} ({len(text)} chars)")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--book-id", type=int, required=True)
    args = parser.parse_args()
    asyncio.run(run(args.book_id))
    return 0


if __name__ == "__main__":
    sys.exit(main())
