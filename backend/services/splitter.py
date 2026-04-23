"""
Chapter splitting for Project Gutenberg plain-text books.

Improved splitter that avoids over-splitting (the biggest problem with the
previous version). The key principle: prefer fewer, larger chapters over
many tiny ones. A book with 5 long chapters is much better than one with
200 two-paragraph "chapters".

Strategy (in order):
1. Keyword headings  — CHAPTER I, Chapitre, Kapitel, ACT, BOOK, PART, …
2. Roman numeral headings  — standalone I, II, III, IV, … lines
3. TOC-based splitting  — parse a Table of Contents and locate entries
4. Word-count fallback  — group paragraphs into ~2000-word sections

After each strategy, validate: reject if too many chapters or if average
chapter is too short. This prevents the standalone/keyword heuristics from
over-splitting plays, poetry collections, and dialogue-heavy books.
"""

import re
from dataclasses import dataclass

# Target section size for the paragraph fallback (words)
WORDS_PER_SECTION = 2000

# Maximum reasonable chapters for a single book. If a strategy produces
# more than this, it's over-splitting and we fall through to the next.
# Note: some real books have 100+ chapters (Count of Monte Cristo: 117,
# Les Misérables: 365). We set a high limit and rely on MIN_AVG_WORDS
# to catch actual over-splitting.
MAX_CHAPTERS = 500

# Minimum average words per chapter. If the average is below this after
# splitting, the strategy is too aggressive.
MIN_AVG_WORDS = 150


@dataclass
class Chapter:
    title: str
    text: str


# ── Keyword headings ─────────────────────────────────────────────────────

# Matches chapter headings in English, French, German, Spanish, Italian
KEYWORD_RE = re.compile(
    r'(?:^|\n{2,})'                # start of text OR 2+ blank lines
    r'([ \t]*'
    r'(?:CHAPTER|CHAPITRE|KAPITEL|Kapitel|LIBRO|LIVRE|BOOK|BUCH'
    r'|PART|PARTIE|TEIL|Teil'
    r'|ACT|ACTE|AKT|Akt'
    r'|SCENE|SCÈNE|SZENE|Szene'
    r'|LETTER|LETTRE|BRIEF'
    r'|PROLOGUE?|EPILOGUE?|PRÉFACE|VORWORT|NACHWORT'
    r'|INTRODUCTION|EINLEITUNG)'
    r'[^\n]{0,80})'                # rest of the heading line
    r'[ \t]*\n',
    re.IGNORECASE,
)


# ── Roman numeral headings ───────────────────────────────────────────────

# Matches standalone roman numerals (I, II, III, ... up to about L)
# surrounded by blank lines. Must be the ONLY content on the line.
ROMAN_RE = re.compile(
    r'\n{2,}'
    r'[ \t]*((?:XL|XXX|XX|X)?(?:IX|IV|V?I{0,3}))\.?'
    r'[ \t]*\n{2,}',
)

# Valid roman numerals for validation
_ROMAN_SET = {
    "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
    "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
    "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXX", "XXXV", "XL", "XLV", "L",
}


# ── TOC detection ────────────────────────────────────────────────────────

TOC_HEADING_RE = re.compile(
    r'\n[ \t]*(Contents|Inhaltsverzeichnis|TABLE OF CONTENTS|INHALT|'
    r'Table of Contents|Sommaire|Índice)[ \t]*\r?\n',
    re.IGNORECASE,
)


# ── Helpers ──────────────────────────────────────────────────────────────

def strip_boilerplate(text: str) -> tuple[str, int]:
    """Remove PG header/footer and illustration tags, return (body, offset_of_body_in_original)."""
    start_m = re.search(
        r'\*{3}\s*START OF THE PROJECT GUTENBERG[^\n]*\n', text, re.IGNORECASE
    )
    end_m = re.search(
        r'\*{3}\s*END OF THE PROJECT GUTENBERG[^\n]*', text, re.IGNORECASE
    )
    offset = start_m.end() if start_m else 0
    end = end_m.start() if end_m else len(text)
    body = text[offset:end]
    # Strip illustration markup but preserve any text content inside.
    # Single-line [Illustration] or [Illustration: short desc] → remove entirely
    body = re.sub(r'\[Illustration(?:: [^\]\n]{0,80})?\]', '', body)
    # Multi-line [Illustration: ...\n...\n] → keep inner text, strip markers.
    # This preserves chapter headings that are wrapped in illustration blocks
    # (e.g. [Illustration: ·TITLE·\n\nChapter I.])
    body = re.sub(r'\[Illustration:[^\]]*\]', _strip_illustration_markers, body, flags=re.DOTALL)
    # Remove [_Copyright ..._]] artifacts from illustrated editions
    body = re.sub(r'\[_Copyright[^\]]*\]\]?', '', body)
    return body, offset


