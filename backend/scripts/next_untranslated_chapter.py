#!/usr/bin/env python3
"""Print the next (chapter_index, paragraphs_json) for book 1342 → zh
that has no cached translation yet. Used by the self-paced translation
loop so each tick can pick up where the previous one left off.

Prints one JSON object per line to stdout. Exits with code 0 and
prints `{"done": true}` when every chapter is translated.

Usage:
    PYTHONPATH=backend backend/venv/bin/python \\
        backend/scripts/next_untranslated_chapter.py --book-id 1342 --lang zh
"""
import argparse
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.book_chapters import split_with_html_preference  # noqa: E402
from services.db import get_cached_book, get_cached_translation, init_db  # noqa: E402


async def run(book_id: int, lang: str, count: int) -> None:
    await init_db()
    book = await get_cached_book(book_id)
    if not book or not book.get("text"):
        print(json.dumps({"error": f"book {book_id} not cached"}))
        sys.exit(2)

    chapters = await split_with_html_preference(book_id, book["text"])
    found = 0
    total_translated = 0
    for idx, ch in enumerate(chapters):
        if await get_cached_translation(book_id, idx, lang):
            total_translated += 1
            continue
        if not ch.text.strip():
            continue
        if found >= count:
            break
        paragraphs = [p for p in ch.text.split("\n\n") if p.strip()]
        print(json.dumps({
            "book_id": book_id,
            "chapter_index": idx,
            "target_language": lang,
            "title": ch.title,
            "paragraphs": paragraphs,
            "paragraph_count": len(paragraphs),
            "word_count": sum(len(p.split()) for p in paragraphs),
        }, ensure_ascii=False))
        found += 1

    summary = {
        "done": found == 0,
        "translated_so_far": total_translated,
        "total_chapters": len(chapters),
        "returned": found,
    }
    print(json.dumps(summary, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--book-id", type=int, required=True)
    parser.add_argument("--lang", required=True)
    parser.add_argument(
        "--count", type=int, default=2,
        help="How many not-yet-translated chapters to print (default 2).",
    )
    args = parser.parse_args()
    asyncio.run(run(args.book_id, args.lang, args.count))


if __name__ == "__main__":
    main()
