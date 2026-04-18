#!/usr/bin/env python3
"""Fetch Gutenberg's "Top 100 EBooks last 30 days" list, return book IDs.

Writes `state.json` (or merges into an existing one) with one entry per
book ID, in ranked order, status="pending". Used once by
`init_state.py` to bootstrap the multi-book translator.

Usage:
    python scripts/big_translate/fetch_popular.py --limit 100
"""
import argparse
import re
import sys
import urllib.request
from pathlib import Path


TOP_URL = "https://www.gutenberg.org/browse/scores/top"

# The "Top 100 EBooks last 30 days" section is delimited by <h2
# id="books-last30">. The subsequent <ol> contains <li><a
# href="/ebooks/NN">Title by Author (count)</a></li>.
# We parse it with a simple regex — no full HTML parse needed, the
# structure is stable and has been for years.
_BOOK_LINK_RE = re.compile(r'<a\s+href="/ebooks/(\d+)"[^>]*>([^<]+)</a>', re.I)


def fetch_top_ids(limit: int) -> list[tuple[int, str]]:
    req = urllib.request.Request(
        TOP_URL,
        headers={"User-Agent": "book-reader-ai/1.0 (+translation preseeder)"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="replace")

    # Find the 30-day section and slice to the next h2.
    start = html.find('id="books-last30"')
    if start == -1:
        raise RuntimeError("Couldn't find books-last30 section on the page")
    end = html.find("<h2", start + 1)
    section = html[start:end] if end != -1 else html[start:]

    out: list[tuple[int, str]] = []
    seen_ids: set[int] = set()
    for match in _BOOK_LINK_RE.finditer(section):
        bid = int(match.group(1))
        title = match.group(2).strip()
        if bid in seen_ids:
            continue
        seen_ids.add(bid)
        out.append((bid, title))
        if len(out) >= limit:
            break
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()

    books = fetch_top_ids(args.limit)
    for bid, title in books:
        print(f"{bid}\t{title}")
    print(f"\n(fetched {len(books)} books)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
