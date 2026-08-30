"""Fossilize a book: freeze its chapter split into a committed artifact.

Slice 1 of the fossilized-content architecture (#2624 /
docs/design/local-first-content.md). Chapter boundaries are computed at
request time but translations and annotations are durably keyed to them —
this script makes the split *data*: it writes data/books/book_<id>.json
holding the book's metadata, the frozen chapter split (paragraph arrays),
and every existing translation for the book, merged from both legacy
export conventions and from the book's own previous artifact. The
artifact carries a content_sha256 over the chapters so any later
hand-edit to the frozen split fails loudly at ingest
(scripts/ingest_book.py).

The split is always re-derived from the source text at freeze time, then
passed through scripts/chapter_split_overrides.py, which corrects the
boundaries the splitter invents for a handful of books. Re-freezing with
--force therefore repairs a bad split rather than re-stamping it.

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
import re
import sys
from datetime import date
from pathlib import Path

# Allow `python -m scripts.freeze_book` from backend/.
sys.path.insert(0, str(__file__).rsplit("/backend/", 1)[0] + "/backend")

from scripts.chapter_split_overrides import (  # noqa: E402
    apply_overrides,
    part_labels,
    forced_source,
    frontmatter_roles,
    translation_index_map,
)

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
# A title that simply restates the body's opening is usually fine — most books
# repeat the chapter heading as the first line. It is a *fabricated* title when
# it is long, because then it is a truncated sentence the splitter lifted from
# the prose rather than a heading it found. Measured across the frozen corpus:
# legitimate repeats run to 13 characters ("Chapter XVIII"), while City of God's
# 126 invented titles start at 49. The threshold sits in that gap.
FABRICATED_TITLE_MIN_CHARS = 40
# The splitter prefixes some titles with the enclosing section ("PART TWO — …");
# stripping it is what exposes A Room with a View's invented chapter.
_SECTION_PREFIX = re.compile(r"^(PART|BOOK|VOLUME)\s+[A-Z0-9IVXL]+\s*[—–-]\s*", re.I)


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


def _is_fabricated_title(title: str, paragraphs: list[str]) -> bool:
    """True when the title is a long chunk of the chapter's own opening text.

    The signature of a split made where no heading exists: having found nothing
    to name the chapter with, the splitter names it after the prose it starts
    with. Catches City of God #45304 (126 of 133 chapters) and the boundary
    invented inside A Room with a View #2641."""
    if not paragraphs:
        return False
    normalised = _SECTION_PREFIX.sub("", re.sub(r"\s+", " ", title or "").strip())
    if len(normalised) < FABRICATED_TITLE_MIN_CHARS:
        return False
    return re.sub(r"\s+", " ", paragraphs[0]).strip().startswith(normalised)


def mechanical_audit(chapters: list[dict]) -> list[str]:
    """Cheap pre-filter for obviously-broken chapters. Returns human-readable
    findings; any finding blocks the freeze unless --force.

    This catches shapes, never meaning: a boundary in the wrong *place* between
    two healthy-looking chapters is invisible here, which is what --audited-by
    attests that a human checked."""
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
        if _is_fabricated_title(ch["title"], ch["paragraphs"]):
            problems.append(
                "title is the opening of its own text — the splitter found no "
                "heading here and named the chapter after its prose"
            )
        if problems:
            findings.append(
                f"chapter {ch['index']} ({ch['title']!r}): " + ", ".join(problems)
            )
    return findings


def _load_sources(
    book_id: int, books_dir: Path | None = None
) -> tuple[dict[str, dict[int, dict]], dict[str, dict[int, dict]],
           dict[str, dict[int, dict]]]:
    """Read this book's translations, kept separate by source.

    Returns (artifact, convention_b, convention_a), each {lang: {index: entry}}.
    They stay apart because they are not in the same index space: the artifact's
    indices are already corrected, the legacy conventions' are raw. The caller
    maps the legacy two and only then merges, lowest priority first — artifact,
    Convention B, Convention A (DB export wins).

    Each entry carries `_source`, the filename it came from, so the caller can
    name it when one overrides another.
    """
    artifact: dict[str, dict[int, dict]] = {}
    convention_b: dict[str, dict[int, dict]] = {}
    convention_a: dict[str, dict[int, dict]] = {}

    def _absorb(target, entries: list[dict], lang: str, source_label: str):
        by_index = target.setdefault(lang, {})
        for e in entries:
            by_index[e["chapter_index"]] = {**e, "_source": source_label}

    # The book's own artifact first — lowest priority, but it must be read.
    # A re-freeze that repairs a split has to carry forward translations that
    # exist nowhere else: Hamlet #1524's single chapter lives only here, and
    # dropping it would be exactly the silent loss of paid work #2634 forbids.
    artifact_path = (books_dir / f"book_{book_id}.json") if books_dir else None
    if artifact_path is not None and artifact_path.exists():
        existing = json.loads(artifact_path.read_text())
        for lang, block in sorted(existing.get("translations", {}).items()):
            _absorb(
                artifact,
                [
                    {
                        "chapter_index": c["index"],
                        "paragraphs": c["paragraphs"],
                        "title_translation": c.get("title_translation"),
                        "provider": block.get("provider"),
                        "model": block.get("model"),
                    }
                    for c in block.get("chapters", [])
                ],
                lang,
                artifact_path.name,
            )

    for path in sorted(LEGACY_DIR_B.glob(f"{book_id}_*.json")):
        lang = path.stem.split("_", 1)[1]
        _absorb(convention_b, json.loads(path.read_text()), lang, path.name)
    for path in sorted(LEGACY_DIR_A.glob(f"book_{book_id}_*.json")):
        lang = path.stem.split("_", 2)[2]
        wrapper = json.loads(path.read_text())
        _absorb(convention_a, wrapper["entries"], lang, path.name)
    return artifact, convention_b, convention_a


