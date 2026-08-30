"""CI guard for the fossilized Crime and Punishment: data/books/book_2554.json.

This book is frozen at 11/42 coverage, deliberately. Freezing before the
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
# Coverage was 1-11 while the book was frozen ahead of its translation; #2764
# completed it, and re-freezing carried the finished export into the artifact.
TRANSLATED = list(range(42))


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


def test_coverage_is_recorded_exactly():
    """Every chapter is translated, each at its own index and none twice.

    This began as a partial-coverage guard (entries 1-11 while the book was
    frozen ahead of its translation). #2764 finished the translation, so what it
    now guards is completeness — and, as before, that the indices are exactly the
    chapters and not a shifted range."""
    artifact = load_artifact(ARTIFACT)
    entries = artifact["translations"]["zh"]["chapters"]

    assert [e["index"] for e in entries] == TRANSLATED
    assert len(entries) == len(artifact["chapters"])


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
    # By index, not by position: the entry list starts at chapter 0 now that
    # coverage is complete, and this guard is about *which chapter* the preface
    # translation anchors to.
    entry = next(e for e in artifact["translations"]["zh"]["chapters"] if e["index"] == 1)

    assert entry["index"] == 1
    assert artifact["chapters"][1]["title"] == "TRANSLATOR’S PREFACE"
    assert entry["title_translation"] == "译者序"


def test_no_entry_opens_with_its_own_heading():
    """Entry 9 kept '第一章' as paragraph 0; it belongs in title_translation.

    Front matter is exempt. Chapter 0 is a printed contents listing whose first
    English paragraph is literally the word "CONTENTS", so its faithful
    translation 目录 equals the title translation — the heading genuinely is the
    body there, which is the opposite of the duplication this guards against.
    """
    artifact = load_artifact(ARTIFACT)
    apparatus = {c["index"] for c in artifact["chapters"] if c.get("role") == "frontmatter"}

    for entry in artifact["translations"]["zh"]["chapters"]:
        title = (entry.get("title_translation") or "").strip()
        assert title, f"chapter {entry['index']} has no title translation"
        if entry["index"] in apparatus:
            continue
        assert entry["paragraphs"][0].strip() != title


def test_part_one_is_complete():
    """Chapter 8 (Part I, chapter VII) was translated in-session against the
    already-frozen split, so it needed no realignment: it was born aligned.
    That completes Part I — chapters 2-8."""
    artifact = load_artifact(ARTIFACT)
    by_index = {e["index"]: e for e in artifact["translations"]["zh"]["chapters"]}
    chapters = {c["index"]: c for c in artifact["chapters"]}

    assert set(range(2, 9)) <= set(by_index), "Part I is chapters 2-8"
    entry = by_index[8]
    assert entry["title_translation"] == "第一部 第七章"
    assert len(entry["paragraphs"]) == len(chapters[8]["paragraphs"]) == 89


def test_chapters_translated_after_the_freeze_needed_no_realignment():
    """Chapters 8 and 10 were translated against the already-frozen split, so
    they were born aligned. Contrast the eight inherited entries, which needed
    an index shift and a stranded heading moved before they would freeze."""
    artifact = load_artifact(ARTIFACT)
    by_index = {e["index"]: e for e in artifact["translations"]["zh"]["chapters"]}
    chapters = {c["index"]: c for c in artifact["chapters"]}

    for index, expected_title in (
        (8, "第一部 第七章"), (10, "第二部 第二章"), (11, "第二部 第三章"),
    ):
        entry = by_index[index]
        assert entry["title_translation"] == expected_title
        assert entry["paragraphs"][0].strip() != expected_title
        assert len(entry["paragraphs"]) == len(chapters[index]["paragraphs"])
