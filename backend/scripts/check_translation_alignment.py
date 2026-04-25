"""Verify source-vs-translation structural alignment for any cached book.

Generalised from `/tmp/check_faust_alignment.py` per the design doc at
`docs/design/translation-alignment-checker.md` (issue #1073).

What it checks per chapter:

    1. Row existence       — one translations row per splitter chapter.
    2. Paragraph count     — src paragraph count == translated paragraph count.
    3. Paragraph line drift — for paragraphs with ≥4 lines, |src_lines − tr_lines|
                              must be 0. Catches Opus's typical off-by-one drop
                              on chunked input (the 18 drifts in Rilke/zh that
                              the original Faust-only checker found).
    4. Stanza line count   — for paragraphs flagged as VERSE by the classifier,
                              src and translated lines must match exactly.
    5. Speaker cues        — per-source-language detector (de/fr/en/ru) flags
                              source cues; checker requires a translated cue at
                              the same line position.
    6. Title (informational) — null `title_translation` is reported but does
                              not fail the check.

Usage:
    python -m scripts.check_translation_alignment --book-id 24288 --target-lang zh
    python -m scripts.check_translation_alignment --all-books --target-lang zh
    python -m scripts.check_translation_alignment --book-id 24288 --target-lang zh \
        --format json --severity-threshold error

Exit code 0 when no issues at the requested severity threshold; non-zero
otherwise. Output is markdown by default (issue-body friendly), JSON via
`--format json` for CI gating.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import statistics
import sys
from typing import Iterable

from services.db import DB_PATH
from services.splitter import build_chapters_from_epub
from scripts.translation_alignment_detectors import (
    get_detector,
    is_translated_cue,
)
from scripts.translation_alignment_overrides import get_override


# ---------- Severity ---------------------------------------------------------

SEVERITY_RANK = {"info": 0, "warning": 1, "error": 2}

SEVERITY_BY_KIND = {
    "missing_translation":         "error",
    "paragraph_count_drift":       "error",
    "paragraph_line_count_drift":  "error",
    "stanza_line_drift":           "error",
    "speaker_cue_missing":         "warning",
    "speaker_cue_not_translated":  "warning",
    "title_translation_missing":   "info",
}


# ---------- Verse classifier -------------------------------------------------


def is_verse_paragraph(text: str) -> bool:
    """Heuristic: paragraph is verse iff
        - ≥3 non-empty lines AND
        - line lengths are roughly even (stddev/mean < 0.5) AND
        - at least 2 lines do NOT end with sentence-final punctuation.

    Calibrated against the audited books in `reports/translation_audits_2026_04_25.md`:
    Faust (verse), Stundenbuch (verse), Bovary (prose), Moby Dick (prose).
    """
    lines = [l for l in text.split("\n") if l.strip()]
    if len(lines) < 3:
        return False
    lengths = [len(l) for l in lines]
    mean = sum(lengths) / len(lengths)
    if mean == 0:
        return False
    if len(lengths) >= 2:
        stddev = statistics.stdev(lengths)
        if stddev / mean >= 0.5:
            return False
    sentence_final = (".", "?", "!", "。", "？", "！")
    non_terminal = sum(1 for l in lines if not l.rstrip().endswith(sentence_final))
    return non_terminal >= 2


def classify_paragraph(
    book_id: int, chapter_index: int, paragraph_index: int, text: str
) -> bool:
    """Return True iff the paragraph should be treated as verse, applying
    per-book overrides when present."""
    ov = get_override(book_id)
    verse_chapters = ov.get("verse_chapters")
    if verse_chapters == "all":
        return True
    if isinstance(verse_chapters, list) and verse_chapters:
        if chapter_index in verse_chapters:
            return True
    explicit = ov.get("verse_paragraph_indices")
    if explicit and chapter_index in explicit:
        return paragraph_index in explicit[chapter_index]
    if verse_chapters == []:
        return False
    return is_verse_paragraph(text)


# ---------- DB I/O -----------------------------------------------------------


def _conn() -> sqlite3.Connection:
    return sqlite3.connect(DB_PATH)


def chapters_from_db(book_id: int):
    conn = _conn()
    row = conn.execute(
        "SELECT epub_bytes FROM book_epubs WHERE book_id=?", (book_id,)
    ).fetchone()
    conn.close()
    if not row:
        raise SystemExit(f"No EPUB cached for book {book_id}")
    return build_chapters_from_epub(row[0])


def translations_for_book(
    book_id: int, target_language: str
) -> dict[int, tuple[list[str], str | None]]:
    conn = _conn()
    rows = conn.execute(
        "SELECT chapter_index, paragraphs, title_translation "
        "FROM translations WHERE book_id=? AND target_language=? "
        "ORDER BY chapter_index",
        (book_id, target_language),
    ).fetchall()
    conn.close()
    return {ci: (json.loads(p), tt) for ci, p, tt in rows}


def list_books_with_translations(target_language: str) -> list[int]:
    conn = _conn()
    rows = conn.execute(
        "SELECT DISTINCT book_id FROM translations "
        "WHERE target_language=? ORDER BY book_id",
        (target_language,),
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]


def book_source_language(book_id: int, ov: dict) -> str:
    if ov.get("source_language"):
        return ov["source_language"]
    conn = _conn()
    row = conn.execute(
        "SELECT languages FROM books WHERE id=?", (book_id,)
    ).fetchone()
    conn.close()
    if row and row[0]:
        try:
            langs = json.loads(row[0])
            if langs:
                return langs[0].lower()
        except (json.JSONDecodeError, AttributeError):
            pass
    return ""


# ---------- Core check -------------------------------------------------------


def paragraphs(text: str) -> list[str]:
    return [p for p in text.split("\n\n") if p.strip()]


def check_alignment(book_id: int, target_language: str) -> list[dict]:
    chapters = chapters_from_db(book_id)
    trans = translations_for_book(book_id, target_language)
    ov = get_override(book_id)
    src_lang = book_source_language(book_id, ov)
    is_cue = get_detector(src_lang)
    issues: list[dict] = []

    def add(kind: str, chapter: int, title: str, **detail) -> None:
        issues.append(
            {
                "kind": kind,
                "severity": SEVERITY_BY_KIND.get(kind, "warning"),
                "chapter": chapter,
                "title": title,
                **detail,
            }
        )

    for idx, chap in enumerate(chapters):
        src_paras = paragraphs(chap.text)
        if idx not in trans:
            add(
                "missing_translation",
                idx,
                chap.title,
                detail=f"no translations row for chapter_index={idx}",
            )
            continue

        tr_paras, title_tr = trans[idx]

        if title_tr is None:
            add("title_translation_missing", idx, chap.title, detail="title_translation is NULL")

        if len(src_paras) != len(tr_paras):
            add(
                "paragraph_count_drift",
                idx,
                chap.title,
                detail=f"src={len(src_paras)} paragraphs, translated={len(tr_paras)}",
            )

        for pi, (sp, tp) in enumerate(zip(src_paras, tr_paras)):
            src_lines = [l for l in sp.split("\n") if l.strip()]
            tr_lines = [l for l in tp.split("\n") if l.strip()]
            verse = classify_paragraph(book_id, idx, pi, sp)

            if verse and len(src_lines) != len(tr_lines):
                add(
                    "stanza_line_drift",
                    idx,
                    chap.title,
                    paragraph=pi,
                    detail=f"src={len(src_lines)} lines, translated={len(tr_lines)}",
                )
            elif (
                (not verse)
                and len(src_lines) >= 4
                and len(tr_lines) >= 2  # skip reflowed prose where translator merged to 1 line
                and abs(len(src_lines) - len(tr_lines)) >= 1
            ):
                add(
                    "paragraph_line_count_drift",
                    idx,
                    chap.title,
                    paragraph=pi,
                    detail=f"src={len(src_lines)} lines, translated={len(tr_lines)} "
                           f"(possible Opus line drop)",
                )

            sp_lines_raw = sp.split("\n")
            tp_lines_raw = tp.split("\n")
            for li, src_line in enumerate(sp_lines_raw):
                if not is_cue(src_line):
                    continue
                if li >= len(tp_lines_raw):
                    add(
                        "speaker_cue_missing",
                        idx,
                        chap.title,
                        paragraph=pi,
                        line=li,
                        detail=f"src cue {src_line.strip()!r} has no translated line",
                    )
                    continue
                if not is_translated_cue(tp_lines_raw[li], target_language):
                    add(
                        "speaker_cue_not_translated",
                        idx,
                        chap.title,
                        paragraph=pi,
                        line=li,
                        detail=f"src {src_line.strip()!r} → tr {tp_lines_raw[li].strip()!r}",
                    )

    return issues


# ---------- Output formats ---------------------------------------------------


def filter_by_severity(issues: list[dict], threshold: str) -> list[dict]:
    rank = SEVERITY_RANK[threshold]
    return [i for i in issues if SEVERITY_RANK.get(i.get("severity", "warning"), 1) >= rank]


def format_markdown(book_id: int, target_language: str, issues: list[dict]) -> str:
    lines = [f"# Alignment check: book #{book_id}, target={target_language}", ""]
    if not issues:
        lines.append("No alignment issues detected.")
        return "\n".join(lines)

    lines.append(f"**{len(issues)} issues across chapters.**")
    lines.append("")

    by_kind: dict[str, int] = {}
    for i in issues:
        by_kind[i["kind"]] = by_kind.get(i["kind"], 0) + 1
    lines.append("## Summary by kind")
    for k, n in sorted(by_kind.items(), key=lambda x: -x[1]):
        sev = SEVERITY_BY_KIND.get(k, "?")
        lines.append(f"- **{k}** [{sev}]: {n}")
    lines.append("")

    lines.append("## Details (first 30)")
    lines.append("")
    for issue in issues[:30]:
        title = (issue.get("title") or "")[:40]
        para = f" p{issue['paragraph']}" if "paragraph" in issue else ""
        line = f" l{issue['line']}" if "line" in issue else ""
        lines.append(
            f"- ch{issue['chapter']:2d} {title!r:44s}{para}{line} "
            f"[{issue['kind']}]  {issue.get('detail', '')}"
        )
    if len(issues) > 30:
        lines.append(f"...and {len(issues) - 30} more.")
    return "\n".join(lines)


def format_json(book_id: int, target_language: str, issues: list[dict]) -> str:
    return json.dumps(
        {"book_id": book_id, "target_language": target_language, "issues": issues},
        ensure_ascii=False,
        indent=2,
    )


# ---------- CLI --------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Check translation alignment against splitter source paragraphs."
    )
    g = p.add_mutually_exclusive_group(required=False)
    g.add_argument("--book-id", type=int, help="Single book id")
    g.add_argument("--all-books", action="store_true", help="Check all books with translations in the target language")
    p.add_argument("--target-lang", default="zh", help="Target language code (default: zh)")
    p.add_argument("--format", choices=("markdown", "json"), default="markdown")
    p.add_argument(
        "--severity-threshold",
        choices=("info", "warning", "error"),
        default="error",
        help="Issues at or above this severity affect the exit code (default: error)",
    )
    p.add_argument(
        "book_id_pos",
        nargs="?",
        type=int,
        help="Deprecated: positional book id alias for --book-id",
    )
    p.add_argument(
        "target_lang_pos",
        nargs="?",
        help="Deprecated: positional target language alias for --target-lang",
    )
    args = p.parse_args(argv)

    book_ids: list[int]
    target_language = args.target_lang
    if args.all_books:
        book_ids = list_books_with_translations(target_language)
        if not book_ids:
            print(f"No books with translations in target_language={target_language}")
            return 0
    elif args.book_id is not None:
        book_ids = [args.book_id]
    elif args.book_id_pos is not None:
        book_ids = [args.book_id_pos]
        if args.target_lang_pos:
            target_language = args.target_lang_pos
    else:
        p.error("must pass --book-id N or --all-books")

    overall_exit = 0
    for book_id in book_ids:
        try:
            issues = check_alignment(book_id, target_language)
        except SystemExit as e:
            print(f"# {e}", file=sys.stderr)
            overall_exit = max(overall_exit, 2)
            continue
        gating = filter_by_severity(issues, args.severity_threshold)
        if args.format == "json":
            print(format_json(book_id, target_language, issues))
        else:
            print(format_markdown(book_id, target_language, issues))
            print()
        if gating:
            overall_exit = max(overall_exit, 1)

    return overall_exit


if __name__ == "__main__":
    sys.exit(main())
