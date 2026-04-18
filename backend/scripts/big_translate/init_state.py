#!/usr/bin/env python3
"""Create or refresh backend/scripts/big_translate/state.json from the
current Gutenberg Top-100 list.

Preserves an existing book's status if it is already `in_progress` or
`done`; resets everything else to `pending`. Run once to bootstrap,
then again any time you want to refresh with new top-100 data
(pending-only books are re-ordered, in-flight work is kept).
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from scripts.big_translate.fetch_popular import fetch_top_ids  # noqa: E402


STATE_PATH = Path(__file__).parent / "state.json"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument(
        "--preserve-inprogress", action="store_true", default=True,
        help="Keep in-progress/done books at their current status (default).",
    )
    args = parser.parse_args()

    # Load existing state if present.
    existing: dict[int, dict] = {}
    if STATE_PATH.exists():
        prior = json.loads(STATE_PATH.read_text())
        for b in prior.get("books", []):
            existing[b["id"]] = b

    books = fetch_top_ids(args.limit)
    new_books: list[dict] = []
    for rank, (bid, title) in enumerate(books, 1):
        prev = existing.get(bid, {})
        new_books.append({
            "id": bid,
            "title": title,
            "rank": rank,
            "status": prev.get("status", "pending"),
            "source_lang": prev.get("source_lang"),
            "target_lang": prev.get("target_lang"),
        })

    # Any previously-tracked book not in the new top-100 but still
    # in_progress or done is kept at the end so we don't lose work.
    seen = {b["id"] for b in new_books}
    for bid, b in existing.items():
        if bid in seen:
            continue
        if b.get("status") in ("in_progress", "done"):
            new_books.append(b)

    state = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "books": new_books,
    }
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2))
    print(f"Wrote {STATE_PATH} with {len(new_books)} books")
    return 0


if __name__ == "__main__":
    sys.exit(main())
