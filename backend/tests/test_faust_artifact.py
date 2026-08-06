"""CI guard for the first fossilized book: data/books/book_2229.json.

Faust (#2229) is the pilot of the fossilized-content architecture
(#2624). Its owner-audited 28-scene split is permanent; this test keeps
the committed artifact loadable and integrity-checked so any accidental
edit to the frozen chapters fails CI instead of shifting anchors at
ingest time.
"""

from pathlib import Path

from scripts.ingest_book import load_artifact

REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = REPO_ROOT / "data" / "books" / "book_2229.json"


def test_faust_artifact_loads_and_sha_verifies():
    artifact = load_artifact(ARTIFACT)  # raises ArtifactError on any tamper
    assert artifact["book_id"] == 2229
    assert artifact["split"]["audited_by"] == "alfmunny"
    assert artifact["split"]["chapter_source"] == "epub"


def test_faust_artifact_has_the_audited_28_scene_split():
    artifact = load_artifact(ARTIFACT)
    chapters = artifact["chapters"]
    assert len(chapters) == 28
    assert [c["index"] for c in chapters] == list(range(28))
    # Spot-check the owner-audited canonical structure
    # (reports/faust_2229_investigation_2026_04_25.md).
    assert chapters[0]["title"] == "Zueignung"
    assert chapters[3]["title"] == "Nacht"
    assert chapters[27]["title"] == "Kerker"


def test_faust_artifact_zh_translation_is_complete_and_aligned():
    artifact = load_artifact(ARTIFACT)
    zh = artifact["translations"]["zh"]
    entries = zh["chapters"]
    assert [e["index"] for e in entries] == list(range(28))
    by_index = {c["index"]: c for c in artifact["chapters"]}
    for e in entries:
        assert len(e["paragraphs"]) == len(by_index[e["index"]]["paragraphs"])