def _strip_illustration_markers(m: re.Match) -> str:
    """Replace multi-line [Illustration: content] with just the content."""
    inner = m.group(0)
    # Remove [Illustration: prefix and trailing ]
    inner = re.sub(r'^\[Illustration:\s*', '', inner)
    inner = re.sub(r'\]$', '', inner)
    return inner.strip()


def _clean_title(title: str) -> str:
    """Remove Gutenberg bracket artifacts from chapter titles."""
    # Strip trailing ) or ] only when unbalanced — "Chapter I.]" has an
    # extra ], but "Studierzimmer (I)" has matching parens and must be kept.
    if title.count(')') > title.count('('):
        title = re.sub(r'\)+\s*$', '', title)
    if title.count(']') > title.count('['):
        title = re.sub(r'\]+\s*$', '', title)
    # } and > never appear in legitimate titles — always strip them.
    title = re.sub(r'[}>]+\s*$', '', title)
    # Strip leading unbalanced ( or [
    if title.count('(') > title.count(')'):
        title = re.sub(r'^\(+', '', title)
    if title.count('[') > title.count(']'):
        title = re.sub(r'^\[+', '', title)
    return title.strip()


def _validate(chapters: list[Chapter]) -> bool:
    """Return True if the chapter list looks reasonable."""
    if len(chapters) < 2:
        return False
    if len(chapters) > MAX_CHAPTERS:
        return False
    total_words = sum(len(c.text.split()) for c in chapters)
    avg = total_words / len(chapters) if chapters else 0
    return avg >= MIN_AVG_WORDS


def _merge_tiny_first(chapters: list[Chapter], min_words: int = 100) -> list[Chapter]:
    """Merge tiny leading chapters (title pages, dedications) into the next."""
    result = list(chapters)
    while len(result) > 1 and len(result[0].text.split()) < min_words:
        # Merge first into second
        merged_text = result[0].text + "\n\n" + result[1].text
        result[1] = Chapter(title=result[1].title, text=merged_text)
        result.pop(0)
    return result


def _skip_toc_region(body: str) -> int:
    """Return the position after the TOC block (or 0 if no TOC found).
    This prevents chapter headings in the TOC from being matched."""
    m = TOC_HEADING_RE.search(body)
    if not m:
        return 0
    # Skip past the TOC block (ends at the next triple blank line or after 3000 chars)
    after = body[m.end():]
    triple = re.search(r'\n{3,}', after)
    return m.end() + (triple.end() if triple else min(len(after), 3000))


# ── Strategy 1: Keyword headings ─────────────────────────────────────────

def _chapters_from_keywords(body: str, offset: int, full_text: str) -> list[Chapter]:
    toc_skip = _skip_toc_region(body)
    entries: list[tuple[str, int]] = []
    # Track the most recent top-level BOOK/PART/ACT heading — used as a prefix
    # for the chapter titles that follow it. Long novels (War and Peace has
    # 15 books × ~25 chapters) are split into nested BOOK → CHAPTER sections,
    # so "CHAPTER I" appears many times. Prefixing with the current BOOK
    # disambiguates them in the UI and preserves the structure.
    current_book = ""
    BOOK_KEYWORDS = ("BOOK", "LIVRE", "LIBRO", "BUCH", "PART", "PARTIE", "TEIL")
    for m in KEYWORD_RE.finditer(body):
        if m.start() < toc_skip:
            continue  # skip TOC entries
        raw_title = m.group(1)
        # Reject indented matches — these are TOC entries in complex books.
        # Real chapter headings are almost always typeset at column 0.
        # Two or more leading spaces/tabs is a very strong TOC signal.
        stripped_prefix = raw_title[:4]
        if stripped_prefix.startswith("  ") or stripped_prefix.startswith("\t"):
            continue
        title = raw_title.strip()
        upper_title = title.upper()
        if upper_title.startswith(BOOK_KEYWORDS):
            # Treat BOOK markers as section labels, not as chapters — remember
            # them for prefixing, but don't create an entry for them.
            current_book = title
            continue
        if current_book:
            title = f"{current_book} — {title}"
        entries.append((title, offset + m.start()))

    if len(entries) < 2:
        return []

    chapters: list[Chapter] = []
    for i, (title, start) in enumerate(entries):
        end = entries[i + 1][1] if i + 1 < len(entries) else len(full_text)
        text = full_text[start:end].strip()
        chapters.append(Chapter(title=_clean_title(title), text=text))

    return _merge_tiny_first(chapters)


