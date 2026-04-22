"""
Regression tests for services/book_parser.py — uploaded text file parsing.

Covers the common plain-text novel formats that were mis-detected before the fix:
  - Bare-number chapter markers (Hemingway, Chandler style: 1 / 2 / 3)
  - CHAPTER X / Chapter X markers
  - PART / BOOK section headings
  - Roman numeral headings  (I. / II.)
  - ALL-CAPS headings as fallback (when no HC patterns found)
  - Word-count fallback when no structural markers present
  - Tab-indented paragraph normalization
  - Author extraction from "by Author" line
  - Front matter captured as leading chapter
"""
import pytest
from services.book_parser import parse_txt


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_book(header: str, chapters: list[tuple[str, str]]) -> str:
    """Build a minimal book string from a header and (marker, body) pairs."""
    parts = [header, ""]
    for marker, body in chapters:
        parts += ["", marker, "", body, ""]
    return "\n".join(parts)


# ── Bare-number chapters (Hemingway / Chandler style) ─────────────────────────

FAREWELL_SAMPLE = """A FAREWELL TO ARMS
  by Ernest Hemingway

Copyright 1929.  All rights reserved.

A FAREWELL TO ARMS

BOOK ONE


1

\tIn the late summer of that year we lived in a house in a village.

2

\tThe next year there were many victories.

3

\tWhen I came back to the front we still lived in that town.
"""

BIG_SLEEP_SAMPLE = """THE BIG SLEEP
by Raymond Chandler

1

\tIT WAS ABOUT ELEVEN O'CLOCK in the morning, mid October.

2

\tThe main hallway of the Sternwood place was two stories high.

3

\tThe butler came back and murmured at me genteelly.
"""


def test_bare_number_chapters_detected_farewell_to_arms():
    result = parse_txt(FAREWELL_SAMPLE)
    titles = [ch["title"] for ch in result["chapters"]]
    # Numbered chapters must all be present
    assert "1" in titles
    assert "2" in titles
    assert "3" in titles


def test_bare_number_chapters_detected_big_sleep():
    result = parse_txt(BIG_SLEEP_SAMPLE)
    titles = [ch["title"] for ch in result["chapters"]]
    assert "1" in titles
    assert "2" in titles
    assert "3" in titles


def test_bare_number_chapters_not_word_count_fallback():
    """With bare-number markers, chapters must NOT be named 'Part N'."""
    result = parse_txt(BIG_SLEEP_SAMPLE)
    part_names = [ch for ch in result["chapters"] if ch["title"].startswith("Part ")]
    assert len(part_names) == 0, f"Unexpected word-count fallback chapters: {part_names}"


def test_chapter_text_content_correct():
    """Each numbered chapter gets the right body text."""
    result = parse_txt(BIG_SLEEP_SAMPLE)
    ch1 = next(ch for ch in result["chapters"] if ch["title"] == "1")
    assert "ELEVEN O'CLOCK" in ch1["text"]

    ch2 = next(ch for ch in result["chapters"] if ch["title"] == "2")
    assert "Sternwood" in ch2["text"]


# ── Tab indentation normalized ────────────────────────────────────────────────

def test_tab_indentation_stripped_from_chapter_text():
    result = parse_txt(BIG_SLEEP_SAMPLE)
    ch1 = next(ch for ch in result["chapters"] if ch["title"] == "1")
    # No line in the chapter text should start with a tab
    for line in ch1["text"].splitlines():
        assert not line.startswith("\t"), f"Tab found in chapter text line: {repr(line)}"


# ── CHAPTER X / Roman numeral formats ────────────────────────────────────────

CHAPTER_KEYWORD_SAMPLE = _make_book(
    "A Classic Novel\nby Jane Author",
    [
        ("CHAPTER I", "The beginning of the story where things happen."),
        ("CHAPTER II", "More events unfold as the story continues."),
        ("CHAPTER III", "The climax arrives and everything changes."),
    ],
)

ROMAN_NUMERAL_SAMPLE = _make_book(
    "Another Novel",
    [
        ("I.", "First chapter text is here."),
        ("II.", "Second chapter text is here."),
        ("III.", "Third chapter text is here."),
    ],
)

