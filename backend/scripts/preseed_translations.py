#!/usr/bin/env python3
"""
Pre-populate the `translations` table for every cached book.

Walks every book in the DB, splits it into chapters using the same
`services.splitter.build_chapters` the reader uses, and writes a cached
translation for every chapter into the shared cache. Users hit the cache
instantly the first time they open a chapter — no API spend at runtime.

Idempotent: chapters that already have a translation for the target
language are skipped. Books that are already in the target language are
skipped entirely.

Usage:
    # Default — free Google Translate, target Chinese
    python scripts/preseed_translations.py

    # Use Gemini with a key from env var (best literary quality, free tier)
    GEMINI_API_KEY=AIza... python scripts/preseed_translations.py --provider gemini

    # Different target language
    python scripts/preseed_translations.py --target de

    # Just one book (useful for testing)
    python scripts/preseed_translations.py --book-id 2229

    # See what would be done without calling any API
    python scripts/preseed_translations.py --dry-run

    # Bump concurrency (default 3 — Gemini free tier RPM is low)
    python scripts/preseed_translations.py --concurrency 5
"""

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass
from typing import Awaitable, Callable

# Make `services.*` importable when this file is run as a script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.db import (  # noqa: E402
    init_db,
    list_cached_books,
    get_cached_book,
    get_cached_translation,
    save_translation,
    DB_PATH,
)
from services.splitter import build_chapters  # noqa: E402
from services.translate import translate_text  # noqa: E402


Translator = Callable[[str, str, str], Awaitable[list[str]]]


@dataclass
class ChapterJob:
    book_id: int
    book_title: str
    chapter_index: int
    source_language: str
    text: str


def _resolve_source_language(book: dict) -> str | None:
    """Return the first language code from book metadata, or None."""
    langs = book.get("languages") or []
    return langs[0] if langs else None


async def plan_jobs(
    books: list[dict],
    target_language: str,
    *,
    book_id_filter: int | None = None,
) -> list[ChapterJob]:
    """Build the list of chapters that still need translating.

    - Skips books already in `target_language`
    - Skips books without a language or without cached text
    - Skips individual chapters that already have a translation cached
    - Optionally filters to a single book_id
    """
    jobs: list[ChapterJob] = []
    for meta in books:
        if book_id_filter is not None and meta["id"] != book_id_filter:
            continue

        source = _resolve_source_language(meta)
        if source is None or source == target_language:
            continue

        book = await get_cached_book(meta["id"])
        if book is None or not book.get("text"):
            continue

        chapters = build_chapters(book["text"])
        for idx, ch in enumerate(chapters):
            if not ch.text.strip():
                continue
            existing = await get_cached_translation(meta["id"], idx, target_language)
            if existing:
                continue
            jobs.append(ChapterJob(
                book_id=meta["id"],
                book_title=book["title"],
                chapter_index=idx,
                source_language=source,
                text=ch.text,
            ))
    return jobs


async def run_jobs(
    jobs: list[ChapterJob],
    target_language: str,
    translator: Translator,
    *,
    concurrency: int = 1,
    on_result: Callable[[ChapterJob, bool, str], None] | None = None,
) -> tuple[int, int]:
    """Run every job through `translator`, persist results, return (ok, failed).

    A single chapter failing never aborts the run — the error is reported
    through `on_result` (if provided) and the next job continues. This
    matters for long unattended overnight batches.
    """
    if concurrency < 1:
        raise ValueError("concurrency must be >= 1")

    sem = asyncio.Semaphore(concurrency)
    ok = 0
    failed = 0

    async def _one(job: ChapterJob) -> None:
        nonlocal ok, failed
        async with sem:
            try:
                paragraphs = await translator(
                    job.text, job.source_language, target_language
                )
                await save_translation(
                    job.book_id, job.chapter_index, target_language, paragraphs
                )
                ok += 1
                if on_result:
                    on_result(job, True, "")
            except Exception as e:  # noqa: BLE001 — deliberately broad
                failed += 1
                if on_result:
                    on_result(job, False, str(e))

    await asyncio.gather(*(_one(j) for j in jobs))
    return ok, failed


def _build_translator(provider: str, gemini_key: str | None) -> Translator:
    """Return an async callable matching the `Translator` protocol."""
    async def _t(text: str, source: str, target: str) -> list[str]:
        return await translate_text(
            text, source, target,
            provider=provider,
            gemini_key=gemini_key,
        )
    return _t


# ── CLI ──────────────────────────────────────────────────────────────────────

def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Pre-populate chapter translations for every cached book.",
    )
    parser.add_argument("--target", default="zh",
                        help="Target language code (default: zh)")
    parser.add_argument("--provider", choices=("google", "gemini"), default="google",
                        help="Translation backend (default: google — free, no key)")
    parser.add_argument("--gemini-key", default=os.environ.get("GEMINI_API_KEY"),
                        help="Gemini API key (or set GEMINI_API_KEY env var)")
    parser.add_argument("--book-id", type=int, default=None,
                        help="Only process this one book")
    parser.add_argument("--concurrency", type=int, default=3,
                        help="Max in-flight translations (default: 3)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be done without calling any API")
    return parser.parse_args(argv)


async def main_async(args: argparse.Namespace) -> int:
    await init_db()

    if args.provider == "gemini" and not args.gemini_key:
        print("ERROR: --provider gemini requires --gemini-key or GEMINI_API_KEY env var.",
              file=sys.stderr)
        return 2

    books = await list_cached_books()
    print(f"Database: {DB_PATH}")
    print(f"Books cached: {len(books)}")
    print(f"Target language: {args.target}")
    print(f"Provider: {args.provider}\n")

    print("Planning work…")
    jobs = await plan_jobs(books, args.target, book_id_filter=args.book_id)

    if not jobs:
        print("Nothing to do — all chapters already translated (or no books match).")
        return 0

    # Stats
    by_book: dict[int, list[ChapterJob]] = {}
    for j in jobs:
        by_book.setdefault(j.book_id, []).append(j)
    total_words = sum(len(j.text.split()) for j in jobs)
    print(f"  Books to process: {len(by_book)}")
    print(f"  Chapters to translate: {len(jobs)}")
    print(f"  Total words: {total_words:,}\n")

    if args.dry_run:
        for bid, bjobs in by_book.items():
            title = bjobs[0].book_title
            words = sum(len(j.text.split()) for j in bjobs)
            print(f"  [{bid:>6}] {title[:60]:<60} "
                  f"{len(bjobs):>3} ch, {words:>7,} words")
        print("\n(dry-run — no translations written)")
        return 0

    translator = _build_translator(args.provider, args.gemini_key)

    total = len(jobs)
    counter = {"n": 0}

    def _log(job: ChapterJob, success: bool, err: str) -> None:
        counter["n"] += 1
        mark = "OK" if success else "!!"
        suffix = "" if success else f"  ({err[:60]})"
        print(f"  [{counter['n']:>4}/{total}] {mark} "
              f"{job.book_id} ch{job.chapter_index}  "
              f"{job.book_title[:40]}{suffix}")

    ok, failed = await run_jobs(
        jobs, args.target, translator,
        concurrency=args.concurrency,
        on_result=_log,
    )

    print(f"\nDone. Succeeded: {ok}, Failed: {failed}")
    return 0 if failed == 0 else 1


def main() -> int:
    args = _parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
