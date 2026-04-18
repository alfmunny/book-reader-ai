#!/usr/bin/env python3
"""
Translate a single cached book chapter-by-chapter via Gemini and either:

  - write the translation rows to the local `translations` table (so the
    reader shows it immediately), and/or
  - export the rows to a JSON file for uploading to production via
    `seed_translations.py`.

Why this exists:
  The queue worker is great for production throughput, but when you want
  to pre-translate a book offline (Pride and Prejudice → zh, say) and
  then seed the prod DB, a one-shot CLI is simpler: no queue to manage,
  deterministic ordering, prior-context carried across chapters for
  style consistency.

Alignment discipline:
  Uses the same `split_with_html_preference` the reader uses, so chapter
  indices match what the user sees. Uses `translate_chapters_batch` so
  we inherit its paragraph-preservation prompt, oversized-chapter
  chunking, and BLOCK_NONE safety settings. After each chapter we
  verify the translated paragraph count matches the source. Strict
  mode (the default) fails the whole chapter on mismatch; pass
  `--allow-misaligned` to save partial results anyway.

Usage:

  GEMINI_API_KEY=AIza... python scripts/translate_book.py \\
      --book-id 1342 --lang zh \\
      --output translations_1342_zh.json --write-local

  # Seed prod from the exported JSON
  ADMIN_JWT=eyJ... python scripts/seed_translations.py \\
      --file translations_1342_zh.json \\
      --api-url https://api.book-reader.railway.app/api
"""

import argparse
import asyncio
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

# Make `services.*` importable when run as a script from anywhere.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.book_chapters import split_with_html_preference  # noqa: E402
from services.db import (  # noqa: E402
    DB_PATH,
    get_cached_book,
    get_cached_translation,
    init_db,
    save_translation,
)
from services.gemini import translate_chapters_batch  # noqa: E402
from services.model_limits import limits_for  # noqa: E402


@dataclass
class ChapterResult:
    book_id: int
    chapter_index: int
    target_language: str
    paragraphs: list[str]
    provider: str
    model: str


def _source_paragraphs(text: str) -> list[str]:
    """Paragraph split used to check alignment. Must match the reader's
    split (see SentenceReader: `text.split(/\\n\\n+/)`)."""
    return [p for p in text.split("\n\n") if p.strip()]


