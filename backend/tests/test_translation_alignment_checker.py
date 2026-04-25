"""Tests for the translation alignment checker (#1073).

Each `kind` documented in the design doc gets at least one positive test.
We mock chapters_from_db / translations_for_book so tests don't depend on
the live DB or any cached EPUBs — pure logic tests.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from scripts import check_translation_alignment as cta
from scripts.translation_alignment_detectors import (
    _is_cue_de,
    _is_cue_en,
    _is_cue_fr,
    _is_cue_ru,
    _is_translated_cue_default,
    get_detector,
    is_translated_cue,
)


class _Chapter:
    """Minimal stand-in for services.splitter.Chapter."""

    def __init__(self, title: str, text: str):
        self.title = title
        self.text = text


def _run(book_id, target_lang, src_chapters, translations_dict, *, source_lang="de"):
    """Helper: patch the DB-touching functions and run the checker."""
    with patch.object(cta, "chapters_from_db", return_value=src_chapters), \
         patch.object(cta, "translations_for_book", return_value=translations_dict), \
         patch.object(cta, "book_source_language", return_value=source_lang):
        return cta.check_alignment(book_id, target_lang)


# ---------------- Detector unit tests ----------------------------------------


def test_de_cue_detects_classic_goethe_cues():
    assert _is_cue_de("FAUST.")
    assert _is_cue_de("MEPHISTOPHELES.")
    assert _is_cue_de("DER KAISER.")
    assert _is_cue_de("FAUST (abgewendet).")
    assert not _is_cue_de("Margarete denkt nach.")
    assert not _is_cue_de("ein langer Satz hier.")


def test_fr_cue_detects_titlecase_and_fullcap():
    assert _is_cue_fr("Le Roi.")
    assert _is_cue_fr("LE ROI.")
    assert _is_cue_fr("Don Juan.")
    assert _is_cue_fr("Sganarelle, à part.")
    assert not _is_cue_fr("Un long passage de prose française se termine ainsi.")


def test_en_cue_detects_shakespearean_cues():
    assert _is_cue_en("HAMLET.")
    assert _is_cue_en("Hamlet.")
    assert _is_cue_en("OPHELIA, aside.")
    assert not _is_cue_en("This is a long English sentence ending with a period.")


def test_ru_cue_detects_cyrillic_caps():
    assert _is_cue_ru("ГАМЛЕТ.")
    assert _is_cue_ru("ОФЕЛИЯ.")
    assert not _is_cue_ru("Гамлет говорит долго.")


def test_no_cue_default_for_unknown_language():
    detector = get_detector("ja")
    assert detector("Some line") is False
    assert detector("FAUST.") is False  # registered no-op


def test_translated_cue_zh():
    assert _is_translated_cue_default("浮士德。", "zh")
    assert _is_translated_cue_default("梅菲斯特：", "zh")
    assert not _is_translated_cue_default(
        "这是一个非常长的句子，根本不可能是一个说话人提示。" * 2, "zh"
    )


def test_translated_cue_target_aware():
    assert is_translated_cue("Hamlet.", "en")
    assert is_translated_cue("梅菲斯特。", "zh")


# ---------------- Verse classifier ------------------------------------------


def test_verse_classifier_recognises_short_even_lines():
    verse = (
        "Ich bete wieder, du Erlauchter,\n"
        "du hörst mich wieder durch den Wind,\n"
        "weil meine Tiefen nie gebrauchter\n"
        "rauschender Worte mächtig sind."
    )
    assert cta.is_verse_paragraph(verse)


def test_verse_classifier_rejects_uneven_prose():
    prose = (
        "It was a wide and roomy chamber, with floor of stone and walls of beaten earth.\n"
        "Short.\n"
        "Then a much longer descriptive sentence that goes on and on with detail."
    )
    assert not cta.is_verse_paragraph(prose)


def test_verse_classifier_rejects_short():
    assert not cta.is_verse_paragraph("a single line")
    assert not cta.is_verse_paragraph("two\nlines")


# ---------------- check_alignment integration tests --------------------------


def test_missing_translation_reported():
    chapters = [_Chapter("ch0", "p0\n\np1")]
    issues = _run(1, "zh", chapters, translations_dict={})
    assert any(i["kind"] == "missing_translation" for i in issues)


def test_paragraph_count_drift_flagged():
    chapters = [_Chapter("ch0", "para A\n\npara B\n\npara C")]
    translations = {0: (["译A", "译B"], None)}
    issues = _run(1, "zh", chapters, translations)
    assert any(i["kind"] == "paragraph_count_drift" for i in issues)


def test_stanza_line_drift_flagged_for_verse():
    src = "line1\nline2\nline3\nline4"
    tr = "译1\n译2\n译3"
    chapters = [_Chapter("verse", src)]
    translations = {0: ([tr], "标题")}
    with patch.object(cta, "is_verse_paragraph", return_value=True):
        issues = _run(1, "zh", chapters, translations)
    assert any(i["kind"] == "stanza_line_drift" for i in issues)


def test_paragraph_line_count_drift_for_prose():
    src = "Line one short.\nLine two short.\nLine three short.\nLine four short."
    tr = "译一\n译二\n译三"
    chapters = [_Chapter("prose", src)]
    translations = {0: ([tr], "标题")}
    with patch.object(cta, "is_verse_paragraph", return_value=False):
        issues = _run(1, "zh", chapters, translations, source_lang="en")
    assert any(i["kind"] == "paragraph_line_count_drift" for i in issues)


def test_prose_reflow_to_single_line_does_not_trigger_drift():
    # Source has 4 wrapped-prose lines; translator produced one Chinese line.
    # This is legitimate reflow, not an Opus line drop. Should NOT flag.
    src = "Line one short.\nLine two short.\nLine three short.\nLine four short."
    tr = "翻译者把全部四行散文合并成一句中文。"
    chapters = [_Chapter("prose", src)]
    translations = {0: ([tr], "标题")}
    with patch.object(cta, "is_verse_paragraph", return_value=False):
        issues = _run(1, "zh", chapters, translations, source_lang="en")
    assert not any(i["kind"] == "paragraph_line_count_drift" for i in issues)


def test_speaker_cue_missing_flagged():
    src = "FAUST.\nIch bin der Geist."
    tr = "FAUST.\n我是那灵."
    chapters = [_Chapter("verse", src)]
    translations = {0: ([tr], None)}
    issues = _run(1, "zh", chapters, translations, source_lang="de")
    cue_missing = [i for i in issues if i["kind"] == "speaker_cue_not_translated"]
    assert cue_missing, f"Expected cue-not-translated issue, got: {issues}"


def test_speaker_cue_correctly_translated_passes():
    src = "FAUST.\nIch bin der Geist."
    tr = "浮士德。\n我是那灵。"
    chapters = [_Chapter("verse", src)]
    translations = {0: ([tr], "标题")}
    issues = _run(1, "zh", chapters, translations, source_lang="de")
    assert not any(
        i["kind"] in ("speaker_cue_missing", "speaker_cue_not_translated")
        for i in issues
    )


def test_no_cue_detector_skips_cue_check_entirely():
    # Source language with no detector => cue check is no-op even with
    # all-caps lines that LOOK like cues.
    src = "FAUST.\nThis would be a cue in DE but EN-treated-as-no-cue."
    tr = "Some long Chinese translation that doesn't end with a period as a cue."
    chapters = [_Chapter("test", src)]
    translations = {0: ([tr], "标题")}
    issues = _run(1, "zh", chapters, translations, source_lang="ja")
    assert not any(
        i["kind"] in ("speaker_cue_missing", "speaker_cue_not_translated")
        for i in issues
    )


def test_severity_filtering():
    # title_translation_missing is "info" — should be excluded by error threshold
    chapters = [_Chapter("ch0", "p0")]
    translations = {0: (["t0"], None)}  # title_translation is None
    issues = _run(1, "zh", chapters, translations)
    info_issues = [i for i in issues if i["severity"] == "info"]
    assert info_issues
    gated = cta.filter_by_severity(issues, "error")
    assert all(i["severity"] == "error" for i in gated)


def test_clean_run_returns_no_issues():
    src = "First paragraph of prose.\n\nSecond paragraph."
    chapters = [_Chapter("clean", src)]
    translations = {
        0: (["第一段散文。", "第二段。"], "标题"),
    }
    issues = _run(1, "zh", chapters, translations, source_lang="en")
    assert issues == []


# ---------------- Output formatters -----------------------------------------


def test_format_markdown_clean():
    md = cta.format_markdown(2229, "zh", [])
    assert "No alignment issues" in md
    assert "book #2229" in md


def test_format_json_structure():
    issue = {"kind": "stanza_line_drift", "severity": "error", "chapter": 1, "title": "t", "paragraph": 0, "detail": "x"}
    out = cta.format_json(2229, "zh", [issue])
    import json as _json
    parsed = _json.loads(out)
    assert parsed["book_id"] == 2229
    assert parsed["issues"][0]["kind"] == "stanza_line_drift"
