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
MAX_CHAPTERS = 400

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
    # Remove single-line [Illustration] and [Illustration: short desc] tags.
    # Multi-line illustration blocks (which can wrap chapter headings) are
    # left alone — only the short inline markers are noise.
    body = re.sub(r'\[Illustration(?:: [^\]\n]{0,80})?\]', '', body)
    return body, offset


def _clean_title(title: str) -> str:
    """Remove Gutenberg bracket artifacts from chapter titles."""
    # Strip trailing brackets/parens that aren't balanced (e.g. "Chapter I.]")
    title = re.sub(r'[\]\)}>]+\s*$', '', title)
    # Strip leading brackets that aren't balanced
    title = re.sub(r'^[\[\({<]+', '', title)
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
    for m in KEYWORD_RE.finditer(body):
        if m.start() < toc_skip:
            continue  # skip TOC entries
        entries.append((m.group(1).strip(), offset + m.start()))

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

    # Find the position after the TOC
    toc_end_pos = m.end() + (block_end.end() if block_end else 3000)
    search_from = offset + toc_end_pos

    # Locate each title in the actual text
    positions: list[tuple[str, int]] = []
    for title in titles:
        escaped = re.escape(title)
        pattern = re.compile(
            r'\n{2,}[ \t]*' + escaped + r'[.!?]?[ \t]*\n',
            re.IGNORECASE,
        )
        found = pattern.search(full_text, search_from)
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


# ── Public API ───────────────────────────────────────────────────────────

def build_chapters(raw_text: str) -> list[Chapter]:
    raw_text = raw_text.replace('\r\n', '\n').replace('\r', '\n')
    body, offset = strip_boilerplate(raw_text)

    # Strategy 1: Keyword headings (CHAPTER, Chapitre, Kapitel, ACT, ...)
    chapters = _chapters_from_keywords(body, offset, raw_text)
    if _validate(chapters):
        return chapters

    # Strategy 2: Roman numeral headings (I, II, III, ...)
    chapters = _chapters_from_roman(body, offset, raw_text)
    if _validate(chapters):
        return chapters

    # Strategy 3: TOC-based splitting
    chapters = _chapters_from_toc(body, offset, raw_text)
    if _validate(chapters):
        return chapters

    # Strategy 4: Paragraph-based fallback
    return _chapters_from_paragraphs(body)
