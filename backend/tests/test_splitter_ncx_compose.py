"""Tests for nested-NCX title composition (#1151).

Per the design doc `docs/design/epub-nested-ncx-titles.md`, the splitter
must compose `<Parent> — <Leaf>` titles when nested-NCX leaf navPoints are
"weak" (bare roman numerals, very short strings) — fixes Madame Bovary's
flattened titles ("PREMIÈRE PARTIE", "II", "II", …) and the chapter-0
TOC-concatenation defect.

These tests exercise the helpers (_is_weak_leaf_title, _compose_title,
_is_bloated_root_title, _walk_toc_with_path) directly with synthetic
inputs so we don't need a real EPUB fixture for the logic tests.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from services.splitter import (
    _compose_title,
    _is_bloated_root_title,
    _is_weak_leaf_title,
    _walk_toc_with_path,
)


# ---------------- _is_weak_leaf_title ---------------------------------------


@pytest.mark.parametrize("title", ["I", "II", "III", "IV", "X.", "XII.", "L"])
def test_weak_leaf_roman_numerals(title):
    assert _is_weak_leaf_title(title)


@pytest.mark.parametrize("title", ["1.", "2", "A", "I.", "i."])
def test_weak_leaf_short_strings(title):
    assert _is_weak_leaf_title(title)


@pytest.mark.parametrize(
    "title",
    [
        "Prolog im Himmel",
        "Loomings",
        "CHAPTER 1. Loomings.",
        "Erstes Buch",
        "ETYMOLOGY (Supplied by a Late Consumptive Usher to a Grammar School).",
    ],
)
def test_strong_leaf_descriptive_titles(title):
    assert not _is_weak_leaf_title(title)


def test_weak_leaf_empty_or_whitespace():
    assert not _is_weak_leaf_title("")
    assert not _is_weak_leaf_title("   ")


# ---------------- _compose_title --------------------------------------------


def test_compose_with_strong_leaf_returns_leaf():
    out = _compose_title(["PREMIÈRE PARTIE"], "Loomings")
    assert out == "Loomings"


def test_compose_weak_leaf_with_parent():
    assert _compose_title(["PREMIÈRE PARTIE"], "I") == "PREMIÈRE PARTIE — I"
    assert _compose_title(["PREMIÈRE PARTIE"], "II") == "PREMIÈRE PARTIE — II"
    assert _compose_title(["TROISIÈME PARTIE"], "XI") == "TROISIÈME PARTIE — XI"


def test_compose_skips_when_parent_equals_leaf():
    # If parent and leaf are textually identical (some malformed NCXes),
    # composition would produce duplicate; fall back to leaf alone.
    assert _compose_title(["I"], "I") == "I"


def test_compose_skips_when_no_parent():
    assert _compose_title([], "I") == "I"


def test_compose_uses_immediate_parent_only():
    # Three-level deep: root > Section > Subsection > leaf "I".
    # Should compose with immediate parent ("Subsection"), not full path.
    out = _compose_title(["Root", "Section", "Subsection"], "I")
    assert out == "Subsection — I"


def test_compose_drops_empty_ancestor():
    out = _compose_title(["", "PREMIÈRE PARTIE", ""], "I")
    assert out == "PREMIÈRE PARTIE — I"


def test_compose_rejects_too_long_composition():
    parent = "A " * 60  # 120 chars
    leaf = "I"
    out = _compose_title([parent], leaf)
    assert out == leaf  # composed > 100 chars, fall back


# ---------------- _is_bloated_root_title ------------------------------------


def test_bloated_root_long_string():
    title = (
        "PREMIÈRE PARTIE I II III IV V VI VII VIII IX "
        "DEUXIÈME PARTIE I II III IV V VI VII VIII IX X XI XII XIII XIV XV "
        "TROISIÈME PARTIE I II III IV V VI VII VIII IX X XI"
    )
    assert _is_bloated_root_title(title)


def test_bloated_root_many_roman_numerals():
    # ≥3 standalone roman numeral tokens — the TOC-concatenation signature
    title = "Part I II III IV V"
    assert _is_bloated_root_title(title)


def test_normal_chapter_title_not_bloated():
    assert not _is_bloated_root_title("PREMIÈRE PARTIE")
    assert not _is_bloated_root_title("Loomings")
    assert not _is_bloated_root_title("CHAPTER 1. Loomings.")


# ---------------- _walk_toc_with_path ---------------------------------------


def _make_entry(title: str, href: str):
    """Build a minimal stand-in for an ebooklib.epub.Link / Section."""
    return SimpleNamespace(title=title, href=href)


def test_walk_flat_toc():
    toc = [
        _make_entry("Chapter 1", "ch1.xhtml"),
        _make_entry("Chapter 2", "ch2.xhtml"),
    ]
    visited: list = []
    _walk_toc_with_path(toc, lambda h, t, a: visited.append((h, t, list(a))))
    assert visited == [
        ("ch1.xhtml", "Chapter 1", []),
        ("ch2.xhtml", "Chapter 2", []),
    ]


def test_walk_nested_toc_tracks_path():
    # Bovary-shape: PREMIÈRE PARTIE > [I, II, III]
    toc = [
        (
            _make_entry("PREMIÈRE PARTIE", "p1c1.xhtml"),
            [
                _make_entry("I", "p1c1.xhtml"),
                _make_entry("II", "p1c2.xhtml"),
                _make_entry("III", "p1c3.xhtml"),
            ],
        ),
    ]
    visited: list = []
    _walk_toc_with_path(toc, lambda h, t, a: visited.append((h, t, list(a))))
    assert visited == [
        ("p1c1.xhtml", "PREMIÈRE PARTIE", []),
        ("p1c1.xhtml", "I", ["PREMIÈRE PARTIE"]),
        ("p1c2.xhtml", "II", ["PREMIÈRE PARTIE"]),
        ("p1c3.xhtml", "III", ["PREMIÈRE PARTIE"]),
    ]


def test_walk_three_level_deep():
    toc = [
        (
            _make_entry("Volume One", "v1.xhtml"),
            [
                (
                    _make_entry("Part 1", "p1.xhtml"),
                    [_make_entry("I", "p1.xhtml")],
                ),
            ],
        ),
    ]
    visited: list = []
    _walk_toc_with_path(toc, lambda h, t, a: visited.append((h, t, list(a))))
    assert ("p1.xhtml", "I", ["Volume One", "Part 1"]) in visited


# ---------------- End-to-end via _epub_nav_titles ---------------------------


class _FakeItem:
    def __init__(self, name: str, item_id: str):
        self._name = name
        self._id = item_id

    def get_name(self):
        return self._name

    def get_id(self):
        return self._id


class _FakeBook:
    def __init__(self, toc, items):
        self.toc = toc
        self._items = items

    def get_items_of_type(self, _t):
        return self._items


def test_epub_nav_titles_composes_bovary_shape():
    from services.splitter import _epub_nav_titles

    items = [
        _FakeItem("p1c1.xhtml", "id_p1c1"),
        _FakeItem("p1c2.xhtml", "id_p1c2"),
        _FakeItem("p1c3.xhtml", "id_p1c3"),
        _FakeItem("p2c1.xhtml", "id_p2c1"),
        _FakeItem("p2c2.xhtml", "id_p2c2"),
    ]
    toc = [
        (
            _make_entry("PREMIÈRE PARTIE", "p1c1.xhtml"),
            [
                _make_entry("I", "p1c1.xhtml"),
                _make_entry("II", "p1c2.xhtml"),
                _make_entry("III", "p1c3.xhtml"),
            ],
        ),
        (
            _make_entry("DEUXIÈME PARTIE", "p2c1.xhtml"),
            [
                _make_entry("I", "p2c1.xhtml"),
                _make_entry("II", "p2c2.xhtml"),
            ],
        ),
    ]

    result = _epub_nav_titles(_FakeBook(toc, items))

    assert result["id_p1c1"] == "PREMIÈRE PARTIE — I"
    assert result["id_p1c2"] == "PREMIÈRE PARTIE — II"
    assert result["id_p1c3"] == "PREMIÈRE PARTIE — III"
    assert result["id_p2c1"] == "DEUXIÈME PARTIE — I"
    assert result["id_p2c2"] == "DEUXIÈME PARTIE — II"


def test_epub_nav_titles_keeps_strong_leaves_verbatim():
    """Faust shape: descriptive leaves, no composition."""
    from services.splitter import _epub_nav_titles

    items = [
        _FakeItem("ch01.xhtml", "id_ch01"),
        _FakeItem("ch02.xhtml", "id_ch02"),
    ]
    toc = [
        (
            _make_entry("Erster Teil", "ch01.xhtml"),
            [
                _make_entry("Prolog im Himmel", "ch01.xhtml"),
                _make_entry("Vor dem Tor", "ch02.xhtml"),
            ],
        ),
    ]

    result = _epub_nav_titles(_FakeBook(toc, items))

    assert result["id_ch01"] == "Prolog im Himmel"
    assert result["id_ch02"] == "Vor dem Tor"


def test_epub_nav_titles_drops_bloated_root():
    """Chapter 0 TOC-concatenation defect: the root navPoint title equals
    every leaf navLabel concatenated. Must be dropped, not surfaced."""
    from services.splitter import _epub_nav_titles

    items = [
        _FakeItem("title.xhtml", "id_title"),
        _FakeItem("p1c1.xhtml", "id_p1c1"),
    ]
    toc = [
        _make_entry(
            "PREMIÈRE PARTIE I II III IV V VI VII VIII IX "
            "DEUXIÈME PARTIE I II III TROISIÈME PARTIE I II",
            "title.xhtml",
        ),
        (
            _make_entry("PREMIÈRE PARTIE", "p1c1.xhtml"),
            [_make_entry("I", "p1c1.xhtml")],
        ),
    ]

    result = _epub_nav_titles(_FakeBook(toc, items))

    assert "id_title" not in result  # bloated root rejected
    assert result["id_p1c1"] == "PREMIÈRE PARTIE — I"


def test_epub_nav_anchors_composes_titles():
    from services.splitter import _epub_nav_anchors

    items = [
        _FakeItem("p1c1.xhtml", "id_p1c1"),
    ]
    toc = [
        (
            _make_entry("PREMIÈRE PARTIE", "p1c1.xhtml"),
            [_make_entry("I", "p1c1.xhtml#anchor1")],
        ),
    ]

    result = _epub_nav_anchors(_FakeBook(toc, items))

    assert "id_p1c1" in result
    titles_out = [t for _, t in result["id_p1c1"]]
    assert "PREMIÈRE PARTIE" in titles_out
    assert "PREMIÈRE PARTIE — I" in titles_out
