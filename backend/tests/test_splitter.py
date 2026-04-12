"""
Tests for services/splitter.py — chapter splitting for Project Gutenberg books.
"""

import pytest
from services.splitter import build_chapters, strip_boilerplate, _validate, _clean_title, Chapter


def test_strip_boilerplate_removes_header_and_footer():
    text = "Header\n*** START OF THE PROJECT GUTENBERG EBOOK ***\nBody\n*** END OF THE PROJECT GUTENBERG EBOOK ***\nFooter"
    body, _ = strip_boilerplate(text)
    assert "Body" in body
    assert "Header" not in body
    assert "Footer" not in body


def test_strip_boilerplate_no_markers():
    body, offset = strip_boilerplate("Just text")
    assert body == "Just text"
    assert offset == 0


def test_validate_rejects_single_chapter():
    assert not _validate([Chapter(title="X", text="w " * 1000)])


def test_validate_rejects_too_many_tiny_chapters():
    chs = [Chapter(title=f"{i}", text="Short.") for i in range(500)]
    assert not _validate(chs)


def test_validate_accepts_reasonable_chapters():
    chs = [Chapter(title=f"{i}", text="word " * 500) for i in range(10)]
    assert _validate(chs)


def test_english_chapter_headings():
    text = "\n\nCHAPTER I\n\n" + "First. " * 200
    text += "\n\nCHAPTER II\n\n" + "Second. " * 200
    text += "\n\nCHAPTER III\n\n" + "Third. " * 200
    chs = build_chapters(text)
    assert len(chs) == 3
    assert "CHAPTER I" in chs[0].title


def test_french_chapitre_headings():
    text = "\n\nChapitre Premier\n\n" + "Texte. " * 200
    text += "\n\nChapitre II\n\n" + "Texte. " * 200
    text += "\n\nChapitre III\n\n" + "Texte. " * 200
    chs = build_chapters(text)
    assert len(chs) == 3


def test_german_kapitel_headings():
    text = "\n\nKapitel 1\n\n" + "Text. " * 200
    text += "\n\nKapitel 2\n\n" + "Text. " * 200
    text += "\n\nKapitel 3\n\n" + "Text. " * 200
    chs = build_chapters(text)
    assert len(chs) == 3


def test_act_scene_headings():
    text = "\n\nACT I\n\n" + "Text. " * 200
    text += "\n\nACT II\n\n" + "Text. " * 200
    text += "\n\nACT III\n\n" + "Text. " * 200
    chs = build_chapters(text)
    assert len(chs) == 3


def test_roman_numeral_chapters():
    text = ""
    for n in ["I", "II", "III", "IV", "V"]:
        text += f"\n\n{n}\n\n" + f"Content for {n}. " * 200
    chs = build_chapters(text)
    assert len(chs) >= 3


def test_paragraph_fallback_for_unstructured_text():
    text = ("Long paragraph. " * 100 + "\n\n") * 20
    chs = build_chapters(text)
    assert len(chs) >= 2
    for c in chs:
        assert len(c.text.split()) >= 50


def test_over_splitting_falls_through():
    text = ""
    for i in range(200):
        text += f"\n\nLine {i}\n\nShort."
    chs = build_chapters(text)
    assert len(chs) < 100


def test_empty_text():
    chs = build_chapters("")
    assert len(chs) <= 1


def test_very_short_text():
    chs = build_chapters("Few words.")
    assert len(chs) == 1


def test_chapter_at_start_of_body():
    text = "*** START OF THE PROJECT GUTENBERG EBOOK ***\nCHAPTER I\n\n" + "First. " * 200
    text += "\n\nCHAPTER II\n\n" + "Second. " * 200
    text += "\n\nCHAPTER III\n\n" + "Third. " * 200
    chs = build_chapters(text)
    assert len(chs) >= 2
    assert "CHAPTER" in chs[0].title


def test_clean_title_strips_trailing_bracket():
    assert _clean_title("Chapter I.]") == "Chapter I."


def test_clean_title_strips_trailing_parens():
    assert _clean_title("CHAPTER II.)") == "CHAPTER II."


def test_clean_title_no_change_on_clean_title():
    assert _clean_title("CHAPTER III") == "CHAPTER III"


def test_clean_title_strips_leading_bracket():
    assert _clean_title("[Chapter IV") == "Chapter IV"