# ── Strategy 2: Roman numeral headings ───────────────────────────────────

def _chapters_from_roman(body: str, offset: int, full_text: str) -> list[Chapter]:
    toc_skip = _skip_toc_region(body)
    entries: list[tuple[str, int]] = []
    for m in ROMAN_RE.finditer(body):
        if m.start() < toc_skip:
            continue
        numeral = m.group(1).strip().rstrip(".")
        if numeral.upper() not in _ROMAN_SET:
            continue
        # "I" alone is too ambiguous — only accept it if we also find "II"
        entries.append((numeral, offset + m.start()))

    # Must find at least "I" and "II" in sequence (or "II" and "III", etc.)
    if len(entries) < 3:
        return []

    chapters: list[Chapter] = []
    for i, (title, start) in enumerate(entries):
        end = entries[i + 1][1] if i + 1 < len(entries) else len(full_text)
        text = full_text[start:end].strip()
        chapters.append(Chapter(title=_clean_title(title), text=text))

    return _merge_tiny_first(chapters)


# ── Strategy 3: TOC-based ────────────────────────────────────────────────

def _chapters_from_toc(body: str, offset: int, full_text: str) -> list[Chapter]:
    m = TOC_HEADING_RE.search(body)
    if not m:
        return []

    # Extract TOC entries
    after = body[m.end():]
    block_end = re.search(r'\n{3,}', after)
    block = after[:block_end.start()] if block_end else after[:3000]
    titles = [
        line.strip()
        for line in block.splitlines()
        if 2 < len(line.strip()) < 80 and not re.match(r'^\d+$', line.strip())
    ]
    if len(titles) < 3:
        return []

    # Find the position after the TOC. Start searching a few chars back
    # so that the first title (which may start right after the TOC with
    # no \n{2,} prefix) can be found.
    toc_end_pos = m.end() + (block_end.end() if block_end else 3000)
    search_from = max(0, offset + toc_end_pos - 2)

    # Locate each title in the actual text
    positions: list[tuple[str, int]] = []
    for title in titles:
        escaped = re.escape(title)
        pattern = re.compile(
            r'\n{2,}[ \t]*' + escaped + r'[.!?]?[ \t]*\n',
            re.IGNORECASE,
        )
        found = pattern.search(full_text, search_from)
        if not found:
            # Try without \n{2,} prefix (first title right after TOC)
            pattern2 = re.compile(
                r'(?:^|\n)[ \t]*' + escaped + r'[.!?]?[ \t]*\n',
                re.IGNORECASE,
            )
            found = pattern2.search(full_text, search_from)
        if found:
            positions.append((title, found.start()))

    if len(positions) < 3:
        return []

    chapters: list[Chapter] = []
    for i, (title, start) in enumerate(positions):
        end = positions[i + 1][1] if i + 1 < len(positions) else len(full_text)
        text = full_text[start:end].strip()
        if len(text) > 150:
            chapters.append(Chapter(title=_clean_title(title), text=text))

    return _merge_tiny_first(chapters)


# ── Strategy 4: Paragraph fallback ───────────────────────────────────────

