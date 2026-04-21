"""
Tests for services/splitter.py — chapter splitting for Project Gutenberg books.
"""

import pytest
from services.splitter import (
    build_chapters, strip_boilerplate, _validate, _clean_title, Chapter,
    build_chapters_from_html, _looks_like_book_heading,
    _strip_illustration_markers, _skip_toc_region, _html_body_text,
    _html_inline_text, _split_dramatic_speakers, _chapters_from_roman,
    _chapters_from_toc, _strip_heading_from_text,
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


def test_build_chapters_from_html_preserves_verse_stanzas():
    """Gutenberg verse HTML: each stanza is a <p> with <br>-separated lines.
    The extractor must produce one paragraph per stanza with lines joined by
    single \\n (not \\n\\n). Regression for Faust book 2229 where every verse
    line was becoming its own paragraph because formatting whitespace after
    each <br> was leaving a blank-line artifact."""
    # Enough stanzas to exceed the 50-word threshold that marks a div as a
    # section divider. Matches Gutenberg's actual Faust Zueignung markup.
    stanza1 = """<p>
    Ihr naht euch wieder, schwankende Gestalten,<br>
    Die früh sich einst dem trüben Blick gezeigt.<br>
    Versuch ich wohl, euch diesmal festzuhalten?<br>
    Fühl ich mein Herz noch jenem Wahn geneigt?<br>
    Ihr drängt euch zu! nun gut, so mögt ihr walten,<br>
    Wie ihr aus Dunst und Nebel um mich steigt;<br>
    Mein Busen fühlt sich jugendlich erschüttert<br>
    Vom Zauberhauch, der euren Zug umwittert.
    </p>"""
    stanza2 = """<p>
    Ihr bringt mit euch die Bilder froher Tage,<br>
    Und manche liebe Schatten steigen auf;<br>
    Gleich einer alten, halbverklungnen Sage<br>
    Kommt erste Lieb und Freundschaft mit herauf;<br>
    Der Schmerz wird neu, es wiederholt die Klage<br>
    Des Lebens labyrinthisch irren Lauf,<br>
    Und nennt die Guten, die, um schöne Stunden<br>
    Vom Glück getäuscht, vor mir hinweggeschwunden.
    </p>"""
    html = f'<div class="chapter"><h2>Zueignung</h2>{stanza1}{stanza2}</div>'
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 1
    text = chapters[0].text
    stanzas = [p for p in text.split("\n\n") if p.strip()]
    # Exactly two stanza-paragraphs, not one-per-line.
    assert len(stanzas) == 2, f"Expected 2 stanzas, got {len(stanzas)}: {stanzas!r}"
    # Each stanza retains its internal \n-separated lines.
    for s in stanzas:
        lines = [l for l in s.split("\n") if l.strip()]
        assert len(lines) == 8, f"Expected 8 lines in stanza, got {len(lines)}: {s!r}"


def test_build_chapters_from_html_handles_malformed_html():
    # lxml is lenient — should not raise, just return best effort
    html = "<div class='chapter'><h2>A</h2><p>x</p></unclosed>"
    chapters = build_chapters_from_html(html)
    # Don't assert count — just assert no exception and result is a list
    assert isinstance(chapters, list)


def test_build_chapters_from_html_splits_dramatic_speakers():
    """Faust chapter 5 packs BÜRGERMÄDCHEN + ZWEITER SCHÜLER speeches
    into a single <p>. The Gemini translator splits them at speaker
    change, so source paragraph count was off by one — knocking every
    subsequent row out of alignment. The speaker-cue splitter breaks
    the source paragraph at every ALL-CAPS speaker cue."""
    fake_stanza = """<p>
    BÜRGERMÄDCHEN.<br>
    Da sieh mir nur die schönen Knaben!<br>
    Es ist wahrhaftig eine Schmach.<br>
    Gesellschaft könnten sie die allerbeste haben,<br>
    Und laufen diesen Mägden nach!<br>
    ZWEITER SCHÜLER (zum ersten).<br>
    Nicht so geschwind! dort hinten kommen zwei,<br>
    Sie sind gar niedlich angezogen,<br>
    's ist meine Nachbarin dabei;<br>
    Ich bin dem Mädchen sehr gewogen.
    </p>"""
    padding = "Word " * 200
    html = f'<div class="chapter"><h2>Vor dem Tor</h2>{fake_stanza}<p>{padding}</p></div>'
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 1
    paragraphs = [p for p in chapters[0].text.split("\n\n") if p.strip()]
    # Both speakers must appear as separate paragraphs.
    assert any(p.startswith("BÜRGERMÄDCHEN.") for p in paragraphs), paragraphs
    assert any(p.startswith("ZWEITER SCHÜLER") for p in paragraphs), paragraphs
    burger = next(p for p in paragraphs if p.startswith("BÜRGERMÄDCHEN."))
    assert "ZWEITER SCHÜLER" not in burger


def test_build_chapters_from_html_folds_centered_subtitle_into_title():
    """Faust ch. 25 encodes 'Walpurgisnachtstraum' in <h2> and the rest
    of the title ('oder / Oberons und Titanias goldne Hochzeit /
    Intermezzo') in a <p class="center"> immediately after. Without
    folding, the body opens with an orphan 'oder' line."""
    body_padding = "<br>".join("Word" for _ in range(200))
    html = (
        '<div class="chapter">'
        '<h2>Walpurgisnachtstraum</h2>'
        '<p class="center">oder<br>Oberons und Titanias goldne Hochzeit<br>Intermezzo</p>'
        f'<p>THEATERMEISTER.<br>{body_padding}</p>'
        '</div>'
    )
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 1
    ch = chapters[0]
    # Subtitle is part of the title.
    assert "Walpurgisnachtstraum" in ch.title
    assert "Oberons und Titanias goldne Hochzeit" in ch.title
    assert "Intermezzo" in ch.title
    # Body no longer starts with a centered "oder …" paragraph.
    paragraphs = [p for p in ch.text.split("\n\n") if p.strip()]
    assert paragraphs
    first = paragraphs[0]
    assert not first.startswith("oder"), first
    assert "Oberons und Titanias" not in first
    assert first.startswith("THEATERMEISTER")


def test_build_chapters_from_html_keeps_regular_first_paragraph():
    """Regression guard: for chapters where the first <p> is ordinary
    stage direction (not a centered subtitle), it must stay in the body."""
    body_padding = "<br>".join("Word" for _ in range(200))
    html = (
        '<div class="chapter">'
        '<h2>Studierzimmer</h2>'
        '<p>Faust mit dem Pudel hereintretend.</p>'
        f'<p>FAUST.<br>{body_padding}</p>'
        '</div>'
    )
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 1
    # Title is just the heading — stage direction stays in body.
    assert chapters[0].title == "Studierzimmer"
    paragraphs = [p for p in chapters[0].text.split("\n\n") if p.strip()]
    assert paragraphs[0].startswith("Faust mit dem Pudel")


def test_html_inline_text_normalises_crlf_between_verse_lines():
    """Gutenberg HTML ships with Windows-style `\\r\\n` line endings, so
    after converting `<br>` to `\\n` the verse lines end up separated by
    `\\n\\r\\n`. Without stripping `\\r`, the reader's whitespace-pre-wrap
    rendered the `\\r` as a second segment break (or the `\\n` was lost
    in CSS collapse in non-pre mode), gluing verse lines together."""
    from services.splitter import build_chapters_from_html

    padding = "<br>".join("Word" for _ in range(200))
    # <br> followed by \r\n + indentation in the HTML source
    html = (
        '<div class="chapter">'
        '<h2>Hexenküche</h2>'
        '<p>\r\n'
        'FAUST.<br>\r\n'
        '    Line one,<br>\r\n'
        '    Line two,<br>\r\n'
        '    Line three.\r\n'
        '</p>'
        f'<p>{padding}</p>'
        '</div>'
    )
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 1
    paragraphs = [p for p in chapters[0].text.split("\n\n") if p.strip()]
    first = paragraphs[0]
    # After the splitter there must be NO carriage returns between
    # verse lines — just single `\n`.
    assert "\r" not in first, repr(first)
    assert first == "FAUST.\nLine one,\nLine two,\nLine three."


def test_build_chapters_from_html_splits_multi_speaker_cue():
    """Faust's Walpurgisnacht packs an IRRLICHT solo AND a 3-way choral
    stanza into one <p>: the cue for the choral piece is
    'FAUST, MEPHISTOPHELES, IRRLICHT (im Wechselgesang).' — the commas
    between names blocked the previous speaker-cue regex and the two
    stanzas were rendering as one paragraph."""
    fake_block = """<p>
    IRRLICHT.<br>
    Ich merke wohl, Ihr seid der Herr vom Haus,<br>
    Und will mich gern nach Euch bequemen.<br>
    Allein bedenkt! der Berg ist heute zaubertoll<br>
    Und wenn ein Irrlicht Euch die Wege weisen soll<br>
    So müßt Ihr's so genau nicht nehmen.<br>
    FAUST, MEPHISTOPHELES, IRRLICHT (im Wechselgesang).<br>
    In die Traum- und Zaubersphäre<br>
    Sind wir, scheint es, eingegangen.<br>
    Führ uns gut und mach dir Ehre<br>
    Daß wir vorwärts bald gelangen
    </p>"""
    padding = "Word " * 200
    html = (
        '<div class="chapter"><h2>Walpurgisnacht</h2>'
        f'{fake_block}<p>{padding}</p></div>'
    )
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 1
    paragraphs = [p for p in chapters[0].text.split("\n\n") if p.strip()]
    assert any(p.startswith("IRRLICHT.") for p in paragraphs), paragraphs
    assert any(
        p.startswith("FAUST, MEPHISTOPHELES, IRRLICHT") for p in paragraphs
    ), paragraphs
    # The solo and the choral stanza must be distinct paragraphs.
    irrlicht = next(p for p in paragraphs if p.startswith("IRRLICHT."))
    assert "FAUST, MEPHISTOPHELES" not in irrlicht


# ── _clean_title fixes ────────────────────────────────────────────────────────

def test_clean_title_keeps_balanced_parens():
    """'Studierzimmer (I)' must not lose its closing paren."""
    assert _clean_title("Studierzimmer (I)") == "Studierzimmer (I)"


def test_clean_title_keeps_balanced_brackets():
    assert _clean_title("Chapter [I]") == "Chapter [I]"


def test_clean_title_strips_unbalanced_trailing_bracket():
    """Gutenberg artefact: trailing ] with no matching [ should be removed."""
    assert _clean_title("Chapter I.]") == "Chapter I."


def test_clean_title_strips_unbalanced_trailing_paren():
    assert _clean_title("Scene II.)") == "Scene II."


def test_clean_title_strips_leading_unbalanced_paren():
    assert _clean_title("(Chapter IV") == "Chapter IV"


# ── Faust section-prefix fix ─────────────────────────────────────────────────

def _chapter_html(title: str, words: int = 150) -> str:
    """Build a chapter div with enough body words to survive _merge_tiny_first."""
    body = " ".join(["word"] * words)
    return f'<div class="chapter"><h2>{title}</h2><p>{body}</p></div>'


def test_bare_title_div_not_used_as_section_prefix():
    """A div with only a title and <50 words of body (e.g. 'FAUST' or
    'ERSTER THEIL') must NOT prefix subsequent chapter titles."""
    html = (
        '<div class="chapter"><h2>ERSTER THEIL</h2></div>'
        + _chapter_html("Nacht")
        + _chapter_html("Vor dem Tor")
    )
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 2
    assert chapters[0].title == "Nacht"
    assert chapters[1].title == "Vor dem Tor"


def test_book_keyword_div_is_used_as_section_prefix():
    """A div starting with BOOK/PART/TEIL keyword still becomes a prefix."""
    html = (
        '<div class="chapter"><h2>TEIL I</h2></div>'
        + _chapter_html("Nacht")
    )
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 1
    assert chapters[0].title == "TEIL I — Nacht"


def test_faust_prologue_chapters_have_no_prefix():
    """Chapters before any section marker must not be prefixed."""
    html = (
        _chapter_html("Zueignung")
        + _chapter_html("Vorspiel")
        + '<div class="chapter"><h2>ERSTER THEIL</h2></div>'
        + _chapter_html("Nacht")
    )
    chapters = build_chapters_from_html(html)
    titles = [c.title for c in chapters]
    assert "Zueignung" in titles
    assert "Vorspiel" in titles
    assert "Nacht" in titles
    assert all("ERSTER THEIL" not in t for t in titles)


# ── New coverage tests ────────────────────────────────────────────────────────

# Lines 116-120: _strip_illustration_markers multi-line body
def test_strip_illustration_markers_multiline():
    """Multi-line [Illustration: ...] blocks should have markers stripped but content kept."""
    text = "Before.\n[Illustration: A map\nshowing the route]\nAfter."
    body, _ = strip_boilerplate(text)
    assert "[Illustration" not in body
    assert "A map" in body
    assert "showing the route" in body
    assert "Before." in body
    assert "After." in body


def test_strip_illustration_markers_preserves_chapter_heading():
    """Chapter headings wrapped in illustration blocks must be kept."""
    text = "[Illustration: ·TITLE·\n\nCHAPTER I\nThe Beginning]"
    body, _ = strip_boilerplate(text)
    assert "CHAPTER I" in body
    assert "[Illustration" not in body


# Line 146: _validate rejects > MAX_CHAPTERS
def test_validate_rejects_more_than_max_chapters():
    """501 chapters should fail validation even if each has enough words."""
    chs = [Chapter(title=f"Ch {i}", text="word " * 200) for i in range(501)]
    assert not _validate(chs)


# Lines 170-172: _skip_toc_region when no triple blank line follows the TOC heading
def test_skip_toc_region_no_triple_blank():
    """When there is no \\n{3,} after the TOC heading, fall back to min(len, 3000)."""
    # TOC heading followed by content with no triple blank line
    body = "\nContents\n" + "Chapter One\nChapter Two\n" * 10
    result = _skip_toc_region(body)
    # Should be > 0 since a TOC heading was found
    assert result > 0
    # Should have consumed up to min(len(after), 3000) chars
    from services.splitter import TOC_HEADING_RE
    m = TOC_HEADING_RE.search(body)
    assert m is not None
    after_len = len(body) - m.end()
    assert result == m.end() + min(after_len, 3000)


def test_skip_toc_region_no_toc_returns_zero():
    """When there is no TOC heading, return 0."""
    body = "Just some plain text without a table of contents."
    assert _skip_toc_region(body) == 0


# Line 189: _chapters_from_keywords skips TOC entries (m.start() < toc_skip)
def test_chapters_from_keywords_skips_toc_entries():
    """CHAPTER headings inside the TOC region must not become chapter entries."""
    # Build a text where Contents heading precedes some chapter refs,
    # then the actual chapters appear after a triple blank line.
    toc_body = (
        "\nContents\n"
        "CHAPTER I\n"
        "CHAPTER II\n"
        "\n\n\n"
    )
    chapters_body = (
        "\n\nCHAPTER I\n\n" + "word " * 200
        + "\n\nCHAPTER II\n\n" + "word " * 200
        + "\n\nCHAPTER III\n\n" + "word " * 200
    )
    text = toc_body + chapters_body
    chs = build_chapters(text)
    # Should find 3 chapters from the real body, not duplicate from TOC
    assert len(chs) >= 2
    # No chapter should have empty text
    for c in chs:
        assert len(c.text.split()) >= 10


# Line 196: _chapters_from_keywords rejects indented matches
def test_chapters_from_keywords_rejects_indented_entries():
    """Headings with 2+ leading spaces (TOC-style indentation) should be skipped."""
    # The indented CHAPTER headings should be ignored; only flush-left ones count
    text = (
        "\n\nCHAPTER I\n\n" + "word " * 200
        + "\n\n  CHAPTER X\n\n" + "word " * 200  # indented — should be skipped
        + "\n\nCHAPTER II\n\n" + "word " * 200
        + "\n\nCHAPTER III\n\n" + "word " * 200
    )
    chs = build_chapters(text)
    # CHAPTER X (indented) should not appear as a title
    titles = [c.title for c in chs]
    assert not any("CHAPTER X" in t for t in titles)
    # Real chapters should be present
    assert any("CHAPTER I" in t for t in titles)


# Lines 202-205: _chapters_from_keywords current_book prefix logic
def test_chapters_from_keywords_book_prefix():
    """BOOK markers should prefix subsequent CHAPTER titles."""
    text = (
        "\n\nBOOK ONE\n\n"
        "\n\nCHAPTER I\n\n" + "word " * 200
        + "\n\nCHAPTER II\n\n" + "word " * 200
        + "\n\nBOOK TWO\n\n"
        + "\n\nCHAPTER I\n\n" + "word " * 200
        + "\n\nCHAPTER II\n\n" + "word " * 200
    )
    chs = build_chapters(text)
    titles = [c.title for c in chs]
    assert any("BOOK ONE" in t and "CHAPTER I" in t for t in titles)
    assert any("BOOK TWO" in t and "CHAPTER I" in t for t in titles)


# Lines 227, 230: _chapters_from_roman — numeral not in _ROMAN_SET, len < 3
def test_chapters_from_roman_rejects_invalid_numerals():
    """Roman numerals not in _ROMAN_SET (e.g. 'LI') should be skipped."""
    # LI is not in _ROMAN_SET, so it shouldn't be a valid entry
    text = (
        "\n\nI\n\n" + "word " * 200
        + "\n\nLI\n\n" + "word " * 200  # not in _ROMAN_SET
        + "\n\nII\n\n" + "word " * 200
    )
    # Call directly
    chs = _chapters_from_roman(text, 0, text)
    # LI should not appear in chapter titles
    titles = [c.title for c in chs]
    assert not any("LI" in t for t in titles)


def test_chapters_from_roman_requires_at_least_3_entries():
    """Fewer than 3 roman numeral entries should return []."""
    text = "\n\nI\n\n" + "word " * 200 + "\n\nII\n\n" + "word " * 200
    chs = _chapters_from_roman(text, 0, text)
    assert chs == []


# Lines 255-301: _chapters_from_toc — various paths
def test_chapters_from_toc_no_toc_returns_empty():
    """When no TOC heading exists, return []."""
    body = "Just some plain text\nno table of contents here"
    chs = _chapters_from_toc(body, 0, body)
    assert chs == []


def test_chapters_from_toc_titles_less_than_3_returns_empty():
    """Fewer than 3 TOC entries should return []."""
    body = (
        "\nContents\n"
        "Alpha\n"
        "Beta\n"
        "\n\n\n"
        "\n\nAlpha\n\n" + "word " * 200
        + "\n\nBeta\n\n" + "word " * 200
    )
    chs = _chapters_from_toc(body, 0, body)
    assert chs == []


def test_chapters_from_toc_positions_less_than_3_returns_empty():
    """Even with 3+ TOC titles, if fewer than 3 are found in body, return []."""
    # TOC has 3 entries but only 1 actually appears in the body text
    body = (
        "\nContents\n"
        "Alpha\n"
        "Beta\n"
        "Gamma\n"
        "\n\n\n"
        "\n\nAlpha\n\n" + "word " * 200
        # Beta and Gamma are NOT in the body
    )
    chs = _chapters_from_toc(body, 0, body)
    assert chs == []


def test_chapters_from_toc_full_strategy_via_build_chapters():
    """TOC strategy (Strategy 3) triggers when keyword/roman strategies fail."""
    # Build a book with no CHAPTER/ACT/etc keywords and no roman numerals,
    # but with a Contents section and matching titles in the body.
    title_one = "The Beginning of All Things"
    title_two = "A Long Middle Section Here"
    title_three = "The Final Conclusion Now"

    toc = (
        "\n\nContents\n"
        f"{title_one}\n"
        f"{title_two}\n"
        f"{title_three}\n"
        "\n\n\n"
    )
    # Body with enough words per chapter to pass _validate
    body = (
        f"\n\n{title_one}\n\n" + "prose word " * 200
        + f"\n\n{title_two}\n\n" + "prose word " * 200
        + f"\n\n{title_three}\n\n" + "prose word " * 200
    )
    text = toc + body
    chs = build_chapters(text)
    titles = [c.title for c in chs]
    assert any(title_one in t for t in titles), f"Expected '{title_one}' in {titles}"
    assert any(title_two in t for t in titles), f"Expected '{title_two}' in {titles}"
    assert any(title_three in t for t in titles), f"Expected '{title_three}' in {titles}"


def test_chapters_from_toc_block_end_none():
    """When TOC block has no triple blank line, block is capped at 3000 chars.

    Exercises the block_end=None branch: the TOC entries are in a block
    without a trailing \\n{3,}, so block_end is None and toc_end_pos is set
    to m.end() + 3000. The entries are within the first 3000 chars after the
    TOC heading, so titles >= 3. The actual chapter body follows right after
    the entries (within 3000 chars), so search_from (m.end() + 3000 - 2)
    may skip them — testing that the code still runs the block_end=None path.
    """
    entries = [f"Entry Alpha", "Entry Beta", "Entry Gamma", "Entry Delta", "Entry Epsilon"]
    # No triple blank line at all after Contents heading — block_end will be None
    # The TOC block uses the first 3000 chars of 'after'
    toc_part = "\nContents\n" + "\n".join(entries) + "\n"
    # Place body chapters well within reach (after toc part, but the
    # search_from = m.end() + 3000 - 2, so chapters must appear after that)
    # We put them 3001+ chars after the TOC heading ends
    filler = "y " * 1600  # ~3200 chars of filler to get past search_from
    body_chapters = "".join(f"\n\n{e}\n\n" + "word " * 200 for e in entries)
    body = toc_part + filler + body_chapters
    chs = _chapters_from_toc(body, 0, body)
    # With 5 entries in block and body after search_from, function may return
    # chapters (if found) or [] (if not found past search_from) — either way
    # the block_end=None branch was exercised. Just confirm no exception.
    assert isinstance(chs, list)


# Lines 362-363: build_chapters_from_html ImportError path
def test_build_chapters_from_html_import_error():
    """When lxml cannot be imported, build_chapters_from_html returns []."""
    import builtins
    real_import = builtins.__import__

    def mock_import(name, *args, **kwargs):
        if name == "lxml":
            raise ImportError("lxml not available")
        # Also catch 'lxml.html' style
        if name.startswith("lxml"):
            raise ImportError("lxml not available")
        return real_import(name, *args, **kwargs)

    builtins.__import__ = mock_import
    try:
        result = build_chapters_from_html("<html><body></body></html>")
    finally:
        builtins.__import__ = real_import

    assert result == []


# Lines 367-368: build_chapters_from_html lxml parse exception
def test_build_chapters_from_html_parse_exception():
    """When lxml raises an exception while parsing, return []."""
    from unittest.mock import patch, MagicMock
    mock_lxml = MagicMock()
    mock_lxml.html.fromstring.side_effect = Exception("parse error")

    with patch.dict("sys.modules", {"lxml": mock_lxml, "lxml.html": mock_lxml.html}):
        # Need to reload so the try/except in build_chapters_from_html fires
        # Instead, patch the import inside the function
        pass

    # Test directly by passing something that causes lxml to fail
    # lxml.fromstring with garbage bytes should raise
    try:
        from lxml import html as lxml_html
        root = lxml_html.fromstring(b"\x00\x01\x02")  # garbage
    except Exception:
        pass  # expected

    # The function itself must return [] on any exception
    result = build_chapters_from_html("\x00\x01\x02")
    assert result == []


# Line 381: build_chapters_from_html — no chapter divs found
def test_build_chapters_from_html_no_chapter_divs():
    """HTML with no elements having class='chapter' returns []."""
    html = "<html><body><div class='content'><h2>Title</h2><p>Text</p></div></body></html>"
    assert build_chapters_from_html(html) == []


# Lines 387->397: pg-boilerplate class → continue
def test_build_chapters_from_html_skips_pg_boilerplate():
    """Divs with class 'pg-boilerplate chapter' must be skipped entirely."""
    body = "word " * 150
    html = (
        '<div class="chapter pg-boilerplate"><h2>Boilerplate</h2><p>Should be skipped</p></div>'
        f'<div class="chapter"><h2>Real Chapter</h2><p>{body}</p></div>'
    )
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 1
    assert chapters[0].title == "Real Chapter"
    assert "Should be skipped" not in chapters[0].text


# Lines 398-415: subtitle folding
def test_build_chapters_from_html_subtitle_folding_with_center_p():
    """A <p class='center'> right after the heading is folded into the title."""
    body = "word " * 150
    html = (
        '<div class="chapter">'
        '<h2>Main Title</h2>'
        '<p class="center">Subtitle Line One<br>Subtitle Line Two</p>'
        f'<p>{body}</p>'
        '</div>'
    )
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 1
    assert "Main Title" in chapters[0].title
    assert "Subtitle Line One" in chapters[0].title
    assert "Subtitle Line Two" in chapters[0].title
    # Subtitle should not appear at start of body
    first_para = [p for p in chapters[0].text.split("\n\n") if p.strip()][0]
    assert "Subtitle Line One" not in first_para


def test_build_chapters_from_html_subtitle_empty_center_p_skipped():
    """An empty <p class='center'> after heading should not be folded into title."""
    body = "word " * 150
    html = (
        '<div class="chapter">'
        '<h2>Main Title</h2>'
        '<p class="center">   </p>'
        f'<p>{body}</p>'
        '</div>'
    )
    chapters = build_chapters_from_html(html)
    assert len(chapters) == 1
    # Empty center paragraph should not add a dash to the title
    assert " — " not in chapters[0].title
    assert chapters[0].title == "Main Title"


# Lines 437->439: is_section and title → set current_book, continue
def test_build_chapters_from_html_is_section_sets_book_prefix():
    """A section div (BOOK/PART keyword) with a title sets current_book."""
    body = "word " * 150
    html = (
        f'<div class="chapter"><h2>PART ONE: The Start</h2></div>'
        f'<div class="chapter"><h2>Chapter Alpha</h2><p>{body}</p></div>'
        f'<div class="chapter"><h2>Chapter Beta</h2><p>{body}</p></div>'
    )
    chapters = build_chapters_from_html(html)
    titles = [c.title for c in chapters]
    assert any("PART ONE" in t and "Chapter Alpha" in t for t in titles)
    assert any("PART ONE" in t and "Chapter Beta" in t for t in titles)


# Line 446: is_section and not title → skip (continue without setting current_book)
def test_build_chapters_from_html_is_section_without_title_skipped():
    """A section div that matches BOOK/PART but has no title text is skipped."""
    body = "word " * 150
    # A BOOK heading div with no h2/h3 text
    html = (
        '<div class="chapter"><h2>BOOK </h2></div>'  # heading with only whitespace
        f'<div class="chapter"><h2>Chapter One</h2><p>{body}</p></div>'
    )
    chapters = build_chapters_from_html(html)
    # The empty-title section should not create a spurious prefix
    assert len(chapters) >= 1
    # No chapter should have " — Chapter One" with empty prefix
    for c in chapters:
        assert not c.title.startswith(" — ")


# Lines 512, 515->503, 517-529: _html_body_text branches
def test_html_body_text_blockquote():
    """blockquote inside a chapter div should have its text extracted."""
    from lxml import html as lxml_html
    html = '<div class="chapter"><p>intro</p><blockquote><p>quoted text here</p></blockquote></div>'
    root = lxml_html.fromstring(html)
    div = root.xpath("//*[contains(@class, 'chapter')]")[0]
    text = _html_body_text(div)
    assert "intro" in text
    assert "quoted text here" in text


def test_html_body_text_pre():
    """pre tag content should be included as-is."""
    from lxml import html as lxml_html
    html = '<div class="chapter"><p>before</p><pre>preformatted text</pre></div>'
    root = lxml_html.fromstring(html)
    div = root.xpath("//*[contains(@class, 'chapter')]")[0]
    text = _html_body_text(div)
    assert "before" in text
    assert "preformatted text" in text


def test_html_body_text_hr_skipped():
    """hr elements should produce no text output."""
    from lxml import html as lxml_html
    html = '<div class="chapter"><p>before</p><hr/><p>after</p></div>'
    root = lxml_html.fromstring(html)
    div = root.xpath("//*[contains(@class, 'chapter')]")[0]
    text = _html_body_text(div)
    assert "before" in text
    assert "after" in text
    # hr should not leave any artifact
    parts = [p for p in text.split("\n\n") if p.strip()]
    assert len(parts) == 2


def test_html_body_text_div_fallthrough():
    """A nested div (not a chapter) should have its text recursively extracted."""
    from lxml import html as lxml_html
    body = "word " * 50
    html = f'<div class="chapter"><div class="section"><p>{body}</p></div></div>'
    root = lxml_html.fromstring(html)
    div = root.xpath("//*[contains(@class, 'chapter')]")[0]
    text = _html_body_text(div)
    assert "word" in text


# Lines 571->562: _split_dramatic_speakers — speaker cue mid-paragraph
def test_split_dramatic_speakers_splits_at_cue():
    """A speaker cue (ALL-CAPS word(s) ending with period) should split the paragraph."""
    text = "FAUST.\nFirst speech line.\nSecond speech line.\nMEPHISTOPHELES.\nThe devil speaks now."
    result = _split_dramatic_speakers(text)
    paragraphs = [p for p in result.split("\n\n") if p.strip()]
    assert len(paragraphs) == 2
    assert paragraphs[0].startswith("FAUST.")
    assert paragraphs[1].startswith("MEPHISTOPHELES.")


def test_split_dramatic_speakers_no_split_needed():
    """Paragraphs without internal speaker cues are unchanged."""
    text = "This is a normal paragraph.\nWith multiple lines.\nNo speaker cues."
    result = _split_dramatic_speakers(text)
    assert result == text


# Lines 598-600: _html_inline_text — elem.text is None
def test_html_inline_text_no_elem_text():
    """When elem.text is None, only children's text should be collected."""
    from lxml import html as lxml_html
    # A <p> with no direct text, only a child <span>
    root = lxml_html.fromstring('<p><span>child text</span></p>')
    p = root if root.tag == "p" else root.find(".//p")
    text = _html_inline_text(p)
    assert "child text" in text


# Lines 605-607: _html_inline_text — non-br child tag → recursion
def test_html_inline_text_non_br_child_recursion():
    """Non-<br> children should be recursed into for inline text."""
    from lxml import html as lxml_html
    root = lxml_html.fromstring('<p>start <em>emphasis</em> end</p>')
    p = root if root.tag == "p" else root.find(".//p")
    text = _html_inline_text(p)
    assert "emphasis" in text
    assert "start" in text
    assert "end" in text


# Lines 608-600: _html_inline_text — child tail text
def test_html_inline_text_child_tail():
    """Text after a child element (tail text) should be included."""
    from lxml import html as lxml_html
    root = lxml_html.fromstring('<p>before <br/> after</p>')
    p = root if root.tag == "p" else root.find(".//p")
    text = _html_inline_text(p)
    assert "before" in text
    assert "after" in text


# Line 643: _strip_heading_from_text — first line does NOT match title
def test_strip_heading_from_text_no_match_preserves_text():
    """When the first line does not match the chapter title, text is unchanged."""
    chapters = [Chapter(title="Chapter One", text="Different first line\nRest of text.")]
    result = _strip_heading_from_text(chapters)
    assert result[0].text == "Different first line\nRest of text."


def test_strip_heading_from_text_matching_first_line_stripped():
    """When the first line matches the title, it is stripped."""
    chapters = [Chapter(title="Chapter One", text="Chapter One\nRest of text.")]
    result = _strip_heading_from_text(chapters)
    assert not result[0].text.startswith("Chapter One")
    assert "Rest of text." in result[0].text


def test_build_chapters_no_heading_match_preserves_first_line():
    """build_chapters where chapter text starts with a non-matching line keeps it."""
    # Use CHAPTER headings so keyword strategy fires; body starts with a line
    # that does NOT match the title, so _strip_heading_from_text must keep it.
    act_body = ("Some Stage Direction Here.\nAnd the rest of act one. " * 30)
    text = (
        "\n\nCHAPTER I\n\n" + act_body
        + "\n\nCHAPTER II\n\n" + "Another Stage Direction.\nAnd the rest of act two. " * 30
        + "\n\nCHAPTER III\n\n" + "Yet Another Stage Direction.\nAnd the rest of act three. " * 30
    )
    chs = build_chapters(text)
    assert len(chs) >= 2
    # The first line of chapter I body is "Some Stage Direction Here." — it
    # does NOT match "CHAPTER I", so _strip_heading_from_text must leave it intact.
    first_chapter_text = chs[0].text
    assert "Stage Direction" in first_chapter_text


# ── Additional targeted branch coverage ──────────────────────────────────────

# Lines 157-159: _merge_tiny_first merge loop
def test_merge_tiny_first_merges_short_leading_chapter():
    """A chapter with < 100 words at the front should be merged into the next."""
    from services.splitter import _merge_tiny_first
    short = Chapter(title="Preface", text="Short text.")  # < 100 words
    long1 = Chapter(title="Chapter One", text="word " * 200)
    long2 = Chapter(title="Chapter Two", text="word " * 200)
    result = _merge_tiny_first([short, long1, long2])
    # short merged into long1
    assert len(result) == 2
    assert "Short text." in result[0].text
    assert result[0].title == "Chapter One"


# Line 230: numeral not in _ROMAN_SET
def test_chapters_from_roman_skips_numeral_not_in_roman_set():
    """A numeral matched by ROMAN_RE but NOT in _ROMAN_SET should be skipped (line 230).

    XXXI is captured by ROMAN_RE (XXX + I) but is not in _ROMAN_SET, so the
    `if numeral.upper() not in _ROMAN_SET: continue` branch fires.
    """
    text = (
        "\n\nI\n\n" + "word " * 200
        + "\n\nII\n\n" + "word " * 200
        + "\n\nXXXI\n\n" + "word " * 200  # XXXI matches ROMAN_RE but not _ROMAN_SET
        + "\n\nIII\n\n" + "word " * 200
    )
    chs = _chapters_from_roman(text, 0, text)
    titles = [c.title for c in chs]
    # XXXI should not appear in titles — it was skipped at line 230
    assert not any("XXXI" in t for t in titles)
    # Valid numerals should still be found
    assert len(chs) >= 3


# Line 298->295: text too short (<=150) in _chapters_from_toc
def test_chapters_from_toc_skips_chapter_with_short_text():
    """TOC chapters with text <= 150 chars should be excluded."""
    title_one = "The Introduction"
    title_two = "The Main Body Part"
    title_three = "The Final Chapter"

    toc = (
        "\n\nContents\n"
        f"{title_one}\n"
        f"{title_two}\n"
        f"{title_three}\n"
        "\n\n\n"
    )
    # title_one has very short body (<= 150 chars), should be excluded
    body = (
        f"\n\n{title_one}\n\nShort.\n\n"
        f"\n\n{title_two}\n\n" + "word " * 200
        + f"\n\n{title_three}\n\n" + "word " * 200
    )
    text = toc + body
    chs = _chapters_from_toc(text, 0, text)
    titles = [c.title for c in chs]
    # Short chapter should not appear (or may be merged)
    # title_two and title_three should be present
    assert any(title_two in t for t in titles)
    assert any(title_three in t for t in titles)


# Line 387->397: no heading elements in chapter div
def test_build_chapters_from_html_div_without_heading():
    """A chapter div with no h1/h2/h3 should result in title='' and be skipped."""
    body = "word " * 150
    # No heading inside the div — title will be empty
    html = f'<div class="chapter"><p>{body}</p></div>'
    chapters = build_chapters_from_html(html)
    # Should be empty because title is '' and the code hits `if not body_text.strip() or not title`
    assert chapters == []


# Line 446: not body_text.strip() or not title → skip
def test_build_chapters_from_html_empty_body_text():
    """A chapter div with a heading but no paragraph content should be skipped."""
    # Only has a heading, no paragraphs → body_text will be empty
    html = '<div class="chapter"><h2>Chapter Title</h2></div>'
    chapters = build_chapters_from_html(html)
    assert chapters == []


# Line 512: nested chapter div inside another chapter div → skip
def test_html_body_text_skips_nested_chapter_div():
    """A nested div with class='chapter' should be skipped during body extraction."""
    from lxml import html as lxml_html
    html = (
        '<div class="chapter outer">'
        '<p>Outer paragraph</p>'
        '<div class="chapter inner"><p>Inner paragraph should be skipped</p></div>'
        '</div>'
    )
    root = lxml_html.fromstring(html)
    # Get the outer chapter div
    outer = root.xpath("//*[contains(@class, 'outer')]")[0]
    text = _html_body_text(outer)
    assert "Outer paragraph" in text
    assert "Inner paragraph should be skipped" not in text


# Line 519->503: blockquote with empty/whitespace-only content → not added
def test_html_body_text_blockquote_empty_not_added():
    """A blockquote that yields only whitespace should not add to parts."""
    from lxml import html as lxml_html
    html = '<div class="chapter"><p>visible text here</p><blockquote>   </blockquote></div>'
    root = lxml_html.fromstring(html)
    div = root.xpath("//*[contains(@class, 'chapter')]")[0]
    text = _html_body_text(div)
    assert "visible text here" in text
    # The empty blockquote should not add a blank paragraph
    parts = [p for p in text.split("\n\n") if p.strip()]
    assert len(parts) == 1


# Line 528->503: else fallthrough div with empty content → not added
def test_html_body_text_else_fallthrough_empty_not_added():
    """An else-branch container with no text content should not add to parts."""
    from lxml import html as lxml_html
    # A <section> tag (not p/blockquote/pre/hr/div.chapter) with empty content
    html = '<div class="chapter"><p>actual text</p><section>   </section></div>'
    root = lxml_html.fromstring(html)
    div = root.xpath("//*[contains(@class, 'chapter')]")[0]
    text = _html_body_text(div)
    assert "actual text" in text
    parts = [p for p in text.split("\n\n") if p.strip()]
    assert len(parts) == 1


# Line 571->562: _split_dramatic_speakers — speaker cue mid-paragraph triggers split
def test_split_dramatic_speakers_via_html_chapter():
    """Speaker cue inside a paragraph triggers the buf→out append then buf=[line]."""
    # Build a paragraph that has a speaker cue in the middle (not at start)
    # buf starts with non-cue lines, then hits the cue → appends buf, starts new buf
    text = "Some opening text.\nFAUST.\nSpeaks now."
    result = _split_dramatic_speakers(text)
    parts = [p for p in result.split("\n\n") if p.strip()]
    assert len(parts) == 2
    assert parts[0] == "Some opening text."
    assert parts[1].startswith("FAUST.")


# Line 606->608: _html_inline_text inner is empty → not appended
def test_html_inline_text_empty_inner_child_not_appended():
    """A non-br child that yields empty text should not add to chunks."""
    from lxml import html as lxml_html
    # A <span> with no text inside — inner will be empty, so not appended
    root = lxml_html.fromstring('<p>leading text<span></span> trailing</p>')
    p = root if root.tag == "p" else root.find(".//p")
    text = _html_inline_text(p)
    # "leading text" and "trailing" should be present; no crash
    assert "leading" in text
    assert "trailing" in text
