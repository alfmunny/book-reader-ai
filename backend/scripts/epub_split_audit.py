"""EPUB split quality audit (issues #769, #834).

Compares the **character count** and **paragraph count** produced by the
EPUB-path splitter and the plain-text-path splitter for every book with a
stored EPUB, and surfaces a third **structural** signal for the specific
"verse-collapse" pattern that bit us in #820 — paragraphs where an embedded
newline is followed by an all-caps speaker cue, indicating the EPUB path
collapsed poetry / drama into a single visual block.

Three signals, independently flagged:

- **Character ratio** (#769 / #758 / #767) — EPUB chars drop substantially
  below the plain-text baseline. Default gate: < 50%.
- **Paragraph ratio** (#834) — EPUB paragraphs fewer than the plain-text
  paragraph count. Invisible to the char-count check. Default gate: < 80%.
- **Structural speaker-cue collapse** (#834 / #820) — a paragraph exceeds
  `--structural-paragraph-len` characters AND contains an embedded newline
  followed by an all-caps name + period (`\\n  HELENA.`). No plain-text
  baseline needed.

Usage:
    python -m scripts.epub_split_audit                      # all books, stdout
    python -m scripts.epub_split_audit --book-id 69327      # single book
    python -m scripts.epub_split_audit --csv out.csv        # write CSV report
    python -m scripts.epub_split_audit --threshold 0.7      # stricter char gate
    python -m scripts.epub_split_audit --para-threshold 0.9 # stricter para gate

Exit code is 1 when at least one book is flagged by any of the three
signals — the script can be wired into CI as a data-quality gate.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from services.db import (
    get_book_epub_bytes,
    get_cached_book,
    list_cached_books,
)
from services.splitter import Chapter, build_chapters, build_chapters_from_epub


DEFAULT_CHAR_THRESHOLD = 0.5
DEFAULT_PARAGRAPH_THRESHOLD = 0.8
DEFAULT_STRUCTURAL_MIN_LEN = 400

_PARA_SPLIT_RE = re.compile(r"\n\s*\n")
# Matches an embedded-newline speaker cue: newline, optional indent, >=2
# uppercase (incl. German umlauts) possibly separated by spaces, then a period.
# Example: "\n  HELENA." or "\nDER KAISER."
_SPEAKER_CUE_RE = re.compile(r"\n[ \t]*[A-ZÄÖÜ]{2,}[A-ZÄÖÜ ]*\.")


@dataclass
class AuditRow:
    book_id: int
    title: str
    # Character ratio (signal 1 — #769)
    epub_chars: int
    text_chars: int
    ratio: float
    suspicious: bool
    # Paragraph ratio (signal 2 — #834)
    epub_paragraphs: int = 0
    text_paragraphs: int = 0
    para_ratio: float = 1.0
    paragraph_suspicious: bool = False
    # Structural speaker-cue collapse (signal 3 — #834/#820).
    # Each entry: (chapter_index, first-100-chars-of-paragraph).
    structural_flags: list[tuple[int, str]] = field(default_factory=list)

    @property
    def is_flagged(self) -> bool:
        """True when any of the three signals fired — drives the CLI exit code."""
        return (
            self.suspicious
            or self.paragraph_suspicious
            or bool(self.structural_flags)
        )


def _count_paragraphs(chapters: list[Chapter]) -> int:
    total = 0
    for c in chapters:
        if not c.text:
            continue
        total += sum(1 for p in _PARA_SPLIT_RE.split(c.text) if p.strip())
    return total


def _find_structural_flags(
    chapters: list[Chapter],
    min_len: int = DEFAULT_STRUCTURAL_MIN_LEN,
) -> list[tuple[int, str]]:
    """Return (chapter_index, excerpt) for each paragraph that is long *and*
    contains an embedded-newline speaker cue — the #820 verse-collapse
    signature.
    """
    flags: list[tuple[int, str]] = []
    for idx, c in enumerate(chapters):
        if not c.text:
            continue
        for p in _PARA_SPLIT_RE.split(c.text):
            if len(p) < min_len:
                continue
            if _SPEAKER_CUE_RE.search(p):
                excerpt = p[:100].replace("\n", " / ").strip()
                flags.append((idx, excerpt))
    return flags


def compute_audit_row(
    book_id: int,
    title: str,
    text: str,
    epub_bytes: bytes,
    threshold: float = DEFAULT_CHAR_THRESHOLD,
    paragraph_threshold: float = DEFAULT_PARAGRAPH_THRESHOLD,
    structural_min_len: int = DEFAULT_STRUCTURAL_MIN_LEN,
) -> AuditRow:
    """Run both splitters and produce the comparison row.

    Intentionally side-effect-free and DB-free so tests can cover edge cases
    without spinning up the full stack. When the plain-text baseline is empty
    (book has an EPUB but no cached text) the char and paragraph ratios
    cannot be computed; the structural signal is still evaluated because it
    only needs the EPUB chapters.
    """
    text_chapters = build_chapters(text) if text else []
    epub_chapters = build_chapters_from_epub(epub_bytes) if epub_bytes else []

    text_chars = sum(len(c.text) for c in text_chapters)
    epub_chars = sum(len(c.text) for c in epub_chapters)
    text_paragraphs = _count_paragraphs(text_chapters)
    epub_paragraphs = _count_paragraphs(epub_chapters)
    structural_flags = _find_structural_flags(epub_chapters, min_len=structural_min_len)

    if text_chars == 0:
        # No baseline for ratio-based signals; keep them non-suspicious but
        # still surface the structural flags (they stand on their own).
        return AuditRow(
            book_id=book_id,
            title=title,
            epub_chars=epub_chars,
            text_chars=0,
            ratio=1.0,
            suspicious=False,
            epub_paragraphs=epub_paragraphs,
            text_paragraphs=0,
            para_ratio=1.0,
            paragraph_suspicious=False,
            structural_flags=structural_flags,
        )

    ratio = epub_chars / text_chars
    para_ratio = epub_paragraphs / text_paragraphs if text_paragraphs > 0 else 1.0
    return AuditRow(
        book_id=book_id,
        title=title,
        epub_chars=epub_chars,
        text_chars=text_chars,
        ratio=ratio,
        suspicious=ratio < threshold,
        epub_paragraphs=epub_paragraphs,
        text_paragraphs=text_paragraphs,
        para_ratio=para_ratio,
        paragraph_suspicious=para_ratio < paragraph_threshold,
        structural_flags=structural_flags,
    )


async def run_audit(
    threshold: float = DEFAULT_CHAR_THRESHOLD,
    paragraph_threshold: float = DEFAULT_PARAGRAPH_THRESHOLD,
    structural_min_len: int = DEFAULT_STRUCTURAL_MIN_LEN,
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
                paragraph_threshold=paragraph_threshold,
                structural_min_len=structural_min_len,
            )
        )
    return rows


def write_csv(rows: Iterable[AuditRow], out_path: Path) -> None:
    with out_path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "book_id",
                "title",
                "epub_chars",
                "text_chars",
                "ratio",
                "suspicious",
                "epub_paragraphs",
                "text_paragraphs",
                "para_ratio",
                "paragraph_suspicious",
                "structural_flag_count",
                "structural_flag_sample",
            ]
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
                    r.epub_paragraphs,
                    r.text_paragraphs,
                    f"{r.para_ratio:.3f}",
                    "yes" if r.paragraph_suspicious else "",
                    len(r.structural_flags),
                    r.structural_flags[0][1] if r.structural_flags else "",
                ]
            )


def _print_summary(
    rows: list[AuditRow],
    threshold: float,
    paragraph_threshold: float,
) -> None:
    if not rows:
        print("No books with stored EPUBs to audit.")
        return
    char_flagged = [r for r in rows if r.suspicious]
    para_flagged = [r for r in rows if r.paragraph_suspicious]
    struct_flagged = [r for r in rows if r.structural_flags]
    any_flagged = [r for r in rows if r.is_flagged]

    print(f"Audited {len(rows)} book(s).")
    print(f"  Char-ratio gate:      < {threshold:.0%}    flagged {len(char_flagged)}")
    print(f"  Paragraph-ratio gate: < {paragraph_threshold:.0%}    flagged {len(para_flagged)}")
    print(f"  Structural speaker-cue collapse:      flagged {len(struct_flagged)}")
    print(f"  Any signal:                           flagged {len(any_flagged)}")

    if any_flagged:
        print()
        print(
            f"{'book_id':<10}{'ratio':<8}{'para':<8}{'struct':<8}title"
        )
        print("-" * 80)
        for r in sorted(any_flagged, key=lambda x: (x.ratio, x.para_ratio)):
            title = (r.title or "")[:40]
            print(
                f"{r.book_id:<10}{r.ratio:<8.2f}{r.para_ratio:<8.2f}"
                f"{len(r.structural_flags):<8}{title}"
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit EPUB split quality.")
    parser.add_argument(
        "--book-id", type=int, default=None, help="Audit a single book by id."
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_CHAR_THRESHOLD,
        help="Char ratio below which a book is flagged (default: 0.5).",
    )
    parser.add_argument(
        "--para-threshold",
        type=float,
        default=DEFAULT_PARAGRAPH_THRESHOLD,
        help="Paragraph ratio below which a book is flagged (default: 0.8).",
    )
    parser.add_argument(
        "--structural-paragraph-len",
        type=int,
        default=DEFAULT_STRUCTURAL_MIN_LEN,
        help="Min paragraph length (chars) to consider for the structural "
        "speaker-cue check (default: 400).",
    )
    parser.add_argument(
        "--csv", type=Path, default=None, help="Optional CSV output path."
    )
    args = parser.parse_args(argv)

    rows = asyncio.run(
        run_audit(
            threshold=args.threshold,
            paragraph_threshold=args.para_threshold,
            structural_min_len=args.structural_paragraph_len,
            book_id=args.book_id,
        )
    )
    _print_summary(rows, args.threshold, args.para_threshold)
    if args.csv is not None:
        write_csv(rows, args.csv)
        print(f"\nCSV written to {args.csv}")
    return 1 if any(r.is_flagged for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
