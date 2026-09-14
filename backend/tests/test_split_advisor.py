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


# ── Rule mode ────────────────────────────────────────────────────────────────

def test_a_rule_is_applied_by_us_never_executed():
    from services.split_advisor import apply_rule
    text = "1\n\n本文がここにあります。\nもっと本文。\n\n2\n\n続きの本文です。\nさらに続く。\n"
    rule = {"heading_pattern": "[0-9]{1,3}", "require_unindented": True}
    assert [t for _, t in apply_rule(text, rule)] == ["1", "2"]


def test_an_uncompilable_or_empty_pattern_yields_nothing():
    from services.split_advisor import apply_rule
    text = "1\n\n本文。\n"
    assert apply_rule(text, {"heading_pattern": "[unclosed"}) == []
    assert apply_rule(text, {"heading_pattern": ""}) == []
    assert apply_rule(text, {"heading_pattern": ".*"}) == []   # matches emptiness
    assert apply_rule(text, "not a rule") == []


def test_a_rule_that_matches_most_of_the_book_is_refused():
    # A pattern that fires on prose would shred the text into fragments.
    from services.split_advisor import apply_rule
    text = "\n".join("短い行" for _ in range(200))
    assert apply_rule(text, {"heading_pattern": "短い行"}) == []


def test_the_indentation_rule_separates_headings_from_prose():
    from services.split_advisor import apply_rule
    text = "1\n　1\n\n本文。\n"
    assert [n for n, _ in apply_rule(text, {"heading_pattern": "[0-9]", "require_unindented": True})] == [0]


def test_the_sample_is_the_opening_only():
    from services.split_advisor import build_sample
    text = "\n".join(f"line {i}" for i in range(5000))
    sample = build_sample(text)
    assert len(sample) < 8000, "the whole book must not be sent"
    assert sample.startswith("0: line 0")


# ── Paragraph reflow ─────────────────────────────────────────────────────────

def test_indent_mode_turns_indented_lines_into_paragraphs():
    """Japanese typesetting marks a paragraph with a leading ideographic space
    and no blank line. The reader and the translator both split on a blank
    line, so thirteen paragraphs arrived as one block — unformatted, and the
    translation misaligned against it (owner, 2026-08-31)."""
    from services.split_advisor import reflow
    body = "　一つ目の段落。\n続きの行。\n　二つ目の段落。\n　三つ目の段落。"
    out = reflow(body, "indent")
    assert out.split("\n\n") == ["一つ目の段落。続きの行。", "二つ目の段落。", "三つ目の段落。"]


def test_every_line_mode_suits_verse():
    from services.split_advisor import reflow
    assert reflow("行一\n行二\n\n行三", "every-line").split("\n\n") == ["行一", "行二", "行三"]


def test_blank_line_mode_and_unknown_modes_leave_the_text_alone():
    from services.split_advisor import reflow
    body = "One.\n\nTwo."
    assert reflow(body, "blank-line") == body
    assert reflow(body, "nonsense-mode") == body


def test_slicing_applies_the_paragraph_mode():
    from services.split_advisor import slice_chapters
    text = "1\n　最初の段落。\n続き。\n　次の段落。\n"
    chapters = slice_chapters(text, [(0, "1")], paragraph_mode="indent")
    assert chapters[0]["text"] == "最初の段落。続き。\n\n次の段落。"


def test_excluded_lines_are_dropped_from_the_body_too():
    """A directive is excluded from being a heading; it is not prose either.
    Left in, ［＃ここで字下げ終わり］ opened a chapter as its own paragraph."""
    import re as _re
    from services.split_advisor import slice_chapters
    text = "1\n［＃ここで字下げ終わり］\n　最初の段落。\n　次の段落。\n"
    chapters = slice_chapters(
        text, [(0, "1")], paragraph_mode="indent", drop=_re.compile("^［＃")
    )
    assert chapters[0]["text"] == "最初の段落。\n\n次の段落。"


# ── Verify, then resample where the rule ran dry ─────────────────────────────

def test_a_giant_tail_is_detected_as_the_rule_running_dry():
    """A rule inferred from the opening only knows the formats the opening
    shows. The owner's book numbered chapters １–９ full-width, then switched
    to half-width 10, 11 — everything after landed in one 247k blob."""
    from services.split_advisor import _rule_ran_dry
    # nine chapters of ~50 lines, then a 5000-line tail after the last boundary
    bounds = [(i * 50, str(i)) for i in range(1, 10)]
    assert _rule_ran_dry(bounds, total_lines=5450) == 450


def test_an_even_book_is_left_alone():
    from services.split_advisor import _rule_ran_dry
    bounds = [(i * 50, str(i)) for i in range(1, 10)]
    assert _rule_ran_dry(bounds, total_lines=500) is None
    assert _rule_ran_dry(bounds[:2], total_lines=100000) is None  # too few to judge
