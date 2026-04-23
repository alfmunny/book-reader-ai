#!/usr/bin/env python3
"""
Backfill EPUB files for all Gutenberg books already in the DB.

Books added before the EPUB-ingestion feature (feat/epub-ingestion) only have
plain-text cached. This script fetches and stores their EPUBs so that
split_with_html_preference() uses the better EPUB-based chapter split on the
next cold start.

Usage:
    # Dry-run (show what would be fetched, no writes)
    python scripts/backfill_epubs.py --dry-run

    # Backfill all books missing an EPUB
    python scripts/backfill_epubs.py

    # Re-fetch even if EPUB already cached
    python scripts/backfill_epubs.py --force

    # Limit to specific book IDs
    python scripts/backfill_epubs.py --book-ids 11 84 2229

    # Override DB path
    python scripts/backfill_epubs.py --db /path/to/books.db
"""

import argparse
import asyncio
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(SCRIPT_DIR, "..", "backend")
sys.path.insert(0, BACKEND_DIR)


async def run(args: argparse.Namespace) -> None:
    import aiosqlite
    from services.db import DB_PATH, save_book_epub
    from services.gutenberg import get_book_epub

    db_path = args.db or DB_PATH

    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        # Find candidate books: Gutenberg books (no owner / source != upload)
        if args.book_ids:
            placeholders = ",".join("?" * len(args.book_ids))
            query = f"SELECT id, title FROM books WHERE id IN ({placeholders})"
            params = list(args.book_ids)
        else:
            query = """
                SELECT id, title FROM books
                WHERE (source IS NULL OR source != 'upload')
                ORDER BY id
            """
            params = []

        async with db.execute(query, params) as cur:
            all_books = [dict(r) for r in await cur.fetchall()]

        if not args.force:
            # Exclude books that already have an EPUB cached
            async with db.execute("SELECT book_id FROM book_epubs") as cur:
                already = {r[0] for r in await cur.fetchall()}
            books = [b for b in all_books if b["id"] not in already]
            skipped_cached = len(all_books) - len(books)
        else:
            books = all_books
            skipped_cached = 0

    total = len(books)
    print(f"Books to process: {total}  (skipped already cached: {skipped_cached})")
    if args.dry_run:
        print("Dry-run — no writes.")
        for b in books:
            print(f"  Would fetch EPUB for #{b['id']} {b['title']}")
        return

    ok = skipped = failed = 0
    t0 = time.time()

    for i, book in enumerate(books, 1):
        book_id = book["id"]
        title = book["title"][:50]
        print(f"  [{i}/{total}] #{book_id} {title} ...", end="", flush=True)
        try:
            result = await get_book_epub(book_id)
            if result:
                epub_bytes, epub_url = result
                await save_book_epub(book_id, epub_bytes, epub_url)
                print(f" ok ({len(epub_bytes)//1024} KB)")
                ok += 1
            else:
                print(" no EPUB available")
                skipped += 1
        except Exception as exc:
            print(f" ERROR: {exc}")
            failed += 1

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.0f}s: {ok} stored, {skipped} no EPUB, {failed} errors.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill EPUB cache for existing Gutenberg books.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--book-ids", type=int, nargs="+", metavar="N",
                        help="Backfill specific book IDs only")
    parser.add_argument("--force", action="store_true",
                        help="Re-fetch even if EPUB already cached")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be fetched without writing")
    parser.add_argument("--db", metavar="PATH",
                        help="Override DB path (defaults to DB_PATH env or backend/books.db)")
    args = parser.parse_args()
    if args.db:
        os.environ["DB_PATH"] = args.db
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
