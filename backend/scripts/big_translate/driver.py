#!/usr/bin/env python3
"""Multi-book translation driver.

Each /loop tick runs this once. It prints one JSON object to stdout
telling the loop what to do this tick:

- action="translate": the loop should translate the provided chapters
  and save them via save_batch.py. Payload:
    {
      "action": "translate",
      "book_id": int, "title": str,
      "source_lang": str, "target_lang": str,
      "chapters": [{chapter_index, paragraphs, paragraph_count, word_count}, ...]
    }

- action="finalize": the loop should run finalize.py for this book,
  which exports + commits + pushes + seeds prod. Payload:
    {"action": "finalize", "book_id": int, "target_lang": str}

- action="import_book": the next book is in the top-100 list but not
  in the local DB. Loop runs `import_book.py --book-id N`. Payload:
    {"action": "import_book", "book_id": int, "title": str}

- action="all_done": every book in state.json is done. Loop should
  stop and tell the user.

State transitions are persisted to state.json on every call.
"""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent.parent
sys.path.insert(0, str(BACKEND))

from services.book_chapters import split_with_html_preference  # noqa: E402
from services.db import get_cached_book, get_cached_translation, init_db  # noqa: E402


STATE_PATH = HERE / "state.json"


def load_state() -> dict:
    return json.loads(STATE_PATH.read_text())


def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2))


def pick_target_lang(source_lang: str | None) -> str:
    """Chinese books translate to English; everything else to Chinese.
    User rule. If source unknown, assume English → Chinese."""
    if (source_lang or "").lower().startswith("zh"):
        return "en"
    return "zh"


async def _current_book_status(book_entry: dict) -> tuple[list, int, int]:
    """Return (chapters, translated_count, total) for a book. Requires
    the book to already be in the local DB."""
    bid = book_entry["id"]
    book = await get_cached_book(bid)
    if not book or not book.get("text"):
        raise RuntimeError(f"book {bid} not in local DB")

    # Infer source lang if state didn't have it.
    if not book_entry.get("source_lang"):
        book_entry["source_lang"] = (book.get("languages") or ["en"])[0]
    if not book_entry.get("target_lang"):
        book_entry["target_lang"] = pick_target_lang(book_entry["source_lang"])

    chapters = await split_with_html_preference(bid, book["text"])
    translated = 0
    for idx, ch in enumerate(chapters):
        if not ch.text.strip():
            continue
        if await get_cached_translation(bid, idx, book_entry["target_lang"]):
            translated += 1
    total = sum(1 for ch in chapters if ch.text.strip())
    return chapters, translated, total


async def run(count: int) -> dict:
    await init_db()
    state = load_state()
    books = state["books"]

    # 1. If a book is in_progress → dispense chapters OR finalize.
    for b in books:
        if b.get("status") != "in_progress":
            continue

        bid = b["id"]
        cached = await get_cached_book(bid)
        if not cached or not cached.get("text"):
            # In-progress but not imported — recover by requesting import.
            return {"action": "import_book", "book_id": bid, "title": b.get("title", "")}

        chapters, done, total = await _current_book_status(b)
        save_state(state)  # persist any inferred source/target lang

        # If fully translated, finalize.
        if done >= total and total > 0:
            return {
                "action": "finalize",
                "book_id": bid,
                "target_lang": b["target_lang"],
            }

        # Otherwise dispense the next N untranslated chapters.
        out_chapters = []
        for idx, ch in enumerate(chapters):
            if not ch.text.strip():
                continue
            if await get_cached_translation(bid, idx, b["target_lang"]):
                continue
            paragraphs = [p for p in ch.text.split("\n\n") if p.strip()]
            out_chapters.append({
                "chapter_index": idx,
                "title": ch.title,
                "paragraphs": paragraphs,
                "paragraph_count": len(paragraphs),
                "word_count": sum(len(p.split()) for p in paragraphs),
            })
            if len(out_chapters) >= count:
                break

        return {
            "action": "translate",
            "book_id": bid,
            "title": b.get("title", ""),
            "source_lang": b["source_lang"],
            "target_lang": b["target_lang"],
            "chapters": out_chapters,
            "progress_done": done,
            "progress_total": total,
        }

    # 2. No in-progress book. Advance the next "pending" book.
    for b in books:
        if b.get("status") != "pending":
            continue
        bid = b["id"]
        cached = await get_cached_book(bid)
        if not cached or not cached.get("text"):
            # Need to import first. Loop handles it.
            return {"action": "import_book", "book_id": bid, "title": b.get("title", "")}
        # Imported — promote to in_progress and loop. Re-enter by
        # recursing: set status here and call run again.
        b["status"] = "in_progress"
        if not b.get("source_lang"):
            b["source_lang"] = (cached.get("languages") or ["en"])[0]
        if not b.get("target_lang"):
            b["target_lang"] = pick_target_lang(b["source_lang"])
        save_state(state)
        return await run(count)

    # 3. Everything done.
    return {"action": "all_done"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=2,
                        help="Max chapters to dispense per tick")
    args = parser.parse_args()
    result = asyncio.run(run(args.count))
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
