"""CI guard over every fossilized artifact in data/books/ (#2624).

Frozen splits are one-way doors: an accidental edit to any committed
artifact's chapters must fail CI (sha mismatch) before it can shift
anchors at ingest. This test discovers artifacts, so each newly frozen
book is guarded without a per-book test file.
"""

import json
from pathlib import Path

import pytest

from scripts.ingest_book import load_artifact

REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = sorted((REPO_ROOT / "data" / "books").glob("book_*.json"))


def test_artifacts_exist():
    assert ARTIFACTS, "data/books/ should hold at least the Faust pilot"


@pytest.mark.parametrize("path", ARTIFACTS, ids=lambda p: p.stem)
def test_artifact_loads_and_sha_verifies(path):
    artifact = load_artifact(path)  # raises ArtifactError on tampered chapters
    assert artifact["book_id"] == int(path.stem.split("_")[1])
    assert artifact["split"]["audited_by"]
    assert artifact["split"]["chapter_source"] in ("epub", "text")


@pytest.mark.parametrize("path", ARTIFACTS, ids=lambda p: p.stem)
def test_artifact_indices_contiguous_and_translations_aligned(path):
    artifact = json.loads(path.read_text())
    chapters = artifact["chapters"]
    assert [c["index"] for c in chapters] == list(range(len(chapters)))
    by_index = {c["index"]: c for c in chapters}
    for lang, block in artifact["translations"].items():
        for e in block["chapters"]:
            assert e["index"] in by_index, f"{lang} ch{e['index']} out of range"
            assert len(e["paragraphs"]) == len(by_index[e["index"]]["paragraphs"]), (
                f"{lang} ch{e['index']}: paragraph count mismatch"
            )


# Book 45304 (City of God) is frozen with 126 of 133 titles lifted from its own
# prose — the splitter never found its BOOK I–XIII structure. Repairing it means
# re-anchoring 133 translated chapters, so it stays as-is pending that decision.
# Every other frozen book must be clean, and this list must only ever shrink.
KNOWN_FABRICATED_TITLES = {45304}


@pytest.mark.parametrize("path", ARTIFACTS, ids=lambda p: p.stem)
def test_no_artifact_gains_a_fabricated_title(path):
    """Guards the audit gate's threshold: a newly frozen book must not carry a
    title the splitter lifted from the chapter's own opening prose."""
    from scripts.freeze_book import _is_fabricated_title

    artifact = json.loads(path.read_text())
    flagged = [
        c["index"] for c in artifact["chapters"]
        if _is_fabricated_title(c["title"], c["paragraphs"])
    ]
    if artifact["book_id"] in KNOWN_FABRICATED_TITLES:
        pytest.skip(f"book {artifact['book_id']}: known, pending a re-split decision")
    assert flagged == [], f"chapters {flagged} are named after their own text"
