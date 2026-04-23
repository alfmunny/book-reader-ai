#!/usr/bin/env python3
"""
Benchmark pretranslate.py on a target book across multiple languages.

Runs each language sequentially, captures per-chapter timing, and writes
a markdown report to reports/pretranslate_benchmark_{book_id}.md.

Usage:
    python scripts/benchmark_pretranslate.py --book-id 2229 --langs de fr
    python scripts/benchmark_pretranslate.py --book-id 2229 --langs de fr zh --force
"""

import argparse
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_DIR = SCRIPT_DIR.parent
REPORTS_DIR = REPO_DIR / "reports"

LANG_NAMES = {
    "de": "German", "fr": "French", "es": "Spanish", "it": "Italian",
    "ru": "Russian", "nl": "Dutch", "pt": "Portuguese", "pl": "Polish",
    "zh": "Chinese", "ja": "Japanese",
}

# Matches lines like:  [3/27] Nacht (2868 words) ... done (42.3s)
CHAPTER_RE = re.compile(
    r'\[\s*(\d+)/(\d+)\]\s+(.+?)\s+\((\d+) words\).*?done \((\d+(?:\.\d+)?)s\)'
)


def run_language(book_id: int, lang: str, force: bool) -> tuple[list[dict], float, str]:
    """Translate one language, return (chapters, wall_time_s, raw_output)."""
    cmd = [
        sys.executable, str(SCRIPT_DIR / "pretranslate.py"),
        "--book-id", str(book_id),
        "--lang", lang,
    ]
    if force:
        cmd.append("--force")

    print(f"\n{'='*60}")
    print(f"  Starting: {LANG_NAMES.get(lang, lang)} ({lang})")
    print(f"{'='*60}")

    t0 = time.time()
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )

    output_lines: list[str] = []
    for line in proc.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
        output_lines.append(line)

    proc.wait()
    wall = time.time() - t0
    full_output = "".join(output_lines)

    chapters: list[dict] = []
    for m in CHAPTER_RE.finditer(full_output):
        chapters.append({
            "index": int(m.group(1)),
            "total": int(m.group(2)),
            "title": m.group(3).strip(),
            "words": int(m.group(4)),
            "seconds": float(m.group(5)),
        })

    return chapters, wall, full_output


def words_per_sec(words: int, seconds: float) -> float:
    return words / seconds if seconds > 0 else 0.0


def format_duration(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m}m {s:02d}s" if m else f"{s}s"


def build_report(book_id: int, book_title: str, lang_results: list[dict]) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines: list[str] = []

    lines += [
        f"# Pre-Translation Benchmark Report",
        f"",
        f"**Book:** #{book_id} — {book_title}  ",
        f"**Date:** {now}  ",
        f"**Provider:** MarianMT (Helsinki-NLP, CPU)  ",
        f"",
        f"---",
        f"",
        f"## Summary",
        f"",
        f"| Language | Chapters | Total Words | Wall Time | Words/sec | Sec/chapter (avg) |",
        f"|----------|----------|-------------|-----------|-----------|-------------------|",
    ]

    for r in lang_results:
        lang = r["lang"]
        lang_name = LANG_NAMES.get(lang, lang)
        chapters = r["chapters"]
        total_words = sum(c["words"] for c in chapters)
        total_secs = sum(c["seconds"] for c in chapters)
        wall = r["wall_time"]
        wps = words_per_sec(total_words, total_secs)
        avg_sec = total_secs / len(chapters) if chapters else 0
        lines.append(
            f"| **{lang_name}** (`{lang}`) "
            f"| {len(chapters)} "
            f"| {total_words:,} "
            f"| {format_duration(wall)} "
            f"| {wps:.1f} "
            f"| {avg_sec:.1f}s |"
        )

    lines += ["", "---", ""]

    for r in lang_results:
        lang = r["lang"]
        lang_name = LANG_NAMES.get(lang, lang)
        chapters = r["chapters"]
        total_words = sum(c["words"] for c in chapters)
        total_secs = sum(c["seconds"] for c in chapters)

        lines += [
            f"## {lang_name} (`{lang}`)",
            f"",
            f"**Total:** {total_words:,} words in {format_duration(total_secs)} "
            f"({words_per_sec(total_words, total_secs):.1f} words/sec wall-clock for translation kernel)",
            f"",
            f"| # | Chapter | Words | Time | Words/sec |",
            f"|---|---------|-------|------|-----------|",
        ]

        for c in chapters:
            wps = words_per_sec(c["words"], c["seconds"])
            lines.append(
                f"| {c['index']} | {c['title']} | {c['words']:,} | {c['seconds']:.1f}s | {wps:.1f} |"
            )

        lines += [
            f"",
            f"> **Slowest:** {max(chapters, key=lambda c: c['seconds'])['title']} "
            f"({max(c['seconds'] for c in chapters):.1f}s)  ",
            f"> **Fastest:** {min(chapters, key=lambda c: c['seconds'])['title']} "
            f"({min(c['seconds'] for c in chapters):.1f}s)",
            f"",
        ]

    lines += [
        "---",
        "",
        "## Notes",
        "",
        "- Timing is wall-clock time for the translation kernel only (excludes DB write).",
        "- `Words/sec` is source-side English word count divided by translation time.",
        "- Model downloads (first run only) are excluded from per-chapter timings.",
        "- MarianMT chunk size cap: 480 tokens — long paragraphs are split and re-joined.",
        "- CPU only; no GPU acceleration.",
        "",
    ]

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark pretranslate across languages.")
    parser.add_argument("--book-id", type=int, required=True)
    parser.add_argument("--langs", nargs="+", required=True)
    parser.add_argument("--force", action="store_true", help="Re-translate even if cached")
    args = parser.parse_args()

    # Resolve book title from DB
    book_title = f"Book #{args.book_id}"
    try:
        import asyncio, aiosqlite, os
        sys.path.insert(0, str(REPO_DIR / "backend"))
        from services.db import DB_PATH
        async def _get_title():
            async with aiosqlite.connect(DB_PATH) as db:
                async with db.execute("SELECT title FROM books WHERE id=?", (args.book_id,)) as cur:
                    row = await cur.fetchone()
                    return row[0] if row else book_title
        book_title = asyncio.run(_get_title())
    except Exception:
        pass

    print(f"\nBenchmark: '{book_title}' (#{args.book_id})")
    print(f"Languages: {', '.join(args.langs)}")
    print(f"Force: {args.force}")

    lang_results: list[dict] = []
    total_start = time.time()

    for lang in args.langs:
        chapters, wall, _ = run_language(args.book_id, lang, args.force)
        lang_results.append({"lang": lang, "chapters": chapters, "wall_time": wall})
        if chapters:
            total_w = sum(c["words"] for c in chapters)
            total_s = sum(c["seconds"] for c in chapters)
            print(f"\n  {LANG_NAMES.get(lang, lang)}: {len(chapters)} chapters, "
                  f"{total_w:,} words, {format_duration(int(total_s))}, "
                  f"{words_per_sec(total_w, total_s):.1f} w/s")
        else:
            print(f"\n  {lang}: no chapters captured (all skipped or error)")

    total_elapsed = time.time() - total_start
    print(f"\nAll languages done in {format_duration(int(total_elapsed))}.")

    REPORTS_DIR.mkdir(exist_ok=True)
    report_path = REPORTS_DIR / f"pretranslate_benchmark_{args.book_id}.md"
    report_path.write_text(build_report(args.book_id, book_title, lang_results))
    print(f"\nReport written to: {report_path}")


if __name__ == "__main__":
    main()
