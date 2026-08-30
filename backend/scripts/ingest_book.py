"""Ingest a fossilized book artifact into the local database.

Slice 1 of the fossilized-content architecture (#2624 /
docs/design/local-first-content.md). Reads data/books/book_<id>.json
(written by scripts/freeze_book.py), verifies its content_sha256 over the
chapters array — aborting loudly on mismatch, exit code 2, nothing
written — and populates the content tables: the books row (from the
artifact's meta), book_chapters + book_freeze (the frozen split), and
translations for every language in the artifact. Runs in one transaction
per book. Touches ONLY content tables — never annotations, vocabulary,
reading_history, or any other user table.

When to use: after freezing a book, after `git pull` brings new/updated
artifacts, or when rebuilding the content cache from data/ (slice 2's
rebuild script drives this per book).

Example
-------
    cd backend
    python -m scripts.ingest_book --book-id 2229
    python -m scripts.ingest_book --all

Ingest is non-destructive by default (#2631): if the DB holds more
translation rows for a language than the artifact carries, it aborts
with the missing chapter indices instead of deleting them. Pass
--allow-shrink to override deliberately.

Note: a running server holds a process-local chapter cache; restart it
(or wait for the next deploy) to serve freshly ingested content.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

import aiosqlite

# Allow `python -m scripts.ingest_book` from backend/.
sys.path.insert(0, str(__file__).rsplit("/backend/", 1)[0] + "/backend")

REPO_ROOT = Path(__file__).resolve().parents[2]
BOOKS_DIR = REPO_ROOT / "data" / "books"

REQUIRED_KEYS = ("schema_version", "book_id", "meta", "split", "chapters", "translations")


class ArtifactError(Exception):
    """Validation or integrity failure — nothing was written."""


def load_artifact(path: Path) -> dict:
    artifact = json.loads(path.read_text())
    missing = [k for k in REQUIRED_KEYS if k not in artifact]
    if missing:
        raise ArtifactError(f"{path.name}: missing keys {missing}")
    if artifact["schema_version"] != 1:
        raise ArtifactError(
            f"{path.name}: unsupported schema_version {artifact['schema_version']}"
        )
    from scripts.freeze_book import content_sha256
    actual = content_sha256(artifact["chapters"])
    expected = artifact["split"]["content_sha256"]
    if actual != expected:
        raise ArtifactError(
            f"{path.name}: content_sha256 mismatch — chapters were modified "
            f"after freezing (expected {expected[:12]}…, got {actual[:12]}…). "
            f"A frozen split must not be hand-edited; re-freeze deliberately "
            f"with freeze_book.py --force if this is intentional."
        )
    return artifact


async def ingest(artifact: dict, db_path: str, *, allow_shrink: bool = False) -> dict:
    """Write one artifact into the DB in a single transaction.
    Returns a summary dict.

    Shrink guard (#2631): if the DB holds more translation rows for a
    language than the artifact carries, the per-language replace would
    silently delete DB-only rows (exactly how 118 chapters sat unexported
    for four months, #2626). Ingest aborts with the missing chapter
    indices unless allow_shrink is passed."""
    book_id = artifact["book_id"]
    meta = artifact["meta"]
    split = artifact["split"]
    chapters = artifact["chapters"]

    async with aiosqlite.connect(db_path) as db:
        try:
            async with db.execute(
                "SELECT source FROM books WHERE id = ?", (book_id,)
            ) as cur:
                existing = await cur.fetchone()
            if existing and existing[0] == "upload":
                raise ArtifactError(
                    f"book {book_id} exists as an uploaded book — refusing to clobber"
                )

            if existing:
                # UPDATE, never DELETE+INSERT — INSERT OR REPLACE would fire
                # ON DELETE CASCADE and wipe translations/annotations (#1703).
                # books.text is left as-is: frozen books serve from
                # book_chapters, and raw text is re-fetchable by ID.
                await db.execute(
                    """UPDATE books SET title=?, authors=?, languages=?,
                       subjects=?, download_count=?, cover=? WHERE id=?""",
                    (meta["title"], json.dumps(meta["authors"]),
                     json.dumps(meta["languages"]), json.dumps(meta["subjects"]),
                     meta["download_count"], meta["cover"], book_id),
                )
            else:
                await db.execute(
                    """INSERT INTO books
                       (id, title, authors, languages, subjects,
                        download_count, cover, text, images)
                       VALUES (?, ?, ?, ?, ?, ?, ?, '', '[]')""",
                    (book_id, meta["title"], json.dumps(meta["authors"]),
                     json.dumps(meta["languages"]), json.dumps(meta["subjects"]),
                     meta["download_count"], meta["cover"]),
                )

            await db.execute("DELETE FROM book_chapters WHERE book_id=?", (book_id,))
            await db.executemany(
                "INSERT INTO book_chapters (book_id, chapter_index, title, text, role, part) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                [(book_id, c["index"], c["title"], "\n\n".join(c["paragraphs"]), c.get("role"),
                  c.get("part"))
                 for c in chapters],
            )
            await db.execute(
                """INSERT OR REPLACE INTO book_freeze
                   (book_id, splitter, chapter_source, frozen_at, audited_by,
                    content_sha256)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (book_id, split["splitter"], split["chapter_source"],
                 split["frozen_at"], split["audited_by"], split["content_sha256"]),
            )

            # Replace rows per artifact language. Languages in the DB but not
            # in the artifact are left alone until slice 4 removes the live
            # translation write path; then ingest becomes the only writer.
            n_translations = 0
            for lang, block in artifact["translations"].items():
                if not allow_shrink:
                    async with db.execute(
                        "SELECT chapter_index FROM translations "
                        "WHERE book_id=? AND target_language=?",
                        (book_id, lang),
                    ) as cur:
                        db_indices = {r[0] for r in await cur.fetchall()}
                    artifact_indices = {e["index"] for e in block["chapters"]}
                    missing = sorted(db_indices - artifact_indices)
                    if len(artifact_indices) < len(db_indices):
                        raise ArtifactError(
                            f"book {book_id} lang {lang!r}: DB has "
                            f"{len(db_indices)} row(s) but the artifact carries "
                            f"only {len(artifact_indices)} — refusing to delete "
                            f"DB-only translations (missing chapter_index: "
                            f"{missing}). Re-freeze so the artifact is complete, "
                            f"or pass --allow-shrink to override."
                        )
                await db.execute(
                    "DELETE FROM translations WHERE book_id=? AND target_language=?",
                    (book_id, lang),
                )
                await db.executemany(
                    """INSERT INTO translations
                       (book_id, chapter_index, target_language, paragraphs,
                        provider, model, title_translation)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    [(book_id, e["index"], lang, json.dumps(e["paragraphs"]),
                      block.get("provider"), block.get("model"),
                      e.get("title_translation"))
                     for e in block["chapters"]],
                )
                n_translations += len(block["chapters"])
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    return {
        "book_id": book_id,
        "title": meta["title"],
        "chapters": len(chapters),
        "translated_chapters": n_translations,
        "languages": sorted(artifact["translations"].keys()),
    }


async def run(paths: list[Path], db_path: str, *, allow_shrink: bool = False) -> list[dict]:
    summaries = []
    for path in paths:
        artifact = load_artifact(path)
        summary = await ingest(artifact, db_path, allow_shrink=allow_shrink)
        print(f"Ingested book {summary['book_id']} ({summary['title']!r}): "
              f"{summary['chapters']} chapters, "
              f"{summary['translated_chapters']} translated chapters "
              f"({', '.join(summary['languages']) or 'no translations'})")
        summaries.append(summary)
    return summaries


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--book-id", type=int)
    group.add_argument("--all", action="store_true",
                       help="Ingest every artifact under data/books/")
    parser.add_argument("--allow-shrink", action="store_true",
                        help="Permit an artifact to replace a language with "
                             "fewer rows than the DB holds (#2631 guard)")
    args = parser.parse_args(argv)

    from services.db import DB_PATH
    if args.all:
        paths = sorted(BOOKS_DIR.glob("book_*.json"))
        if not paths:
            print(f"No artifacts under {BOOKS_DIR}", file=sys.stderr)
            raise SystemExit(1)
    else:
        paths = [BOOKS_DIR / f"book_{args.book_id}.json"]
        if not paths[0].exists():
            print(f"No artifact at {paths[0]}", file=sys.stderr)
            raise SystemExit(1)

    try:
        asyncio.run(run(paths, DB_PATH, allow_shrink=args.allow_shrink))
    except ArtifactError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(2)
    print("Reminder: a running server holds a process-local chapter cache — "
          "restart it to serve the ingested content.")


if __name__ == "__main__":
    main()
