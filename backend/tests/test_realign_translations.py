"""Tests for scripts/realign_translations.py (#2634).

Covers: uniform-shift detection (including the real Moby Dick +2 case
from the committed pre-realign backup), non-uniform drift refusal,
mapping application with provenance preserved, and the never-delete
invariant.
"""

import json
from pathlib import Path

import pytest

from scripts.realign_translations import (
    apply_mapping,
    detect_shift,
    score_shift,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
MOBY_BACKUP = (REPO_ROOT / "data" / "translations"
               / "_backup_book_2701_zh_pre_realign_20260425_101251.json")


def _entries(counts: dict[int, int]) -> list[dict]:
    """Build synthetic entries: old chapter_index → paragraph count."""
    return [
        {"chapter_index": idx, "target_language": "zh",
         "paragraphs": [f"p{i}" for i in range(n)],
         "provider": "claude-code", "model": "claude-opus-4-7",
         "title_translation": f"T{idx}"}
        for idx, n in sorted(counts.items())
    ]


def test_detects_uniform_positive_shift():
    """A +2 frontmatter prepend: every entry realigns to 100% agreement."""
    entries = _entries({0: 5, 1: 8, 2: 3})
    src_counts = {0: 99, 1: 99, 2: 5, 3: 8, 4: 3}  # two new leading chapters
    best, mapping = detect_shift(entries, src_counts)
    assert best.shift == 2
    assert best.resolves
    assert mapping == {0: 2, 1: 3, 2: 4}


def test_detects_uniform_negative_shift():
    entries = _entries({2: 5, 3: 8})
    src_counts = {0: 5, 1: 8}
    best, mapping = detect_shift(entries, src_counts)
    assert best.shift == -2
    assert best.resolves
    assert mapping == {2: 0, 3: 1}


def test_zero_shift_when_already_aligned():
    entries = _entries({0: 4, 1: 6})
    src_counts = {0: 4, 1: 6}
    best, _ = detect_shift(entries, src_counts)
    assert best.shift == 0 and best.resolves


def test_non_uniform_drift_is_reported_not_fixed():
    """Chapters merged/split mid-book: no shift resolves, resolves=False —
    the tool must escalate, not guess."""
    entries = _entries({0: 5, 1: 8, 2: 300})   # ch2 doesn't fit anywhere
    src_counts = {0: 5, 1: 8, 2: 3}
    best, _ = detect_shift(entries, src_counts)
    assert best.shift == 0
    assert not best.resolves
    assert best.residuals == [(2, 300, 3)]


def test_out_of_range_after_shift_does_not_resolve():
    entries = _entries({0: 5, 1: 8})
    src_counts = {1: 5}  # only shift +1 matches ch0, but ch1 falls off the end
    best, _ = detect_shift(entries, src_counts)
    assert not best.resolves
    assert best.out_of_range


def test_ambiguous_tie_refuses_to_guess():
    """Shifts +1 and -1 both give one match — the tool must not guess."""
    entries = _entries({1: 5})
    src_counts = {0: 5, 2: 5}
    with pytest.raises(SystemExit, match="Ambiguous"):
        detect_shift(entries, src_counts)


def test_score_shift_counts_matches_residuals_and_range():
    entries = _entries({0: 5, 1: 8, 9: 2})
    src_counts = {0: 5, 1: 7}
    r = score_shift(entries, src_counts, 0)
    assert r.matched == 1
    assert r.residuals == [(1, 8, 7)]
    assert r.out_of_range == [9]
    assert r.total == 3


def test_apply_mapping_preserves_content_and_backs_up(tmp_path):
    """#2634 requirement 5: indices only — paragraphs, title_translation,
    provider, model untouched; original backed up; nothing deleted."""
    wrapper = {
        "book_id": 42, "target_language": "zh", "chapters_translated": 2,
        "entries": _entries({0: 2, 1: 3}),
    }
    path = tmp_path / "book_42_zh.json"
    path.write_text(json.dumps(wrapper, ensure_ascii=False))

    backup = apply_mapping(path, {0: 2, 1: 3}, now="20260806_000000")

    assert backup.exists()
    assert json.loads(backup.read_text()) == wrapper  # original preserved

    after = json.loads(path.read_text())
    assert [e["chapter_index"] for e in after["entries"]] == [2, 3]
    assert len(after["entries"]) == 2  # nothing deleted
    for old, new in ((0, 2), (1, 3)):
        orig = next(e for e in wrapper["entries"] if e["chapter_index"] == old)
        moved = next(e for e in after["entries"] if e["chapter_index"] == new)
        assert moved["paragraphs"] == orig["paragraphs"]
        assert moved["title_translation"] == orig["title_translation"]
        assert moved["provider"] == orig["provider"]
        assert moved["model"] == orig["model"]


def test_moby_dick_plus_two_detected_from_committed_backup():
    """#2634 acceptance: the real pre-realign backup (136 rows, note says
    'All rows shifted +2') must yield shift=+2 against a split whose
    paragraph counts sit two chapters later."""
    rows = json.loads(MOBY_BACKUP.read_text())["rows"]
    assert len(rows) == 136
    # The post-#1055 splitter added 2 leading frontmatter chapters: the
    # source counts for old chapter N live at index N+2.
    src_counts = {r["chapter_index"] + 2: len(r["paragraphs"]) for r in rows}
    src_counts[0] = 10_001  # the two frontmatter chapters match nothing
    src_counts[1] = 10_002

    best, mapping = detect_shift(rows, src_counts)
    assert best.shift == 2
    assert best.resolves
    assert mapping[0] == 2 and mapping[135] == 137