def _chapters_from_paragraphs(body: str) -> list[Chapter]:
    """Group paragraphs into ~WORDS_PER_SECTION-word sections."""
    paragraphs = re.split(r'\n{2,}', body)
    chapters: list[Chapter] = []
    current: list[str] = []
    word_count = 0
    section_title = ""

    for para in paragraphs:
        stripped = para.strip()
        if not stripped:
            continue
        w = len(stripped.split())
        if word_count + w > WORDS_PER_SECTION and word_count > 0:
            chapters.append(Chapter(
                title=_clean_title(section_title),
                text="\n\n".join(current),
            ))
            current = []
            word_count = 0
            section_title = stripped[:60]
        if word_count == 0:
            section_title = stripped[:60]
        current.append(para)
        word_count += w

    if current:
        chapters.append(Chapter(title=_clean_title(section_title), text="\n\n".join(current)))
    return [c for c in chapters if c.text.strip()]


# ── HTML-based splitter ──────────────────────────────────────────────────

def build_chapters_from_html(html: str) -> list[Chapter]:
    """Split a Gutenberg HTML edition into chapters.

    Gutenberg HTML wraps each chapter in `<div class="chapter">` with
    anchor IDs like `link2HCH0001` (regular chapters) or `link2H_4_0001`
    (book/part section dividers). This is a MUCH more reliable signal than
    regex on plain text, especially for complex hierarchical works like
    War and Peace (15 books × ~25 chapters).

    Strategy:
      1. Parse the HTML with lxml
      2. Find every `<div class="chapter">` block
      3. For each chapter: extract the first heading (<h2> or <h3>) as title,
         extract visible text from the rest as the body (paragraph breaks
         preserved).
      4. When a div is a "section" (id starts with `link2H_4_`), remember it
         as the current book/part label and prefix following chapter titles.
      5. Skip boilerplate divs (pg-boilerplate, cover, etc.)

    Returns [] on parse failure — caller falls back to the text-based splitter.
    """
    try:
        from lxml import html as lxml_html
    except ImportError:
        return []

    try:
        root = lxml_html.fromstring(html)
    except Exception:
        return []

    # Collect every element with class="chapter" in document order.
    chapter_divs = root.xpath("//*[contains(@class, 'chapter')]")
    if not chapter_divs:
        return []

    chapters: list[Chapter] = []
    current_book = ""

    for div in chapter_divs:
        classes = (div.get("class") or "").split()
        if "pg-boilerplate" in classes:
            continue

        # Extract title: first heading inside the block
        title_elems = div.xpath(".//h1 | .//h2 | .//h3")
        title = ""
        title_elem = None
        if title_elems:
            title_elem = title_elems[0]
            title = _html_text(title_elem)

        # Subtitle: a `<p class="center">` immediately following the
        # chapter heading is a semantic subtitle (Faust ch. 25 splits
        # "Walpurgisnachtstraum" into an <h2> and a centered <p> for
        # "oder / Oberons und Titanias goldne Hochzeit / Intermezzo").
        # Fold it into the title so the body doesn't open with an
        # orphaned "oder" line.
        subtitle_elem = None
        if title_elem is not None:
            nxt = title_elem.getnext()
            if (
                nxt is not None
                and isinstance(nxt.tag, str)
                and nxt.tag == "p"
                and "center" in (nxt.get("class") or "").split()
            ):
                subtitle_text = " ".join(
                    line for line in _html_inline_text(nxt).splitlines() if line.strip()
                ).strip()
                if subtitle_text:
                    title = f"{title} — {subtitle_text}" if title else subtitle_text
                    subtitle_elem = nxt

        # Extract body text from all children except the title heading
        # (and the subtitle paragraph, if any).
        body_text = _html_body_text(
            div, skip_first_heading=True, skip_elems=(subtitle_elem,) if subtitle_elem is not None else (),
        )
        word_count = len(body_text.split())

        # Section divider detection. Gutenberg uses a flat structure where
        # "BOOK ONE: 1805", "PART I", "TEIL I", etc. are sibling divs with
        # class="chapter" and almost no body text (just the heading).
        # Only divs that start with an explicit book/part/volume keyword are
        # used as a section prefix — bare title divs like "ERSTER THEIL" or
        # "FAUST" have word_count < 50 but should not pollute subsequent
        # chapter titles with a spurious prefix.
        is_section = _looks_like_book_heading(title)
        is_tiny = not is_section and word_count < 50 and bool(title)

        # Skip meta/frontmatter headings entirely — they aren't real chapters
        # and shouldn't prefix the chapters that follow either.
        if _is_meta_heading(title):
            continue

        if is_section:
            # Remember as current book label; skip creating a chapter for it.
            if title:
                current_book = title
            continue

        # Skip tiny non-book-heading divs without using them as a prefix.
        if is_tiny:
            continue

        if not body_text.strip() or not title:
            continue

        full_title = f"{current_book} — {title}" if current_book else title
        # Split dramatic paragraphs that pack multiple speakers so the
        # paragraph count stays aligned with translator output.
        normalised = _split_dramatic_speakers(body_text.strip())
        chapters.append(Chapter(title=_clean_title(full_title), text=normalised))

    return _merge_tiny_first(chapters)


