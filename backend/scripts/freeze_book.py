"""Fossilize a book: freeze its chapter split into a committed artifact.

Slice 1 of the fossilized-content architecture (#2624 /
docs/design/local-first-content.md). Chapter boundaries are computed at
request time but translations and annotations are durably keyed to them —
this script makes the split *data*: it writes data/books/book_<id>.json
holding the book's metadata, the frozen chapter split (paragraph arrays),
and every existing translation for the book, merged from both legacy
export conventions. The artifact carries a content_sha256 over the
chapters so any later hand-edit to the frozen split fails loudly at
ingest (scripts/ingest_book.py).

Freezing is a one-way door per book: once annotations anchor to a frozen
split, re-splitting requires migrating them. --audited-by is therefore a
required attestation that a human (or agent session) has reviewed the
chapter list against the source. A mechanical pre-filter flags obvious
junk chapters (TOC fragments, ISBN notices, stray headings) and blocks
the write unless --force is given.

Translation entries that cannot be placed against the current split
(out-of-range index or paragraph-count mismatch) abort the freeze — not
overridable by --force (#2634). They are paid, audited work whose
anchors went stale; realign them first with
scripts/realign_translations.py, then re-run.

When to use: the first time a book acquires something that must stay
aligned (a translation or an annotation), or when resuming the
big_translate pipeline on a book (freeze before translating).

Example
-------
    cd backend
    python -m scripts.freeze_book --book-id 2229 --audited-by alfmunny
    python -m scripts.freeze_book --book-id 2229 --audited-by alfmunny --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

# Allow `python -m scripts.freeze_book` from backend/.
sys.path.insert(0, str(__file__).rsplit("/backend/", 1)[0] + "/backend")

REPO_ROOT = Path(__file__).resolve().parents[2]
BOOKS_DIR = REPO_ROOT / "data" / "books"
# Legacy translation-export conventions absorbed at freeze time
# (docs/design/local-first-content.md "Migration-period behaviour"):
#   A: data/translations/book_<id>_<lang>.json — object-wrapped, exported
#      from the DB (authoritative on conflict)
#   B: backend/data/translations/<id>_<lang>.json — bare-array per-save
#      backups (fills gaps)
LEGACY_DIR_A = REPO_ROOT / "data" / "translations"
LEGACY_DIR_B = REPO_ROOT / "backend" / "data" / "translations"

SCHEMA_VERSION = 1

# Mechanical audit thresholds — the big_translate README "Splitter
# sanity-check" TODO, finally implemented. Signatures of TOC fragments,
# ISBN notices, and stray headings emitted as chapters.
MIN_PARAGRAPHS = 2
MIN_CHARS = 100
MAX_UPPERCASE_RATIO = 0.5


def paragraphs_of(text: str) -> list[str]:
    """Split chapter text into paragraphs the same way big_translate/driver.py
    and the frontend do: blank-line boundaries, blanks dropped, internal
    single \\n line breaks (verse, speaker cues) preserved."""
    return [p for p in (part.strip("\n") for part in text.split("\n\n")) if p.strip()]


def content_sha256(chapters: list[dict]) -> str:
    """Integrity hash over the canonical serialization of the chapters array
    (index, title, paragraphs only). Recomputed by ingest_book.py."""
    canonical = json.dumps(
        [{"index": c["index"], "title": c["title"], "paragraphs": c["paragraphs"]}
         for c in chapters],
        ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def mechanical_audit(chapters: list[dict]) -> list[str]:
    """Cheap pre-filter for obviously-broken chapters. Returns human-readable
    findings; any finding blocks the freeze unless --force."""
    findings: list[str] = []
    for ch in chapters:
        text = "\n\n".join(ch["paragraphs"])
        letters = [c for c in text if c.isalpha()]
        upper_ratio = (
            sum(1 for c in letters if c.isupper()) / len(letters) if letters else 0.0
        )
        problems = []
        if len(ch["paragraphs"]) < MIN_PARAGRAPHS:
            problems.append(f"only {len(ch['paragraphs'])} paragraph(s)")
        if len(text) < MIN_CHARS:
            problems.append(f"only {len(text)} chars")
        if upper_ratio > MAX_UPPERCASE_RATIO:
            problems.append(f"{upper_ratio:.0%} uppercase")
        if problems:
            findings.append(
                f"chapter {ch['index']} ({ch['title']!r}): " + ", ".join(problems)
            )
    return findings


def _load_legacy_entries(book_id: int) -> tuple[dict[str, dict[int, dict]], list[str]]:
    """Read every legacy translation export for this book from both
    conventions. Returns ({lang: {chapter_index: entry}}, warnings).
    Convention A (DB export) wins on conflict; B fills gaps."""
    merged: dict[str, dict[int, dict]] = {}
    warnings: list[str] = []

    def _absorb(entries: list[dict], lang: str, source_label: str, authoritative: bool):
        by_index = merged.setdefault(lang, {})
        for e in entries:
            idx = e["chapter_index"]
            if authoritative or idx not in by_index:
                if idx in by_index and authoritative:
                    warnings.append(
                        f"{lang} ch{idx}: {source_label} overrides earlier entry"
                    )
                by_index[idx] = e

    # Convention B first so A can override on conflict.
    for path in sorted(LEGACY_DIR_B.glob(f"{book_id}_*.json")):
        lang = path.stem.split("_", 1)[1]
        _absorb(json.loads(path.read_text()), lang, path.name, authoritative=False)
    for path in sorted(LEGACY_DIR_A.glob(f"book_{book_id}_*.json")):
        lang = path.stem.split("_", 2)[2]
        wrapper = json.loads(path.read_text())
        _absorb(wrapper["entries"], lang, path.name, authoritative=True)
    return merged, warnings


def build_translations(
    book_id: int, num_chapters: int, chapters: list[dict],
) -> tuple[dict, list[str], list[str]]:
    """Assemble the artifact's translations block from legacy exports.

    Returns (translations, warnings, errors). Out-of-range and
    paragraph-count-mismatched entries are ERRORS, never dropped and
    never written (#2634): translations were paid for and audited — a
    stale anchor means the splitter moved underneath them, and
    fossilizing the wrong index is permanent. The fix is realignment
    (scripts/realign_translations.py), not exclusion."""
    merged, warnings = _load_legacy_entries(book_id)
    result: dict[str, dict] = {}
    errors: list[str] = []
    for lang, by_index in sorted(merged.items()):
        entries = []
        provider = model = None
        for idx in sorted(by_index):
            e = by_index[idx]
            if idx >= num_chapters:
                errors.append(
                    f"{lang} ch{idx}: out of range (book has {num_chapters} chapters)"
                )
                continue
            src_count = len(chapters[idx]["paragraphs"])
            if len(e["paragraphs"]) != src_count:
                errors.append(
                    f"{lang} ch{idx}: paragraph count {len(e['paragraphs'])} "
                    f"!= source {src_count}"
                )
                continue
            provider = provider or e.get("provider")
            model = model or e.get("model")
            entries.append({
                "index": idx,
                "title_translation": e.get("title_translation"),
                "paragraphs": e["paragraphs"],
            })
        if entries:
            result[lang] = {
                "generated_at": None,  # unknown for legacy exports
                "provider": provider,
                "model": model,
                "chapters": entries,
            }
    return result, warnings, errors


async def freeze(book_id: int, audited_by: str, *, force: bool = False,
                 dry_run: bool = False, books_dir: Path = BOOKS_DIR) -> Path | None:
    """Build and write the artifact. Returns the path written, or None on
    dry-run. Raises SystemExit on audit failure or an already-frozen book."""
    from services.book_chapters import get_chapters, get_chapter_source
    from services.db import get_book_freeze, get_cached_book

    existing = await get_book_freeze(book_id)
    if existing and not force:
        raise SystemExit(
            f"Book {book_id} is already frozen ({existing['frozen_at']} by "
            f"{existing['audited_by']}). Re-freezing shifts anchors for existing "
            f"annotations/translations — pass --force only after re-auditing them."
        )

    book = await get_cached_book(book_id)
    if book is None:
        raise SystemExit(f"Book {book_id} is not in the local DB — import it first.")

    raw_chapters = await get_chapters(book_id)
    if not raw_chapters:
        raise SystemExit(f"Book {book_id} produced no chapters — nothing to freeze.")
    chapter_source = await get_chapter_source(book_id)

    chapters = [
        {"index": i, "title": ch.title, "paragraphs": paragraphs_of(ch.text)}
        for i, ch in enumerate(raw_chapters)
    ]

    findings = mechanical_audit(chapters)
    for f in findings:
        print(f"AUDIT: {f}", file=sys.stderr)
    if findings and not force:
        raise SystemExit(
            f"{len(findings)} audit finding(s) — freezing a bad split is worse "
            f"than not freezing. Review, fix the split, or pass --force."
        )

    translations, warnings, errors = build_translations(book_id, len(chapters), chapters)
    for w in warnings:
        print(f"WARN: {w}", file=sys.stderr)
    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        # Deliberately NOT overridable by --force: these entries are paid,
        # audited work whose anchors went stale (#2634). Dropping them or
        # freezing them at the wrong index is permanent data loss either way.
        raise SystemExit(
            f"{len(errors)} translation entry(ies) cannot be placed against the "
            f"current split — nothing written. Run "
            f"`python -m scripts.realign_translations --book-id {book_id} "
            f"--lang <lang>` to detect and apply an index shift, then re-run "
            f"the freeze."
        )

    artifact = {
        "schema_version": SCHEMA_VERSION,
        "book_id": book_id,
        "meta": {
            "title": book.get("title", ""),
            "authors": book.get("authors", []),
            "languages": book.get("languages", []),
            "subjects": book.get("subjects", []),
            "cover": book.get("cover", ""),
            "download_count": book.get("download_count", 0),
        },
        "split": {
            "splitter": "html_preference",
            "chapter_source": chapter_source,
            "frozen_at": date.today().isoformat(),
            "audited_by": audited_by,
            "content_sha256": content_sha256(chapters),
        },
        "chapters": chapters,
        "translations": translations,
    }

    coverage = ", ".join(
        f"{lang}: {len(t['chapters'])}/{len(chapters)}"
        for lang, t in translations.items()
    ) or "none"
    print(f"Book {book_id} ({book.get('title', '')!r}): {len(chapters)} chapters "
          f"[{chapter_source}], translations: {coverage}, "
          f"audit findings: {len(findings)}")

    if dry_run:
        print("Dry run — nothing written.")
        return None

    books_dir.mkdir(parents=True, exist_ok=True)
    out = books_dir / f"book_{book_id}.json"
    out.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {out}")
    return out


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--book-id", type=int, required=True)
    parser.add_argument("--audited-by", required=True,
                        help="Attestation: who reviewed the chapter list against the source")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true",
                        help="Proceed despite audit findings or an existing freeze")
    args = parser.parse_args(argv)
    asyncio.run(freeze(args.book_id, args.audited_by,
                       force=args.force, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
