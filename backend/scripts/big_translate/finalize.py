#!/usr/bin/env python3
"""Finalize a translated book:

  1. Export every cached (chapter, paragraph) row to
     `data/translations/book_<id>_<lang>.json`.
  2. `git add` + `git commit` the JSON file.
  3. Push the branch. (Current branch, not main — normally
     feat/multi-book-translator.)
  4. POST the exported entries to the prod import endpoint if
     BACKEND_URL and ADMIN_JWT env vars are both set.
  5. Mark the book as `done` in state.json and commit that update
     too.

Idempotent: running twice on the same book is safe — the JSON is
re-written, the git commit only fires if there's a diff, and the
prod import overwrites.

Usage:
    BACKEND_URL=https://api.example.com/api  ADMIN_JWT=eyJ... \\
    PYTHONPATH=backend backend/venv/bin/python \\
        backend/scripts/big_translate/finalize.py --book-id 1342 --lang zh
"""
import argparse
import asyncio
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent.parent
REPO = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from services.book_chapters import split_with_html_preference  # noqa: E402
from services.db import (  # noqa: E402
    DB_PATH, get_cached_book, get_cached_translation_with_meta, init_db,
)


STATE_PATH = HERE / "state.json"
EXPORT_DIR = REPO / "data" / "translations"


async def export_book(book_id: int, lang: str) -> Path:
    """Write book_<id>_<lang>.json with every cached translation."""
    await init_db()
    book = await get_cached_book(book_id)
    if not book or not book.get("text"):
        raise SystemExit(f"book {book_id} not cached")

    chapters = await split_with_html_preference(book_id, book["text"])
    entries = []
    for idx, ch in enumerate(chapters):
        if not ch.text.strip():
            continue
        cached = await get_cached_translation_with_meta(book_id, idx, lang)
        if not cached:
            continue
        entries.append({
            "book_id": book_id,
            "chapter_index": idx,
            "target_language": lang,
            "paragraphs": cached["paragraphs"],
            "provider": cached.get("provider") or "claude-code",
            "model": cached.get("model") or "claude-opus-4-7",
            "title_translation": cached.get("title_translation"),
        })

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = EXPORT_DIR / f"book_{book_id}_{lang}.json"
    path.write_text(json.dumps({
        "book_id": book_id,
        "title": book.get("title"),
        "authors": book.get("authors"),
        "source_language": (book.get("languages") or [None])[0],
        "target_language": lang,
        "chapters_translated": len(entries),
        "entries": entries,
    }, ensure_ascii=False, indent=2))
    print(f"exported {len(entries)} chapters to {path}")
    return path


def git_commit_and_push(path: Path, book_id: int, title: str | None) -> None:
    """git add + commit; push current branch to origin. No-op if nothing
    to commit (e.g. finalize called twice)."""
    rel = path.relative_to(REPO)
    subprocess.run(["git", "add", str(rel), "backend/scripts/big_translate/state.json"],
                   cwd=REPO, check=True)
    # Check if there's anything to commit.
    diff = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=REPO)
    if diff.returncode == 0:
        print("no git changes to commit (finalize already ran?)")
        return
    title_short = (title or f"book {book_id}")[:80]
    msg = (
        f"chore(translations): finalize book {book_id} — {title_short}\n\n"
        "Generated in-session via Claude Code (see backend/scripts/big_translate/).\n\n"
        "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    )
    subprocess.run(["git", "commit", "-m", msg], cwd=REPO, check=True)
    subprocess.run(["git", "push"], cwd=REPO, check=True)
    print(f"committed + pushed {rel}")


def seed_prod(path: Path) -> None:
    """POST the exported entries to /admin/translations/import if
    BACKEND_URL and ADMIN_JWT are set. Skipped silently otherwise —
    local-only runs are fine."""
    base = os.environ.get("BACKEND_URL")
    token = os.environ.get("ADMIN_JWT")
    if not base or not token:
        print("BACKEND_URL / ADMIN_JWT unset → skipping prod seed")
        return
    data = json.loads(path.read_text())
    entries = data["entries"]
    url = base.rstrip("/") + "/admin/translations/import"
    CHUNK = 25
    imported = 0
    for start in range(0, len(entries), CHUNK):
        chunk = entries[start:start + CHUNK]
        req = urllib.request.Request(
            url,
            data=json.dumps({"entries": chunk}).encode(),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            raise SystemExit(f"seed failed HTTP {e.code}: {e.read().decode()[:300]}")
        imported += payload.get("imported", 0)
    print(f"seeded prod: {imported} rows imported")


def mark_done_in_state(book_id: int) -> None:
    state = json.loads(STATE_PATH.read_text())
    for b in state["books"]:
        if b["id"] == book_id:
            b["status"] = "done"
            break
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2))
    print(f"state.json: marked book {book_id} as done")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--book-id", type=int, required=True)
    parser.add_argument("--lang", required=True)
    parser.add_argument(
        "--no-push", action="store_true",
        help="Skip git commit/push (still exports JSON and seeds prod)",
    )
    parser.add_argument(
        "--no-seed", action="store_true",
        help="Skip prod seed even if env is set",
    )
    args = parser.parse_args()

    book = asyncio.run(get_cached_book(args.book_id))
    title = book.get("title") if book else None

    path = asyncio.run(export_book(args.book_id, args.lang))
    mark_done_in_state(args.book_id)
    if not args.no_push:
        git_commit_and_push(path, args.book_id, title)
    if not args.no_seed:
        seed_prod(path)
    print(f"finalize complete for book {args.book_id} → {args.lang}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
