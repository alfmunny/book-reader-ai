"""CI guard for the fossilized Moby Dick: data/books/book_2701.json.

Two independent off-by-ones cancelled each other in the paragraph *count*
while leaving every paragraph inside 101 chapters anchored one position wrong:

  * Gutenberg's EPUB marks each anchor with `<a id="…"><!-- H2 anchor --></a>`.
    `_html_inline_text` recursed into the comment node and collected its text,
    so 137 chapters gained a trailing "H2 anchor" paragraph.
  * The translator prepended each chapter's heading as paragraph 0, duplicating
    the `title_translation` field.

Source +1 and translation +1 summed to a delta of zero, so a count-based check
saw 101 healthy chapters. Freezing would have fossilized the misalignment
silently — the exact failure #2624 exists to prevent. These tests pin the
repaired state.
"""

import re
from pathlib import Path

from scripts.ingest_book import load_artifact

REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = REPO_ROOT / "data" / "books" / "book_2701.json"
COMMENT_ARTIFACT = re.compile(r"\s*[Hh][1-6]\s+anchor\s*")
TRANSLATED_ARTIFACT = re.compile(r"\s*[Hh][1-6]\s*锚\s*")


def test_moby_dick_artifact_loads_and_sha_verifies():
    artifact = load_artifact(ARTIFACT)
    assert artifact["book_id"] == 2701
    assert artifact["split"]["chapter_source"] == "epub"
    assert len(artifact["chapters"]) == 138


def test_no_chapter_carries_the_html_comment_artifact():
    """`<!-- H2 anchor -->` is markup. It must never reach a frozen chapter."""
    artifact = load_artifact(ARTIFACT)

    for chapter in artifact["chapters"]:
        offenders = [p for p in chapter["paragraphs"] if COMMENT_ARTIFACT.fullmatch(p)]
        assert not offenders, f"chapter {chapter['index']} kept a comment artifact"


def test_no_translation_carries_the_artifact_or_a_duplicated_heading():
    """The translator rendered the artifact once as 'H2 锚' and prepended each
    chapter heading; neither belongs in the paragraph stream."""
    artifact = load_artifact(ARTIFACT)
    chapters = {c["index"]: c for c in artifact["chapters"]}

    for entry in artifact["translations"]["zh"]["chapters"]:
        assert not [p for p in entry["paragraphs"] if TRANSLATED_ARTIFACT.fullmatch(p)]
        title = re.sub(r"\s+", "", entry.get("title_translation") or "")
        first = re.sub(r"\s+", "", entry["paragraphs"][0])
        assert not (title and first and first in title), (
            f"chapter {entry['index']} still opens with its own heading"
        )
        assert len(entry["paragraphs"]) == len(chapters[entry["index"]]["paragraphs"])


def test_every_chapter_is_translated_and_titled():
    artifact = load_artifact(ARTIFACT)
    entries = artifact["translations"]["zh"]["chapters"]

    assert [e["index"] for e in entries] == list(range(138))
    assert all(e.get("title_translation") for e in entries)


def test_headings_that_were_not_already_titles_were_kept_in_the_title():
    """Three chapters carried a subtitle as a second leading paragraph. It was
    appended to title_translation rather than dropped, so no text was lost."""
    artifact = load_artifact(ARTIFACT)
    by_index = {e["index"]: e for e in artifact["translations"]["zh"]["chapters"]}

    for index in (101, 109, 137):
        assert " / " in by_index[index]["title_translation"], (
            f"chapter {index} lost its appended subtitle"
        )
