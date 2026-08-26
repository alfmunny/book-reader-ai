"""CI guard for the fossilized Pride and Prejudice: data/books/book_1342.json.

Two things make this book unusual.

The stored EPUB is the 1894 George Allen illustrated edition, and its
extraction is materially worse than the plain text: the decorative drop-cap is
lost so every chapter loses its opening letter, plate copyright lines land as
paragraphs, and illustration captions bleed into chapter titles. #1342 is
therefore pinned to the plain-text path in chapter_split_overrides.

It was also a *phantom freeze*: the 2026-08-06 batch wrote book_freeze and
book_chapters rows but its artifact never reached git, so a rebuild from
data/ would have lost the book. The committed artifact reproduces the frozen
split byte-for-byte.
"""

import re
from pathlib import Path

from scripts.ingest_book import load_artifact

REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = REPO_ROOT / "data" / "books" / "book_1342.json"


def test_artifact_loads_and_records_the_text_split():
    artifact = load_artifact(ARTIFACT)
    assert artifact["book_id"] == 1342
    assert artifact["split"]["chapter_source"] == "text"
    assert len(artifact["chapters"]) == 61, "Austen's novel is 61 chapters"


def test_chapter_titles_are_free_of_illustration_captions():
    """The illustrated EPUB produced titles like 'Covering a screen. CHAPTER
    VIII.' — a plate caption glued to the heading."""
    artifact = load_artifact(ARTIFACT)

    for chapter in artifact["chapters"]:
        title = chapter["title"].strip()
        assert re.fullmatch(r"(?i)chapter\s+[IVXLC]+\.?", title), (
            f"chapter {chapter['index']} has a polluted title: {title!r}"
        )


def test_chapter_openings_keep_their_first_letter():
    """Regression: losing the drop-cap turned 'It is a truth…' into
    'IT is a truth…' and 'Mr. Bennet was…' into 'R. BENNET was…'."""
    artifact = load_artifact(ARTIFACT)
    chapters = artifact["chapters"]

    assert chapters[0]["paragraphs"][0].startswith("It is a truth universally")
    assert chapters[1]["paragraphs"][0].startswith("Mr. Bennet was among the")


def test_the_one_genuine_plate_line_is_kept_and_translated():
    """The Gutenberg plain text carries a single plate copyright line, and the
    translator rendered it — so it is aligned content, not an artifact. The
    illustrated EPUB scattered further copies; those are what the text pin
    avoids."""
    artifact = load_artifact(ARTIFACT)
    located = [
        (c["index"], i)
        for c in artifact["chapters"]
        for i, p in enumerate(c["paragraphs"])
        if "Copyright 1894" in p
    ]
    assert len(located) == 1

    chapter_index, paragraph_index = located[0]
    entry = artifact["translations"]["zh"]["chapters"][chapter_index]
    assert entry["paragraphs"][paragraph_index].strip()


def test_zh_translation_is_complete_and_aligned():
    artifact = load_artifact(ARTIFACT)
    entries = artifact["translations"]["zh"]["chapters"]
    chapters = {c["index"]: c for c in artifact["chapters"]}

    assert [e["index"] for e in entries] == list(range(61))
    for entry in entries:
        assert len(entry["paragraphs"]) == len(chapters[entry["index"]]["paragraphs"]), (
            f"chapter {entry['index']} is not paragraph-aligned"
        )


def test_final_colophon_is_one_paragraph_as_in_the_source():
    """The translation had split the printer's colophon across two paragraphs
    while the source keeps it as one with an internal line break."""
    artifact = load_artifact(ARTIFACT)
    last = artifact["translations"]["zh"]["chapters"][60]["paragraphs"][-1]

    assert "\n" in last
    assert len(last.split("\n")) == 2