DOTTED_NUMBER_SAMPLE = _make_book(
    "Yet Another Novel",
    [
        ("1.", "Chapter one content."),
        ("2.", "Chapter two content."),
        ("3.", "Chapter three content."),
    ],
)


def test_chapter_keyword_detected():
    result = parse_txt(CHAPTER_KEYWORD_SAMPLE)
    titles = [ch["title"] for ch in result["chapters"]]
    assert "CHAPTER I" in titles
    assert "CHAPTER II" in titles


def test_roman_numeral_chapters_detected():
    result = parse_txt(ROMAN_NUMERAL_SAMPLE)
    titles = [ch["title"] for ch in result["chapters"]]
    assert "I." in titles
    assert "II." in titles


def test_dotted_number_chapters_detected():
    result = parse_txt(DOTTED_NUMBER_SAMPLE)
    titles = [ch["title"] for ch in result["chapters"]]
    assert "1." in titles
    assert "2." in titles


# ── BOOK / PART section headings ─────────────────────────────────────────────

BOOK_SECTION_SAMPLE = """A Long Novel
by Some Author

BOOK ONE

1

First chapter of book one.

2

Second chapter of book one.

BOOK TWO

3

First chapter of book two.
"""


def test_book_section_headings_detected():
    result = parse_txt(BOOK_SECTION_SAMPLE)
    titles = [ch["title"] for ch in result["chapters"]]
    assert "1" in titles
    assert "2" in titles
    assert "3" in titles


# ── Author extraction ─────────────────────────────────────────────────────────

def test_author_extracted_from_by_line():
    result = parse_txt(BIG_SLEEP_SAMPLE)
    assert result["author"] == "Raymond Chandler"


def test_author_extracted_case_insensitive():
    txt = "My Novel\nBy John Doe\n\n1\n\nChapter text.\n\n2\n\nMore text.\n"
    result = parse_txt(txt)
    assert result["author"] == "John Doe"


def test_author_unknown_when_no_by_line():
    txt = "My Novel\n\n1\n\nChapter text.\n\n2\n\nMore text.\n"
    result = parse_txt(txt)
    assert result["author"] == "Unknown"


# ── Title extraction ──────────────────────────────────────────────────────────

def test_title_extracted():
    result = parse_txt(BIG_SLEEP_SAMPLE)
    assert result["title"] == "THE BIG SLEEP"


# ── Word-count fallback ───────────────────────────────────────────────────────

def test_word_count_fallback_when_no_markers():
    # A wall of text with no chapter markers → Part N fallback
    words = " ".join([f"word{i}" for i in range(12_000)])
    txt = f"Unknown Title\n\n{words}"
    result = parse_txt(txt)
    titles = [ch["title"] for ch in result["chapters"]]
    assert any(t.startswith("Part ") for t in titles)
    assert len(result["chapters"]) >= 2


# ── ALL-CAPS fallback (old Gutenberg books with no explicit markers) ──────────

ALLCAPS_SAMPLE = """AN OLD BOOK

THE FIRST TALE

Once upon a time in a land far away there lived a king.

THE SECOND TALE

In another kingdom there was a queen who ruled wisely.

THE THIRD TALE

Many years passed and the world changed greatly.
"""


def test_allcaps_headings_detected_as_fallback():
    result = parse_txt(ALLCAPS_SAMPLE)
    titles = [ch["title"] for ch in result["chapters"]]
    assert "THE FIRST TALE" in titles
    assert "THE SECOND TALE" in titles
    assert "THE THIRD TALE" in titles


# ── Excess blank line collapse ────────────────────────────────────────────────

def test_multiple_blank_lines_collapsed():
    txt = "My Book\n\n1\n\n\n\n\n\nChapter text here.\n\n2\n\n\n\n\nMore text.\n"
    result = parse_txt(txt)
    for ch in result["chapters"]:
        # No run of 3+ consecutive newlines
        assert "\n\n\n" not in ch["text"], f"Excess blank lines in chapter '{ch['title']}'"
