"""CI guard for the fossilized Great Gatsby: data/books/book_64317.json.

Gatsby (#64317) was translated under the plain-text split, then a real EPUB
arrived and re-split it. The two agree on chapter boundaries and disagree on
paragraphs in 8 of 9 chapters, for two reasons that this artifact resolves:

  * Gutenberg's plain text renders section dividers as rows of dashes, which
    the text splitter counts as paragraphs and the translator copied verbatim.
    The EPUB has them as <hr>. 25 such paragraphs, all pure dashes.
  * Gatsby's boyhood "General Resolves" list is one paragraph of six lines in
    the EPUB and six paragraphs in the plain text.

Meanwhile the database served four chapters from an older, superseded
translation anchored one index too low — Chapter I's Chinese rendered against
the Table of Contents. These tests pin the repaired state (#1393, #2624).
"""

import re
from pathlib import Path

from scripts.ingest_book import load_artifact

REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = REPO_ROOT / "data" / "books" / "book_64317.json"
RULE = re.compile(r"^[-—–_\s]{5,}$")


def test_gatsby_artifact_loads_and_sha_verifies():
    artifact = load_artifact(ARTIFACT)  # raises ArtifactError on any tamper
    assert artifact["book_id"] == 64317
    assert artifact["split"]["chapter_source"] == "epub"


def test_gatsby_has_the_full_nine_chapter_novel_plus_front_matter():
    artifact = load_artifact(ARTIFACT)
    chapters = artifact["chapters"]
    assert len(chapters) == 10
    assert [c["index"] for c in chapters] == list(range(10))
    assert [c["title"] for c in chapters[1:]] == [
        "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX",
    ]


def test_gatsby_zh_translation_is_complete_and_aligned():
    artifact = load_artifact(ARTIFACT)
    entries = artifact["translations"]["zh"]["chapters"]
    chapters = {c["index"]: c for c in artifact["chapters"]}

    assert [e["index"] for e in entries] == list(range(10))
    for e in entries:
        assert len(e["paragraphs"]) == len(chapters[e["index"]]["paragraphs"]), (
            f"chapter {e['index']} is not paragraph-aligned"
        )


def test_gatsby_chapter_one_is_not_anchored_to_the_table_of_contents():
    """Regression: the database served an older translation shifted one index
    down, so Nick Carraway's opening rendered against the Table of Contents."""
    artifact = load_artifact(ARTIFACT)
    source = artifact["chapters"][1]["paragraphs"][0]
    translated = artifact["translations"]["zh"]["chapters"][1]["paragraphs"][0]

    assert source.startswith("In my younger and more vulnerable years")
    assert translated.startswith("在我尚年少而易感之岁月")


def test_gatsby_translation_carries_no_divider_paragraphs():
    """The 25 rows of dashes were plain-text artifacts with no counterpart in
    the EPUB split — and no content, so removing them lost nothing."""
    artifact = load_artifact(ARTIFACT)

    for entry in artifact["translations"]["zh"]["chapters"]:
        assert not [p for p in entry["paragraphs"] if RULE.match(p.strip())]


def test_gatsby_general_resolves_is_one_paragraph_of_six_lines():
    """Matches the EPUB, which sets the list as a single paragraph with
    internal line breaks — the same convention as verse and speaker cues."""
    artifact = load_artifact(ARTIFACT)
    chapter_nine = artifact["translations"]["zh"]["chapters"][9]

    resolves = [p for p in chapter_nine["paragraphs"] if p.startswith("*")]
    assert len(resolves) == 1
    lines = resolves[0].split("\n")
    assert len(lines) == 6
    assert "不再吸烟或嚼烟" in lines[1]
    assert "待父母更好" in lines[5]
