"""The advisor proposes boundaries; the slicing is ours and must be exact."""
import re
import pytest

from services.split_advisor import build_skeleton, slice_chapters, _valid_boundaries


JAPANESE = "\n".join([
    "序章", "", "むかしむかしあるところに。", "それは長い話でした。", "",
    "第一章", "", "彼は歩きはじめた。", "道は遠かった。", "",
    "第二章", "", "やがて夜になった。", "星が出ていた。",
])


def test_skeleton_finds_headings_in_a_script_the_regexes_cannot_match():
    # book_parser only knows CHAPTER/KAPITEL/PART/roman/all-caps, so a
    # Japanese book collapses to a single chapter. Shape, not vocabulary.
    lines = [t for _, t in build_skeleton(JAPANESE)]
    assert "序章" in lines and "第一章" in lines and "第二章" in lines


def test_skeleton_skips_prose_and_lines_that_are_not_alone():
    text = "第一章\nすぐ次の行なので見出しではない。\n\nThis is an ordinary sentence of prose that runs on and ends with a full stop."
    lines = [t for _, t in build_skeleton(text)]
    assert "第一章" in lines
    assert "すぐ次の行なので見出しではない。" not in lines
    assert not any(t.startswith("This is an ordinary") for t in lines)


def test_boundaries_outside_the_skeleton_are_refused():
    # The model may only choose lines it was shown; anything else is invention.
    raw = [{"line": 5, "title": "Real"}, {"line": 999, "title": "Invented"}]
    kept = _valid_boundaries(raw, allowed={5}, total_lines=50)
    assert kept == [(5, "Real")]


def test_boundaries_are_deduplicated_and_ordered():
    raw = [{"line": 9, "title": "B"}, {"line": 3, "title": "A"}, {"line": 9, "title": "dupe"}]
    assert _valid_boundaries(raw, allowed={3, 9}, total_lines=50) == [(3, "A"), (9, "B")]


def test_malformed_answers_yield_nothing_rather_than_a_bad_split():
    assert _valid_boundaries("not a list", allowed={1}, total_lines=10) == []
    assert _valid_boundaries([{"line": "3"}], allowed={3}, total_lines=10) == []


def test_slicing_is_exact_and_loses_no_text():
    boundaries = [(0, "序章"), (5, "第一章"), (10, "第二章")]
    chapters = slice_chapters(JAPANESE, boundaries)
    assert [c["title"] for c in chapters] == ["序章", "第一章", "第二章"]
    assert "むかしむかしあるところに。" in chapters[0]["text"]
    assert "星が出ていた。" in chapters[2]["text"]
    # headings are consumed, not repeated into the body
    assert "第一章" not in chapters[1]["text"]


def test_a_contents_entry_folds_away_instead_of_becoming_a_chapter():
    # Contents pages list every chapter title in a row; treating those as
    # boundaries is the commonest way an inferred split goes wrong.
    toc = "目次\n第一章\n第二章\n\n第一章\n\n本文がここにあります。\nもっと本文。\nさらに本文があります。\n"
    lines = toc.split("\n")
    idx = [i for i, l in enumerate(lines) if l.strip() == "第一章"]
    chapters = slice_chapters(toc, [(idx[0], "第一章 (toc)"), (idx[1], "第一章")])
    assert [c["title"] for c in chapters] == ["Front matter", "第一章"]


def test_a_thin_section_is_merged_forward_never_dropped():
    # A wrong boundary is recoverable in review; text that vanished is not.
    text = "第一章\n\n" + ("本文。" * 30) + "\n\n第二章\n\n短い。\n\n第三章\n\n" + ("結び。" * 30)
    lines = text.split("\n")
    starts = [(i, lines[i]) for i in range(len(lines)) if lines[i].strip() in {"第一章", "第二章", "第三章"}]
    chapters = slice_chapters(text, [(i, t.strip()) for i, t in starts])
    joined = "\n".join(c["text"] for c in chapters)
    assert "短い。" in joined                      # nothing was lost
    assert [c["title"] for c in chapters] == ["第一章", "第三章"]


def test_slicing_keeps_a_substantial_preamble_as_front_matter():
    text = ("Licence and preface. " * 20) + "\n\n第一章\n\n本文。\nもっと本文。\nさらに本文。\n"
    line = text.split("\n").index("第一章")
    chapters = slice_chapters(text, [(line, "第一章")])
    assert chapters[0]["title"] == "Front matter"
    assert chapters[1]["title"] == "第一章"


def test_no_boundaries_means_no_proposal():
    assert slice_chapters(JAPANESE, []) == []


def test_skeleton_finds_a_bare_numeral_under_a_formatting_directive():
    """Aozora Bunko marks chapters with a bare full-width numeral sitting
    directly under ［＃ここから７字下げ］ — no blank line above it. Requiring one
    excluded all 71 chapters of the owner's Japanese novel (2026-08-31)."""
    text = "［＃改ページ］\n［＃ここから７字下げ］\n１\n［＃ここで字下げ終わり］\n　本文がここから始まる。\n"
    found = [t for _, t in build_skeleton(text)]
    assert "１" in found


def test_skeleton_ignores_dialogue_and_indented_prose():
    text = "\n".join([
        "１",
        "　地の文はここに入る。字下げされている。",
        "「これは台詞です」",
        "『これも台詞』",
    ])
    found = [t for _, t in build_skeleton(text)]
    assert found == ["１"]
    assert not any(t.startswith("「") or t.startswith("『") for t in found)


def test_reasoning_budget_is_large_enough_to_answer():
    """deepseek-reasoner spends max_tokens on thinking BEFORE answering. At
    8000 it returned finish_reason "length", 7,999 reasoning tokens and empty
    content — a silent no-op that looked like "no structure found"
    (owner, 2026-08-31)."""
    import services.split_advisor as adv
    src = open(adv.__file__).read()
    budget = int(re.search(r'"max_tokens": (\d+),', src[src.index("DEEPSEEK_REASONER"):]).group(1))
    assert budget >= 32000, "reasoning tokens come out of this budget"