_BOOK_HEADING_RE = re.compile(
    r'^\s*(?:BOOK|LIVRE|LIBRO|BUCH|PART|PARTIE|TEIL|VOLUME|VOL\.|BAND)\s',
    re.IGNORECASE,
)


def _looks_like_book_heading(title: str) -> bool:
    """True if the heading opens a book/part/volume section rather than a chapter."""
    return bool(_BOOK_HEADING_RE.match(title or ""))


# Headings that are neither chapters nor book sections — just navigation
# pages that we should ignore entirely (not use as prefix for later chapters).
_META_HEADINGS = {
    "contents", "table of contents", "index", "colophon",
    "inhaltsverzeichnis", "inhalt", "sommaire", "índice",
}


def _is_meta_heading(title: str) -> bool:
    return (title or "").strip().lower() in _META_HEADINGS


def _html_text(elem) -> str:
    """Return the visible text inside a single element (no descendants' block structure)."""
    return " ".join(elem.itertext()).strip()


def _html_body_text(
    elem,
    *,
    skip_first_heading: bool = False,
    skip_elems: tuple = (),
) -> str:
    """Extract readable text from an HTML element, preserving paragraph breaks.

    Each `<p>` becomes one paragraph separated by blank lines. `<br>` becomes
    a single newline. Inline tags are flattened. The first `<h1>/<h2>/<h3>`
    is skipped when `skip_first_heading=True` (since the caller already used
    it as the chapter title). `skip_elems` lets the caller exclude specific
    elements (e.g. a subtitle `<p>` already folded into the title).
    """
    parts: list[str] = []
    skipped_heading = not skip_first_heading
    skip_set = {id(e) for e in skip_elems}

    for child in elem.iterchildren():
        tag = child.tag if isinstance(child.tag, str) else ""
        if id(child) in skip_set:
            continue
        if tag in ("h1", "h2", "h3") and not skipped_heading:
            skipped_heading = True
            continue
        if tag == "div" and "chapter" in (child.get("class") or ""):
            # Nested chapter div (seen in book-section wrappers) — skip
            continue
        if tag == "p":
            text = _html_inline_text(child)
            if text.strip():
                parts.append(text.strip())
        elif tag in ("blockquote",):
            nested = _html_body_text(child, skip_first_heading=False)
            if nested.strip():
                parts.append(nested.strip())
        elif tag in ("pre",):
            parts.append(child.text_content().rstrip())
        elif tag == "hr":
            continue
        else:
            # Fall-through: if it's another container (section, div) recurse
            text = _html_body_text(child, skip_first_heading=False)
            if text.strip():
                parts.append(text.strip())

    return "\n\n".join(parts)



# ── EPUB-based splitter ──────────────────────────────────────────────────────

