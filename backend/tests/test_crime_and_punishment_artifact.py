"""CI guard for the fossilized Crime and Punishment: data/books/book_2554.json.

This book is frozen at 8/42 coverage, deliberately. Freezing before the
remaining chapters are translated is the point: a translation made against a
frozen anchor cannot orphan, which is the failure every repair in #2712,
#2713, #2716, #2725 and #2733 existed to undo.

Its eight existing entries needed two different corrections. Seven were
translated against a split that had no leading CONTENTS chapter, so their
indices were one low. The eighth kept its heading as paragraph 0 instead of in
title_translation. No single uniform shift resolved both, so
realign_translations.py correctly declines this book.
"""

from pathlib import Path

from scripts.ingest_book import load_artifact

REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = REPO_ROOT / "data" / "books" / "book_2554.json"
TRANSLATED = [1, 2, 3, 4, 5, 6, 7, 9]


def test_artifact_loads_and_sha_verifies():
    artifact = load_artifact(ARTIFACT)
    assert artifact["book_id"] == 2554
    assert artifact["split"]["chapter_source"] == "epub"


def test_split_matches_the_novels_structure():
    """Two front-matter chapters, Dostoevsky's 39 numbered chapters across six
    parts, and the Epilogue."""
    artifact = load_artifact(ARTIFACT)
    chapters = artifact["chapters"]

    assert len(chapters) == 42
    assert chapters[1]["title"] == "TRANSLATOR’S PREFACE"
    assert chapters[41]["title"] == "EPILOGUE"
    numbered = [c for c in chapters if c["title"].startswith("CHAPTER ")]
    assert len(numbered) == 39


def test_partial_coverage_is_recorded_exactly():
    """The book is frozen ahead of its translation; the entries it does have
    must be the eight that exist, at their corrected indices."""
    artifact = load_artifact(ARTIFACT)
    entries = artifact["translations"]["zh"]["chapters"]

    assert [e["index"] for e in entries] == TRANSLATED


def test_every_existing_entry_is_paragraph_aligned():
    artifact = load_artifact(ARTIFACT)
    chapters = {c["index"]: c for c in artifact["chapters"]}

    for entry in artifact["translations"]["zh"]["chapters"]:
        assert len(entry["paragraphs"]) == len(chapters[entry["index"]]["paragraphs"]), (
            f"chapter {entry['index']} is not paragraph-aligned"
        )


def test_the_preface_translation_sits_on_the_preface():
    """Regression for the +1 shift: entry 1 was anchored at index 0, putting
    the translator's preface against the table of contents."""
    artifact = load_artifact(ARTIFACT)
    entry = artifact["translations"]["zh"]["chapters"][0]

    assert entry["index"] == 1
    assert artifact["chapters"][1]["title"] == "TRANSLATOR’S PREFACE"
    assert entry["title_translation"] == "译者序"


def test_no_entry_opens_with_its_own_heading():
    """Entry 9 kept '第一章' as paragraph 0; it belongs in title_translation."""
    artifact = load_artifact(ARTIFACT)

    for entry in artifact["translations"]["zh"]["chapters"]:
        title = (entry.get("title_translation") or "").strip()
        assert title, f"chapter {entry['index']} has no title translation"
        assert entry["paragraphs"][0].strip() != title
