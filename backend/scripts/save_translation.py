#!/usr/bin/env python3
"""Save an in-session literary translation to local DB and append to JSON backup.

Companion tool for in-session literary translation: when the assistant produces a
chapter translation directly in conversation (no API call to a model provider),
pipe the JSON entry to this script. It will:

    1. Write the row to the local `translations` table so the local reader serves
       it immediately on the next request.
    2. Append the entry to a JSON backup at
       `backend/data/translations/{book_id}_{target_language}.json` so the work
       survives DB wipes.

The backup is the durable record. Hard-coded chapter-cache invalidation
migrations (e.g. 029_invalidate_shifted_chapter_cache, 030_invalidate_chapter0_cache)
have wiped Faust translations once already; the JSON backup is what lets us
re-seed without paying for the work twice. The backup is also the input
for `scripts/seed_translations.py`, which pushes the rows to production.

End-to-end workflow for translating a new book/language:

    # 1. Dump source chapters via the splitter (one-time, ad hoc):
    DB_PATH=backend/books.db python -c "
        import asyncio, json
        from services.book_chapters import split_with_html_preference
        from services.db import get_cached_book
        async def m():
            b = await get_cached_book(BOOK_ID)
            chs = await split_with_html_preference(BOOK_ID, b['text'])
            json.dump([{'index': i, 'title': c.title, 'text': c.text}
                       for i, c in enumerate(chs)],
                      open('/tmp/src.json','w'), ensure_ascii=False, indent=2)
        asyncio.run(m())"

    # 2. For each chapter, the assistant produces translation in conversation
    #    and pipes a JSON entry through this script:
    echo '{"book_id":2229,"chapter_index":0,"target_language":"zh",
           "paragraphs":["..."],"provider":"anthropic",
           "model":"claude-opus-4-7 (in-session)",
           "title_translation":"献辞"}' \
      | python scripts/save_translation.py

    # 3. After all chapters are saved, push to prod:
    BACKEND_URL=... ADMIN_JWT=... python scripts/seed_translations.py \
        --file backend/data/translations/2229_zh.json

Required JSON fields (read from stdin):
    book_id          int          Gutenberg book ID
    chapter_index    int          0-based, must align with the live splitter
    target_language  str          e.g. "zh", "en", "fr" — short code, no region
    paragraphs       list[str]    one entry per source paragraph (\\n\\n-separated
                                  block); within a paragraph, \\n line breaks are
                                  preserved as-is — important for drama / verse

Optional JSON fields:
    provider           str        default "anthropic"
    model              str        default "claude-opus-4-7 (in-session)"
    title_translation  str | null translated chapter title (drives reader chrome)

Idempotency:
    Re-running with the same (book_id, chapter_index, target_language) replaces
    both the DB row (INSERT OR REPLACE) and the backup entry — safe to re-run.

Environment overrides:
    DB_PATH     Path to the sqlite DB the local backend serves
                (default: backend/books.db relative to this script).
    BACKUP_DIR  Path to the backup directory
                (default: backend/data/translations relative to this script).
"""

import asyncio
import json
import os
import sys
from pathlib import Path

# Make `services.*` importable when run as a script from anywhere.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.db import save_translation  # noqa: E402

REQUIRED_FIELDS = {"book_id", "chapter_index", "target_language", "paragraphs"}


def _backup_path(entry: dict) -> Path:
    backup_dir = Path(os.environ.get(
        "BACKUP_DIR",
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data", "translations",
        ),
    ))
    return backup_dir / f"{entry['book_id']}_{entry['target_language']}.json"


async def main() -> int:
    try:
        entry = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        print(f"ERROR: stdin is not valid JSON: {exc}", file=sys.stderr)
        return 2

    missing = REQUIRED_FIELDS - entry.keys()
    if missing:
        print(f"ERROR: missing required fields: {sorted(missing)}", file=sys.stderr)
        return 2
    if not entry["paragraphs"]:
        print("ERROR: paragraphs is empty", file=sys.stderr)
        return 2

    await save_translation(
        entry["book_id"],
        entry["chapter_index"],
        entry["target_language"],
        entry["paragraphs"],
        provider=entry.get("provider", "anthropic"),
        model=entry.get("model", "claude-opus-4-7 (in-session)"),
        title_translation=entry.get("title_translation"),
    )

    backup = _backup_path(entry)
    backup.parent.mkdir(parents=True, exist_ok=True)
    existing = json.loads(backup.read_text()) if backup.exists() else []
    existing = [
        e for e in existing
        if not (
            e["book_id"] == entry["book_id"]
            and e["chapter_index"] == entry["chapter_index"]
            and e["target_language"] == entry["target_language"]
        )
    ]
    existing.append(entry)
    existing.sort(key=lambda e: (e["book_id"], e["target_language"], e["chapter_index"]))
    backup.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
    print(
        f"saved book={entry['book_id']} ch={entry['chapter_index']} "
        f"lang={entry['target_language']} ({len(entry['paragraphs'])} paragraphs); "
        f"backup: {backup} ({len(existing)} entries total)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