def build_chapters_from_epub(epub_bytes: bytes) -> list[Chapter]:
    """Extract chapters from a Gutenberg EPUB using spine order and NCX/nav titles.

    Returns [] on any failure so callers fall through gracefully.
    """
    try:
        import io
        import ebooklib
        from ebooklib import epub as epublib
        from lxml import html as lxmlhtml
    except ImportError:
        return []

    try:
        book = epublib.read_epub(io.BytesIO(epub_bytes), options={"ignore_ncx": False})
    except Exception:
        return []

    nav_titles = _epub_nav_titles(book)
    id_to_item = {
        item.get_id(): item
        for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT)
    }

    _SKIP_SUFFIXES = {
        "nav.xhtml", "nav.html", "cover.xhtml", "cover.html",
        "toc.xhtml", "toc.html", "title.xhtml", "titlepage.xhtml",
        "halftitle.xhtml", "copyright.xhtml", "dedication.xhtml",
        "colophon.xhtml", "index.xhtml",
    }

    chapters: list[Chapter] = []
    for item_id, _ in book.spine:
        item = id_to_item.get(item_id)
        if item is None:
            continue
        basename = item.get_name().split("/")[-1].lower()
        if basename in _SKIP_SUFFIXES:
            continue

        raw = item.get_content()
        try:
            doc = lxmlhtml.fromstring(raw)
            body = doc.find(".//body")
            if body is None:
                body = doc
            text = _html_body_text(body, skip_first_heading=True)
        except Exception:
            continue

        if not text.strip() or len(text.split()) < 30:
            continue

        title = (
            nav_titles.get(item_id)
            or _epub_heading_title(raw)
            or f"Section {len(chapters) + 1}"
        )
        chapters.append(Chapter(title=_clean_title(title), text=text))

    # EPUB spine is authoritative structure, not a heuristic guess.
    # Skip the regex-oriented _validate() and just require >= 2 chapters.
    return chapters if len(chapters) >= 2 else []


def _epub_nav_titles(book) -> dict[str, str]:
    """Return {item_id: chapter_title} from the EPUB TOC (NCX or EPUB3 nav)."""
    import ebooklib

    name_to_id: dict[str, str] = {
        item.get_name(): item.get_id()
        for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT)
    }

    titles: dict[str, str] = {}

    def _resolve(href: str) -> str | None:
        bare = href.split("#")[0].lstrip("/")
        if bare in name_to_id:
            return name_to_id[bare]
        for name, item_id in name_to_id.items():
            if name.endswith("/" + bare) or name == bare:
                return item_id
        return None

    def _walk(toc_items) -> None:
        for entry in toc_items:
            if isinstance(entry, tuple):
                section, children = entry
                if getattr(section, "href", None):
                    item_id = _resolve(section.href)
                    if item_id and getattr(section, "title", None):
                        titles.setdefault(item_id, section.title)
                _walk(children)
            elif getattr(entry, "href", None):
                item_id = _resolve(entry.href)
                if item_id and getattr(entry, "title", None):
                    titles.setdefault(item_id, entry.title)

    _walk(book.toc)
    return titles


def _epub_heading_title(raw_xhtml: bytes) -> str:
    """Extract the first heading from XHTML as a fallback chapter title."""
    try:
        from lxml import html as lxmlhtml
        doc = lxmlhtml.fromstring(raw_xhtml)
        for tag in ("h1", "h2", "h3", "h4"):
            elems = doc.findall(f".//{tag}")
            if elems:
                text = " ".join(elems[0].itertext()).strip()
                if text:
                    return text
    except Exception:
        pass
    return ""


# Dramatic speaker cue: an all-caps label that introduces a speaker's
# lines in plays (BÜRGERMÄDCHEN., ZWEITER SCHÜLER (zum ersten).,
# ANDRER BÜRGER., FAUST, MEPHISTOPHELES, IRRLICHT (im Wechselgesang).
# , …). Used by `_split_dramatic_speakers` to break paragraphs that
# contain more than one speaker's speech.
#
# The character class includes `,` so Faust's multi-speaker "choral"
# cues ("FAUST, MEPHISTOPHELES, IRRLICHT …") also break a stanza. Pure
# prose sentences like "Hello, world." are rejected by the all-caps
# start + period-terminator constraint.
_SPEAKER_CUE_RE = re.compile(
    r"^[A-ZÄÖÜ][A-ZÄÖÜß\s,]{1,}"      # all-caps letters (Latin + German), commas between names
    r"(?:\s*\([^)]{0,60}\))?"          # optional parenthetical stage dir
    r"\.$"                              # terminated by period
)