async def translate_book(
    book_id: int,
    target_language: str,
    *,
    api_key: str,
    model: str,
    write_local: bool,
    output: Path | None,
    skip_cached: bool,
    allow_misaligned: bool,
    prior_context_paragraphs: int = 2,
) -> list[ChapterResult]:
    book = await get_cached_book(book_id)
    if not book or not book.get("text"):
        raise SystemExit(
            f"Book {book_id} is not cached locally. Import it via the "
            "reader first, or run `seed_books.py`.",
        )
    source = (book.get("languages") or ["en"])[0]
    if source == target_language:
        raise SystemExit(
            f"Book {book_id} is already in {target_language}; nothing to translate.",
        )
    chapters = await split_with_html_preference(book_id, book["text"])

    limits = limits_for(model)
    max_tokens = limits["max_output_tokens"]

    title = book.get("title") or f"book {book_id}"
    print(f"Book:   {title} (id={book_id})")
    print(f"Source: {source}  →  Target: {target_language}")
    print(f"Model:  {model}  (max_output_tokens={max_tokens})")
    print(f"Chapters: {len(chapters)}")
    print()

    results: list[ChapterResult] = []
    prior_context = ""
    started = time.monotonic()

    for i, ch in enumerate(chapters):
        src_paragraphs = _source_paragraphs(ch.text)
        if not src_paragraphs:
            print(f"[{i + 1:>3}/{len(chapters)}] empty — skipping")
            continue

        if skip_cached and await get_cached_translation(
            book_id, i, target_language,
        ):
            print(f"[{i + 1:>3}/{len(chapters)}] already cached — skipping")
            continue

        words = sum(len(p.split()) for p in src_paragraphs)
        print(
            f"[{i + 1:>3}/{len(chapters)}] translating "
            f"({len(src_paragraphs)} paragraphs, {words} words)…",
            flush=True,
        )

        try:
            response = await translate_chapters_batch(
                api_key,
                [(i, ch.text)],
                source,
                target_language,
                prior_context=prior_context,
                model=model,
                max_output_tokens=max_tokens,
            )
        except Exception as exc:
            print(f"    failed: {exc}", file=sys.stderr)
            continue

        paragraphs = response.get(i, [])
        if not paragraphs:
            print("    empty response — skipping", file=sys.stderr)
            continue

        if len(paragraphs) != len(src_paragraphs):
            msg = (
                f"    paragraph count mismatch: source={len(src_paragraphs)} "
                f"translation={len(paragraphs)}"
            )
            if allow_misaligned:
                print(msg + " (saving anyway, --allow-misaligned)", file=sys.stderr)
            else:
                print(msg + " (skipping, pass --allow-misaligned to save)",
                      file=sys.stderr)
                continue

        result = ChapterResult(
            book_id=book_id,
            chapter_index=i,
            target_language=target_language,
            paragraphs=paragraphs,
            provider="gemini",
            model=model,
        )
        results.append(result)

        if write_local:
            await save_translation(
                book_id, i, target_language, paragraphs,
                provider="gemini", model=model,
            )

        # Carry the tail for cross-chapter consistency in character
        # names / tone, same as the queue worker does.
        if prior_context_paragraphs > 0:
            tail = paragraphs[-prior_context_paragraphs:]
            prior_context = "\n\n".join(tail)

        elapsed = time.monotonic() - started
        print(f"    done in {elapsed:.1f}s cumulative", flush=True)

    if output:
        payload = [
            {
                "book_id": r.book_id,
                "chapter_index": r.chapter_index,
                "target_language": r.target_language,
                "paragraphs": r.paragraphs,
                "provider": r.provider,
                "model": r.model,
            }
            for r in results
        ]
        output.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        print(f"\nWrote {len(results)} chapter translations to {output}")

    return results


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Translate a cached book chapter-by-chapter via Gemini.",
    )
    parser.add_argument("--book-id", type=int, required=True)
    parser.add_argument(
        "--lang", required=True,
        help="Target language code (e.g. zh, en, de, fr)",
    )
    parser.add_argument(
        "--model", default="gemini-2.5-flash",
        help="Gemini model ID (default: gemini-2.5-flash)",
    )
    parser.add_argument(
        "--output", type=Path,
        help="Export translations to this JSON file (for prod seeding)",
    )
    parser.add_argument(
        "--write-local", action="store_true",
        help="Also insert rows into the local DB's translations table",
    )
    parser.add_argument(
        "--skip-cached", action="store_true", default=True,
        help="Skip chapters that already have a cached translation (default)",
    )
    parser.add_argument(
        "--force", action="store_false", dest="skip_cached",
        help="Re-translate chapters that are already cached",
    )
    parser.add_argument(
        "--allow-misaligned", action="store_true",
        help="Save chapters even when paragraph counts don't match the "
             "source (default: skip mismatched chapters)",
    )
    parser.add_argument(
        "--gemini-key", default=os.environ.get("GEMINI_API_KEY"),
        help="Gemini API key (or set GEMINI_API_KEY env var)",
    )
    return parser.parse_args(argv)


async def main_async(args: argparse.Namespace) -> int:
    if not args.gemini_key:
        print("ERROR: set --gemini-key or GEMINI_API_KEY env var",
              file=sys.stderr)
        return 2
    if not args.output and not args.write_local:
        print("ERROR: specify --output and/or --write-local — otherwise "
              "the translation is thrown away", file=sys.stderr)
        return 2

    await init_db()
    print(f"DB_PATH: {DB_PATH}\n")

    results = await translate_book(
        args.book_id,
        args.lang,
        api_key=args.gemini_key,
        model=args.model,
        write_local=args.write_local,
        output=args.output,
        skip_cached=args.skip_cached,
        allow_misaligned=args.allow_misaligned,
    )
    print(f"\nDone — {len(results)} chapters translated successfully.")
    return 0


def main() -> None:
    args = _parse_args()
    sys.exit(asyncio.run(main_async(args)))


if __name__ == "__main__":
    main()
