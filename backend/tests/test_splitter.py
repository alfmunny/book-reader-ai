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