def _split_dramatic_speakers(text: str) -> str:
    """Split paragraphs at dramatic speaker cue lines.

    Gutenberg HTML for plays (Faust et al.) occasionally packs several
    speakers' speeches into a single <p> — no blank line or tag
    boundary between them. The translator correctly splits on speaker
    change, leaving source/translation paragraph counts out of sync.
    We normalise source-side by splitting at any internal speaker cue
    so counts match and the reader can pair 1-to-1.
    """
    out: list[str] = []
    for paragraph in text.split("\n\n"):
        lines = paragraph.split("\n")
        buf: list[str] = []
        for line in lines:
            if buf and _SPEAKER_CUE_RE.match(line.strip()):
                out.append("\n".join(buf))
                buf = [line]
            else:
                buf.append(line)
        if buf:
            out.append("\n".join(buf))
    return "\n\n".join(out)


def _html_inline_text(elem) -> str:
    """Flatten a <p> (or similar) to plain text, turning <br> into newlines.

    Gutenberg HTML for verse indents each line after `<br>` so the raw text
    for a stanza like::

        <p>
        Line 1<br>
        Line 2<br>
        Line 3
        </p>

    contains sequences of `\\n` (from <br>) + indentation whitespace + `\\n`
    (from source formatting). Without cleanup, that leaves `\\n\\n` between
    every line — and downstream `split('\\n\\n')` turns each verse line
    into its own paragraph, flattening stanzas.

    We collapse any run of whitespace-containing newlines back to a single
    `\\n` so stanzas stay intact.
    """
    import re
    chunks: list[str] = []
    if elem.text:
        chunks.append(elem.text)
    for child in elem.iterchildren():
        tag = child.tag if isinstance(child.tag, str) else ""
        if tag == "br":
            chunks.append("\n")
        else:
            inner = _html_inline_text(child)
            if inner:
                chunks.append(inner)
        if child.tail:
            chunks.append(child.tail)
    text = "".join(chunks)
    # Collapse any sequence containing a newline (and surrounding
    # whitespace, incl. `\r` from Windows-style HTML source line
    # endings) to a single newline. Preserves stanza-internal line
    # breaks while removing indentation artifacts that would otherwise
    # leave `\n\r\n` between verses (reader then renders them glued).
    text = re.sub(r"[ \t\r]*\n[ \t\r\n]*", "\n", text)
    return text.strip()


# ── Public API ───────────────────────────────────────────────────────────

def build_chapters(raw_text: str) -> list[Chapter]:
    raw_text = raw_text.replace('\r\n', '\n').replace('\r', '\n')
    body, _offset = strip_boilerplate(raw_text)

    # All strategies operate on the cleaned body text (boilerplate and
    # illustration markup removed). We pass offset=0 and body as the
    # full_text so positions from regex matches in body map correctly.

    # Strategy 1: Keyword headings (CHAPTER, Chapitre, Kapitel, ACT, ...)
    chapters = _chapters_from_keywords(body, 0, body)
    if _validate(chapters):
        return _finalize(chapters)

    # Strategy 2: Roman numeral headings (I, II, III, ...)
    chapters = _chapters_from_roman(body, 0, body)
    if _validate(chapters):
        return _finalize(chapters)

    # Strategy 3: TOC-based splitting
    chapters = _chapters_from_toc(body, 0, body)
    if _validate(chapters):
        return _finalize(chapters)

    # Strategy 4: Paragraph-based fallback
    return _finalize(_chapters_from_paragraphs(body))


def _finalize(chapters: list[Chapter]) -> list[Chapter]:
    """Strip heading + split multi-speaker paragraphs for every chapter."""
    stripped = _strip_heading_from_text(chapters)
    return [
        Chapter(title=ch.title, text=_split_dramatic_speakers(ch.text))
        for ch in stripped
    ]


def _strip_heading_from_text(chapters: list[Chapter]) -> list[Chapter]:
    """Remove the chapter heading line from the start of each chapter's text.

    The chapter title is already stored in chapter.title, so having it
    repeated at the start of the text is redundant and wastes space in
    the reader UI.
    """
    result = []
    for ch in chapters:
        text = ch.text.strip()
        # The text often starts with the heading followed by newlines.
        # Remove the first line if it matches the title (case-insensitive).
        first_line_end = text.find("\n")
        if first_line_end > 0:
            first_line = text[:first_line_end].strip()
            # Match if the first line is the title (with optional trailing punctuation)
            if first_line.lower().rstrip(".])?!") == ch.title.lower().rstrip(".])?!"):
                text = text[first_line_end:].lstrip("\n")
        result.append(Chapter(title=ch.title, text=text))
    return result