def _remap(
    merged: dict[str, dict[int, dict]], index_map: dict[int, int]
) -> dict[str, dict[int, dict]]:
    """Move entries from raw chapter indices onto the corrected split's.

    Entries a merge folded together are joined in raw-index order — the order
    their chapters' text was merged in. Indices the map does not cover are left
    alone so the caller's range check still reports them."""
    remapped: dict[str, dict[int, dict]] = {}
    for lang, by_index in merged.items():
        grouped: dict[int, list[dict]] = {}
        for raw in sorted(by_index):
            grouped.setdefault(index_map.get(raw, raw), []).append(by_index[raw])
        remapped[lang] = {
            new: (
                group[0] if len(group) == 1
                else {**group[0],
                      "paragraphs": [p for e in group for p in e["paragraphs"]]}
            )
            for new, group in grouped.items()
        }
    return remapped


def build_translations(
    book_id: int, num_chapters: int, chapters: list[dict],
    books_dir: Path | None = None, index_map: dict[int, int] | None = None,
) -> tuple[dict, list[str], list[str]]:
    """Assemble the artifact's translations block from legacy exports and,
    when `books_dir` is given, the book's own existing artifact.

    `index_map` (from chapter_split_overrides.translation_index_map) moves
    entries onto the corrected split when a split override merged chapters —
    without it, a repair that removes a chapter orphans every translation
    after it.

    Returns (translations, warnings, errors). Out-of-range and
    paragraph-count-mismatched entries are ERRORS, never dropped and
    never written (#2634): translations were paid for and audited — a
    stale anchor means the splitter moved underneath them, and
    fossilizing the wrong index is permanent. The fix is realignment
    (scripts/realign_translations.py), not exclusion."""
    artifact, convention_b, convention_a = _load_sources(book_id, books_dir)
    # Only the legacy conventions are mapped. The artifact was written by the
    # previous freeze, which had already applied the overrides, so its indices
    # are corrected already — mapping them again shifts them by the merge a
    # second time, once per re-freeze (#2745).
    if index_map is not None:
        convention_b = _remap(convention_b, index_map)
        convention_a = _remap(convention_a, index_map)

    # Merge in priority order, now that all three are in the corrected space.
    merged: dict[str, dict[int, dict]] = {}
    warnings: list[str] = []
    for source, authoritative in ((artifact, False), (convention_b, False),
                                  (convention_a, True)):
        for lang, by_index in sorted(source.items()):
            target = merged.setdefault(lang, {})
            for idx in sorted(by_index):
                entry = by_index[idx]
                if idx in target and not authoritative:
                    continue
                if idx in target:
                    warnings.append(
                        f"{lang} ch{idx}: {entry['_source']} overrides earlier entry"
                    )
                target[idx] = entry
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
    from services.book_chapters import get_chapter_source, split_with_html_preference
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

    # Build-time split: always re-derive from the source text. get_chapters()
    # is the *runtime* resolver and returns the stored chapters for a frozen
    # book, so using it here would make --force re-freeze the very split it was
    # invoked to repair. allow_epub_backfill=False keeps the background EPUB
    # fetch — which deletes the book's translations (#1556) — out of a build step.
    # A book may be pinned to a splitting path when its stored EPUB is the
    # worse input (see scripts/chapter_split_overrides.py).
    pinned = forced_source(book_id)
    if pinned == "text":
        from services.splitter import build_chapters
        raw_chapters = build_chapters(book.get("text") or "")
        chapter_source = "text"
    else:
        raw_chapters = await split_with_html_preference(
            book_id, book.get("text") or "", allow_epub_backfill=False
        )
        chapter_source = await get_chapter_source(book_id)
    if not raw_chapters:
        raise SystemExit(f"Book {book_id} produced no chapters — nothing to freeze.")
    # Built against the raw split, before apply_overrides renumbers it, so
    # translations move onto the corrected indices with their chapters.
    index_map = translation_index_map(book_id, len(raw_chapters))
    raw_chapters = apply_overrides(book_id, raw_chapters)

    # Apparatus chapters carry a role so the reader can collapse them (#2745).
    # It sits outside content_sha256 by design, so marking a chapter moves no
    # anchor and leaves the frozen split's identity unchanged.
    roles = frontmatter_roles(book_id, raw_chapters)
    # Part/act grouping, declared per book (#2745 Phase 2). Outside
    # content_sha256 for the same reason as `role`.
    parts = part_labels(book_id, raw_chapters)
    chapters = [
        {"index": i, "title": ch.title, "paragraphs": paragraphs_of(ch.text),
         **({"role": roles[i]} if i in roles else {}),
         **({"part": parts[i]} if i in parts else {})}
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

    translations, warnings, errors = build_translations(
        book_id, len(chapters), chapters, books_dir, index_map
    )
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
