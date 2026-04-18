#!/usr/bin/env python3
"""Generic multi-book batch saver. Reads a JSON file like:

    [
      {"book_id": 1342, "chapter_index": 17,
       "target_language": "zh",
       "paragraphs": ["…", "…"]},
      …
    ]

and writes each row via `save_translation`, validating that the
translated paragraph count matches the source's paragraph count under
the same splitter the reader uses. A mismatched chapter is skipped
(stderr warning) — nothing stops the batch.

Usage:
    PYTHONPATH=backend backend/venv/bin/python \\
        backend/scripts/big_translate/save_batch.py /tmp/batch.json
"""
import asyncio
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, BACKEND)

from services.book_chapters import split_with_html_preference  # noqa: E402
from services.db import get_cached_book, init_db, save_translation  # noqa: E402


async def run(path: str) -> None:
    await init_db()
    entries = json.loads(open(path).read())
    book_cache: dict[int, list] = {}
    saved = 0
    for entry in entries:
        bid = entry["book_id"]
        idx = entry["chapter_index"]
        lang = entry["target_language"]
        translated = entry["paragraphs"]
        if bid not in book_cache:
            book = await get_cached_book(bid)
            book_cache[bid] = await split_with_html_preference(bid, book["text"])
        chapters = book_cache[bid]
        src = [p for p in chapters[idx].text.split("\n\n") if p.strip()]
        if len(src) != len(translated):
            print(
                f"book {bid} ch {idx + 1}: paragraph count mismatch "
                f"(source={len(src)} translated={len(translated)}) — SKIP",
                file=sys.stderr,
            )
            continue
        await save_translation(
            bid, idx, lang, translated,
            provider=entry.get("provider", "claude-code"),
            model=entry.get("model", "claude-opus-4-7"),
            title_translation=entry.get("title_translation"),
        )
        tt = entry.get("title_translation")
        tt_note = f" title={tt!r}" if tt else ""
        print(f"book {bid} ch {idx + 1}: saved {len(translated)} paragraphs{tt_note}")
        saved += 1
    print(f"\n{saved} chapters saved total")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: save_batch.py <batch.json>", file=sys.stderr)
        sys.exit(2)
    asyncio.run(run(sys.argv[1]))
