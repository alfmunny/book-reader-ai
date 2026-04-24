"""EPUB split quality audit (issue #769).

Compares the character counts produced by the EPUB-path splitter and the
plain-text-path splitter for every book with a stored EPUB. Books where the
EPUB split yields substantially fewer characters than the text split are
flagged as likely hitting a splitter edge case (see #758, #767 for the
regressions that motivated this audit).

Usage:
    python -m scripts.epub_split_audit                      # all books, stdout
    python -m scripts.epub_split_audit --book-id 69327      # single book
    python -m scripts.epub_split_audit --csv out.csv        # write CSV report
    python -m scripts.epub_split_audit --threshold 0.7      # stricter gate

Exit code is 1 when at least one book is flagged — the script can be wired
into CI as a data-quality gate.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from services.db import (
    get_book_epub_bytes,
    get_cached_book,
    list_cached_books,
)
from services.splitter import build_chapters, build_chapters_from_epub


DEFAULT_THRESHOLD = 0.5


@dataclass
class AuditRow:
    book_id: int
    title: str
    epub_chars: int
    text_chars: int
    ratio: float
    suspicious: bool


def compute_audit_row(
    book_id: int,
    title: str,
    text: str,
    epub_bytes: bytes,
    threshold: float = DEFAULT_THRESHOLD,
) -> AuditRow:
    """Run both splitters and produce the comparison row.

    Intentionally side-effect-free and DB-free so tests can cover edge cases
    without spinning up the full stack. When the plain-text baseline is empty
    (book has an EPUB but no cached text) the book is reported but not
    flagged — we can't meaningfully compare.
    """
    text_chapters = build_chapters(text) if text else []
    epub_chapters = build_chapters_from_epub(epub_bytes) if epub_bytes else []
    text_chars = sum(len(c.text) for c in text_chapters)
    epub_chars = sum(len(c.text) for c in epub_chapters)
    if text_chars == 0:
        return AuditRow(
            book_id=book_id,
            title=title,
            epub_chars=epub_chars,
            text_chars=0,
            ratio=1.0,
            suspicious=False,
        )
    ratio = epub_chars / text_chars
    return AuditRow(
        book_id=book_id,
        title=title,
        epub_chars=epub_chars,
        text_chars=text_chars,
        ratio=ratio,
        suspicious=ratio < threshold,
    )


async def run_audit(
    threshold: float = DEFAULT_THRESHOLD,
    book_id: int | None = None,
) -> list[AuditRow]:
    rows: list[AuditRow] = []
    if book_id is not None:
        ids = [book_id]
    else:
        ids = [b["id"] for b in await list_cached_books()]
    for bid in ids:
        epub_bytes = await get_book_epub_bytes(bid)
        if epub_bytes is None:
            continue
        book = await get_cached_book(bid)
        if book is None:
            continue
        rows.append(
            compute_audit_row(
                book_id=bid,
                title=book.get("title") or f"book {bid}",
                text=book.get("text") or "",
                epub_bytes=epub_bytes,
                threshold=threshold,
            )
        )
    return rows


def write_csv(rows: Iterable[AuditRow], out_path: Path) -> None:
    with out_path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            ["book_id", "title", "epub_chars", "text_chars", "ratio", "suspicious"]
        )
        for r in rows:
            w.writerow(
                [
                    r.book_id,
                    r.title,
                    r.epub_chars,
                    r.text_chars,
                    f"{r.ratio:.3f}",
                    "yes" if r.suspicious else "",
                ]
            )


def _print_summary(rows: list[AuditRow], threshold: float) -> None:
    if not rows:
        print("No books with stored EPUBs to audit.")
        return
    suspicious = [r for r in rows if r.suspicious]
    print(
        f"Audited {len(rows)} book(s); "
        f"threshold: epub_chars / text_chars < {threshold:.0%}"
    )
    print(f"Suspicious: {len(suspicious)}")
    if suspicious:
        print()
        print(f"{'book_id':<10}{'ratio':<10}{'epub_chars':<14}{'text_chars':<14}title")
        print("-" * 80)
        for r in sorted(suspicious, key=lambda x: x.ratio):
            title = (r.title or "")[:40]
            print(
                f"{r.book_id:<10}{r.ratio:<10.2f}"
                f"{r.epub_chars:<14}{r.text_chars:<14}{title}"
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit EPUB split quality.")
    parser.add_argument(
        "--book-id", type=int, default=None, help="Audit a single book by id."
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help="Ratio below which a book is flagged suspicious (default: 0.5).",
    )
    parser.add_argument(
        "--csv", type=Path, default=None, help="Optional CSV output path."
    )
    args = parser.parse_args(argv)

    rows = asyncio.run(run_audit(threshold=args.threshold, book_id=args.book_id))
    _print_summary(rows, args.threshold)
    if args.csv is not None:
        write_csv(rows, args.csv)
        print(f"\nCSV written to {args.csv}")
    return 1 if any(r.suspicious for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
