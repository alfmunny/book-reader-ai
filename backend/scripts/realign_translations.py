"""Detect and apply uniform chapter-index shifts in translation export files.

Companion to scripts/freeze_book.py for the fossilized-content
architecture (#2624, #2634). When the splitter changes underneath a
translated book — typically by adding or removing leading frontmatter
chapters — every translation entry's chapter_index shifts by a constant
(e.g. the #1055 NCX splitter added 2 leading chapters to Moby Dick,
recorded in data/translations/_backup_book_2701_zh_pre_realign_*.json).
The translations themselves are fine; only their anchors are stale.
This tool finds that constant by maximising paragraph-count agreement
between the entries and the current chapter split, reports residual
per-chapter mismatches, and — when a single shift resolves everything —
rewrites the export file with the corrected indices. Content,
title_translation, provider, and model carry through untouched; the
original file is backed up first.

Where no single shift resolves the drift (chapters merged or split
rather than prepended), the tool reports and stops: those books need
the content-aware audit, per chapter. It never deletes an entry.

When to use: freeze_book.py refuses to freeze a book because
translation entries are out of range or paragraph counts mismatch.
Run this to diagnose, review the proposed mapping, then --apply and
re-run the freeze.

Example
-------
    cd backend
    python -m scripts.realign_translations --book-id 2701 --lang zh
    python -m scripts.realign_translations --book-id 2701 --lang zh --apply
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

# Allow `python -m scripts.realign_translations` from backend/.
sys.path.insert(0, str(__file__).rsplit("/backend/", 1)[0] + "/backend")

REPO_ROOT = Path(__file__).resolve().parents[2]
EXPORT_DIR = REPO_ROOT / "data" / "translations"

DEFAULT_MAX_SHIFT = 5


@dataclass
class ShiftReport:
    """Result of trying uniform shifts against the current split."""
    shift: int
    matched: int                       # entries whose paragraph count agrees after shift
    total: int                         # entries considered
    out_of_range: list[int] = field(default_factory=list)   # old indices landing outside the split
    residuals: list[tuple[int, int, int]] = field(default_factory=list)
    # (old_index, entry_paragraphs, src_paragraphs) for in-range mismatches

    @property
    def resolves(self) -> bool:
        """True when this shift places every entry in range with matching counts."""
        return not self.out_of_range and not self.residuals


def score_shift(entries: list[dict], src_counts: dict[int, int], shift: int) -> ShiftReport:
    """Score one candidate shift: how many entries' paragraph counts agree
    with the source chapter at (old_index + shift)."""
    report = ShiftReport(shift=shift, matched=0, total=len(entries))
    for e in entries:
        new_idx = e["chapter_index"] + shift
        if new_idx not in src_counts:
            report.out_of_range.append(e["chapter_index"])
            continue
        n_entry = len(e["paragraphs"])
        n_src = src_counts[new_idx]
        if n_entry == n_src:
            report.matched += 1
        else:
            report.residuals.append((e["chapter_index"], n_entry, n_src))
    return report


def detect_shift(entries: list[dict], src_counts: dict[int, int],
                 max_shift: int = DEFAULT_MAX_SHIFT) -> tuple[ShiftReport, dict[int, int]]:
    """Try every shift in [-max_shift, +max_shift]; return the best report
    and its old→new mapping. Best = most matches; ties broken toward the
    smallest |shift| (0 preferred), then raises on a genuine tie."""
    reports = [score_shift(entries, src_counts, s)
               for s in range(-max_shift, max_shift + 1)]
    best_score = max(r.matched for r in reports)
    winners = [r for r in reports if r.matched == best_score]
    winners.sort(key=lambda r: abs(r.shift))
    if len(winners) > 1 and abs(winners[0].shift) == abs(winners[1].shift):
        raise SystemExit(
            f"Ambiguous: shifts {winners[0].shift:+d} and {winners[1].shift:+d} "
            f"both match {best_score}/{len(entries)} entries — refusing to guess."
        )
    best = winners[0]
    mapping = {e["chapter_index"]: e["chapter_index"] + best.shift for e in entries}
    return best, mapping


def apply_mapping(path: Path, mapping: dict[int, int], *, now: str | None = None) -> Path:
    """Rewrite the export file with realigned chapter_index values.
    Indices only — paragraphs, title_translation, provider, model are
    untouched. The original file is backed up alongside first."""
    wrapper = json.loads(path.read_text())
    entries = wrapper["entries"]

    stamp = now or datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = path.with_name(f"_backup_{path.stem}_pre_realign_{stamp}.json")
    backup.write_text(path.read_text())

    for e in entries:
        e["chapter_index"] = mapping[e["chapter_index"]]
    wrapper["entries"] = sorted(entries, key=lambda e: e["chapter_index"])
    path.write_text(json.dumps(wrapper, ensure_ascii=False, indent=2) + "\n")
    return backup


def format_report(best: ShiftReport, mapping: dict[int, int]) -> str:
    lines = [
        f"Best shift: {best.shift:+d} — {best.matched}/{best.total} entries agree "
        f"on paragraph count",
    ]
    if best.out_of_range:
        lines.append(f"Out of range after shift: old indices {best.out_of_range}")
    for old, n_entry, n_src in best.residuals:
        lines.append(
            f"  residual: old ch{old} → ch{mapping[old]}: "
            f"entry has {n_entry} paragraphs, source has {n_src}"
        )
    if best.resolves:
        moves = {o: n for o, n in mapping.items() if o != n}
        lines.append(
            f"Mapping resolves all entries: "
            + (f"{len(moves)} entries move (old → old{best.shift:+d})"
               if moves else "already aligned, nothing to do")
        )
    else:
        lines.append(
            "No single shift resolves this book — chapters were likely merged "
            "or split, not prepended. Escalating to the content-aware audit "
            "(slice 3); nothing was changed and nothing was deleted."
        )
    return "\n".join(lines)


async def run(book_id: int, lang: str, *, path: Path | None = None,
              max_shift: int = DEFAULT_MAX_SHIFT, apply: bool = False) -> int:
    from services.book_chapters import get_chapters
    from scripts.freeze_book import paragraphs_of

    path = path or EXPORT_DIR / f"book_{book_id}_{lang}.json"
    if not path.exists():
        print(f"No export file at {path}", file=sys.stderr)
        return 1
    wrapper = json.loads(path.read_text())
    entries = wrapper["entries"]
    if not entries:
        print(f"{path.name}: no entries", file=sys.stderr)
        return 1

    chapters = await get_chapters(book_id)
    if not chapters:
        print(f"Book {book_id}: no chapters resolvable — import it first.",
              file=sys.stderr)
        return 1
    src_counts = {i: len(paragraphs_of(ch.text)) for i, ch in enumerate(chapters)}

    best, mapping = detect_shift(entries, src_counts, max_shift)
    print(format_report(best, mapping))

    if not best.resolves:
        return 3
    if best.shift == 0:
        return 0
    if apply:
        backup = apply_mapping(path, mapping)
        print(f"Applied {best.shift:+d} to {path.name}; original backed up at "
              f"{backup.name}")
    else:
        print("Dry run — re-run with --apply to rewrite the file.")
    return 0


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--book-id", type=int, required=True)
    parser.add_argument("--lang", required=True)
    parser.add_argument("--file", type=Path, default=None,
                        help="Export file to realign (default: data/translations/book_<id>_<lang>.json)")
    parser.add_argument("--max-shift", type=int, default=DEFAULT_MAX_SHIFT)
    parser.add_argument("--apply", action="store_true",
                        help="Rewrite the file with the detected mapping (backs up first)")
    args = parser.parse_args(argv)
    raise SystemExit(asyncio.run(run(
        args.book_id, args.lang, path=args.file,
        max_shift=args.max_shift, apply=args.apply,
    )))


if __name__ == "__main__":
    main()
