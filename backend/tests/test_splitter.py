"""
Tests for the chapter splitter using Faust: Der Tragödie erster Teil (PG #2229)
as the primary fixture (German play with TOC-based scene structure).
"""

import os
import pytest
from services.splitter import (
    build_chapters,
    strip_boilerplate,
    parse_toc_section,
    chapters_from_toc,
    Chapter,
)

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")
FAUST_PATH = os.path.join(FIXTURES, "faust_2229.txt")


@pytest.fixture(scope="module")
def faust_text() -> str:
    with open(FAUST_PATH, encoding="utf-8", errors="replace") as f:
        return f.read()


@pytest.fixture(scope="module")
def faust_chapters(faust_text) -> list[Chapter]:
    return build_chapters(faust_text)


# ── boilerplate stripping ───────────────────────────────────────────────────

def test_strip_boilerplate_removes_header(faust_text):
    body, offset = strip_boilerplate(faust_text)
    assert offset > 0, "Should skip PG header"
    assert "Project Gutenberg License" not in body[:500]
    assert "Zueignung" in body, "Main content should be present"


def test_strip_boilerplate_removes_footer(faust_text):
    body, _ = strip_boilerplate(faust_text)
    assert "END OF THE PROJECT GUTENBERG" not in body


# ── TOC parsing ─────────────────────────────────────────────────────────────

def test_toc_section_found(faust_text):
    body, _ = strip_boilerplate(faust_text)
    titles = parse_toc_section(body)
    assert titles is not None, "Faust has a Contents section"
    assert len(titles) >= 20, f"Expected ≥20 scenes, got {len(titles)}"


def test_toc_contains_known_scenes(faust_text):
    body, _ = strip_boilerplate(faust_text)
    titles = parse_toc_section(body)
    assert titles is not None
    title_set = set(titles)
    expected = {
        "Zueignung",
        "Prolog im Himmel",
        "Nacht",
        "Vor dem Tor",
        "Hexenküche",
        "Walpurgisnacht",
        "Kerker",
    }
    missing = expected - title_set
    assert not missing, f"Missing expected scenes: {missing}"


# ── full chapter split ──────────────────────────────────────────────────────

def test_faust_chapter_count(faust_chapters):
    assert len(faust_chapters) >= 20, (
        f"Expected ≥20 chapters for Faust, got {len(faust_chapters)}\n"
        f"Titles: {[c.title for c in faust_chapters]}"
    )


def test_faust_no_empty_chapters(faust_chapters):
    for ch in faust_chapters:
        assert len(ch.text.strip()) > 100, (
            f"Chapter '{ch.title}' has almost no text ({len(ch.text)} chars)"
        )


def test_faust_chapter_titles_not_empty(faust_chapters):
    empty = [i for i, c in enumerate(faust_chapters) if not c.title.strip()]
    assert not empty, f"Chapters with empty titles at indices: {empty}"


def test_faust_known_chapters_present(faust_chapters):
    titles = [c.title for c in faust_chapters]
    for expected in ["Nacht", "Hexenküche", "Walpurgisnacht", "Kerker"]:
        assert any(expected in t for t in titles), (
            f"Expected chapter '{expected}' not found.\nAll titles: {titles}"
        )


def test_faust_nacht_contains_poem(faust_chapters):
    nacht = next((c for c in faust_chapters if "Nacht" in c.title), None)
    assert nacht is not None, "Could not find 'Nacht' chapter"
    assert "Habe nun, ach!" in nacht.text or "Philosophie" in nacht.text, (
        "Nacht chapter should contain Faust's opening monologue"
    )


def test_faust_chapters_cover_full_text(faust_text, faust_chapters):
    """Chapters should together cover a large portion of the book text."""
    total = sum(len(c.text) for c in faust_chapters)
    body, _ = strip_boilerplate(faust_text)
    ratio = total / len(body)
    assert ratio > 0.7, (
        f"Chapters cover only {ratio:.0%} of the text — splitting may be broken"
    )


def test_faust_chapter_order_is_sequential(faust_text, faust_chapters):
    """Chapter texts should appear in order in the original text."""
    prev_pos = 0
    for ch in faust_chapters:
        pos = faust_text.find(ch.text[:80])
        if pos == -1:
            continue  # short chapter, skip position check
        assert pos >= prev_pos, (
            f"Chapter '{ch.title}' appears before previous chapter in source text"
        )
        prev_pos = pos


# ── print summary (visible with pytest -s) ─────────────────────────────────

def test_print_chapter_summary(faust_chapters):
    print(f"\n{'='*60}")
    print(f"Faust split into {len(faust_chapters)} chapters:")
    for i, ch in enumerate(faust_chapters, 1):
        print(f"  {i:2}. {ch.title:<40} ({len(ch.text):>6} chars)")
    print("="*60)
