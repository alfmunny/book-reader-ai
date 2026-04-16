"""
Tests for services/splitter.py — chapter splitting for Project Gutenberg books.
"""

import pytest
from services.splitter import (
    build_chapters, strip_boilerplate, _validate, _clean_title, Chapter,
    build_chapters_from_html, _looks_like_book_heading,
)


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


def test_strip_boilerplate_removes_illustration_tags():
    text = "*** START OF THE PROJECT GUTENBERG EBOOK ***\n[Illustration: cover]\n\nCHAPTER I\n\n[Illustration]\n\nSome text.\n*** END OF THE PROJECT GUTENBERG EBOOK ***"
    body, _ = strip_boilerplate(text)
    assert "[Illustration" not in body
    assert "Some text." in body
    assert "CHAPTER I" in body


def test_clean_title_strips_trailing_bracket():
    assert _clean_title("Chapter I.]") == "Chapter I."


def test_clean_title_strips_trailing_parens():
    assert _clean_title("CHAPTER II.)") == "CHAPTER II."


def test_clean_title_no_change_on_clean_title():
    assert _clean_title("CHAPTER III") == "CHAPTER III"


def test_clean_title_strips_leading_bracket():
    assert _clean_title("[Chapter IV") == "Chapter IV"


# ── HTML splitter ───────────────────────────────────────────────────────────

def test_build_chapters_from_html_basic_two_chapters():
    # Need >50 words so the heuristic doesn't classify these as book-section dividers
    body1_p1 = "First paragraph " * 30
    body1_p2 = "Second paragraph " * 30
    body2_p1 = "Chapter two paragraph " * 30
    html = f"""
    <html><body>
      <div class="chapter"><h2>Chapter 1</h2>
        <p>{body1_p1}</p>
        <p>{body1_p2}</p>
      </div>
      <div class="chapter"><h2>Chapter 2</h2>
        <p>{body2_p1}</p>
      </div>
    </body></html>
    """
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 2
    assert chapters[0].title == "Chapter 1"
    assert "First paragraph" in chapters[0].text
    assert "Second paragraph" in chapters[0].text
    assert chapters[1].title == "Chapter 2"


def test_build_chapters_from_html_with_book_sections():
    """Book/Part headings at sibling level should be used as prefixes."""
    long_body = "Word " * 150   # above the tiny-merge threshold (100)
    html = f"""
    <html><body>
      <div class="chapter"><h2>BOOK ONE: 1805</h2></div>
      <div class="chapter"><h2>CHAPTER I</h2><p>{long_body}</p></div>
      <div class="chapter"><h2>CHAPTER II</h2><p>{long_body}</p></div>
      <div class="chapter"><h2>BOOK TWO: 1806</h2></div>
      <div class="chapter"><h2>CHAPTER I</h2><p>{long_body}</p></div>
    </body></html>
    """
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 3
    assert chapters[0].title == "BOOK ONE: 1805 — CHAPTER I"
    assert chapters[1].title == "BOOK ONE: 1805 — CHAPTER II"
    assert chapters[2].title == "BOOK TWO: 1806 — CHAPTER I"


def test_build_chapters_from_html_returns_empty_on_no_chapter_divs():
    html = "<html><body><p>No chapter divs here</p></body></html>"
    assert build_chapters_from_html(html) == []


def test_build_chapters_from_html_preserves_paragraph_breaks():
    body1 = "word " * 150
    p2a = "A. " * 150
    p2b = "B. " * 150
    html = f"""
    <div class="chapter"><h2>One</h2><p>{body1}</p></div>
    <div class="chapter"><h2>Two</h2><p>{p2a}</p><p>{p2b}</p></div>
    """
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 2
    # Chapter 2 should have paragraphs separated by double newline
    assert "\n\n" in chapters[1].text


def test_build_chapters_from_html_skips_contents_meta_heading():
    """A 'CONTENTS' div should not become a book-prefix for following chapters."""
    html = """
    <div class="chapter"><h2>CONTENTS</h2></div>
    <div class="chapter"><h2>Chapter One</h2>
      <p>""" + ("word " * 80) + """</p>
    </div>
    """
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 1
    # The "CONTENTS" shouldn't appear as a prefix
    assert chapters[0].title == "Chapter One"


def test_looks_like_book_heading():
    assert _looks_like_book_heading("BOOK ONE: 1805") is True
    assert _looks_like_book_heading("Part I") is True
    assert _looks_like_book_heading("Volume 2") is True
    assert _looks_like_book_heading("PARTIE TROISIÈME") is True
    assert _looks_like_book_heading("CHAPTER I") is False
    assert _looks_like_book_heading("Chapter 42") is False


def test_build_chapters_from_html_handles_malformed_html():
    # lxml is lenient — should not raise, just return best effort
    html = "<div class='chapter'><h2>A</h2><p>x</p></unclosed>"
    chapters = build_chapters_from_html(html)
    # Don't assert count — just assert no exception and result is a list
    assert isinstance(chapters, list)
