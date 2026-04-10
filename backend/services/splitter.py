"""
Chapter splitting for Project Gutenberg plain-text books.

Strategy (in order):
1. Keyword headings  — CHAPTER I, ACT II, Kapitel 3, …
2. TOC section       — parse Contents/Inhaltsverzeichnis, locate each entry in text
3. Standalone lines  — short lines surrounded by blank lines (plays, poetry)
4. Word-count pages  — paragraph-grouped fallback preserving formatting
"""

import re
from dataclasses import dataclass

WORDS_PER_SECTION = 600

KEYWORD_RE = re.compile(
    r'\n{2,}([ \t]*(?:CHAPTER|BOOK|PART|ACT|SCENE|PROLOGUE|EPILOGUE|Kapitel|Akt|Szene|Teil)[^\n]{0,80})\n',
    re.IGNORECASE,
)

TOC_HEADING_RE = re.compile(
    r'\n[ \t]*(Contents|Inhaltsverzeichnis|TABLE OF CONTENTS|INHALT)[ \t]*\r?\n',
    re.IGNORECASE,
)


@dataclass
class Chapter:
    title: str
    text: str


# ── helpers ────────────────────────────────────────────────────────────────

def strip_boilerplate(text: str) -> tuple[str, int]:
    """Remove PG header/footer, return (body, offset_of_body_in_original)."""
    start_m = re.search(
        r'\*{3}\s*START OF THE PROJECT GUTENBERG[^\n]*\n', text, re.IGNORECASE
    )
    end_m = re.search(
        r'\*{3}\s*END OF THE PROJECT GUTENBERG[^\n]*', text, re.IGNORECASE
    )
    offset = start_m.end() if start_m else 0
    end = end_m.start() if end_m else len(text)
    return text[offset:end], offset


def parse_toc_section(body: str) -> list[str] | None:
    """Return list of title strings from a Contents/Inhaltsverzeichnis block."""
    m = TOC_HEADING_RE.search(body)
    if not m:
        return None
    # Grab text after the heading until the first triple blank line
    after = body[m.end():]
    block_end = re.search(r'\n{3,}', after)
    block = after[: block_end.start()] if block_end else after[:3000]
    titles = [
        line.strip()
        for line in block.splitlines()
        if 1 < len(line.strip()) < 70 and not re.match(r'^\d+$', line.strip())
    ]
    return titles if len(titles) > 2 else None


def chapters_from_toc(full_text: str, titles: list[str], search_from: int) -> list[Chapter]:
    """Locate each TOC title as a standalone line and slice chapter text."""
    positions: list[tuple[str, int]] = []
    for title in titles:
        escaped = re.escape(title)
        # Allow optional trailing punctuation (.!?) in the actual text
        pattern = re.compile(
            r'\n{2,}[ \t]*' + escaped + r'[.!?]?[ \t]*\r?\n', re.IGNORECASE
        )
        m = pattern.search(full_text, search_from)
        if m:
            positions.append((title, m.start()))

    chapters: list[Chapter] = []
    for i, (title, start) in enumerate(positions):
        end = positions[i + 1][1] if i + 1 < len(positions) else len(full_text)
        text = full_text[start:end].strip()
        if len(text) > 150:
            chapters.append(Chapter(title=title, text=text))
    return chapters


def chapters_from_standalone(body: str, offset: int, full_text: str) -> list[Chapter]:
    """Detect short lines surrounded by blank lines as section headings."""
    pattern = re.compile(r'\n{2,}([ \t]*[^\n]{2,50})[ \t]*\r?\n{2,}')
    entries: list[tuple[str, int]] = []
    for m in pattern.finditer(body):
        title = m.group(1).strip()
        # Skip lines with mid-sentence punctuation (likely prose, not headings)
        if re.search(r'[,;:]', title) or re.search(r'\.$', title):
            continue
        entries.append((title, offset + m.start()))

    if len(entries) < 3:
        return []

    chapters: list[Chapter] = []
    for i, (title, start) in enumerate(entries):
        end = entries[i + 1][1] if i + 1 < len(entries) else len(full_text)
        text = full_text[start:end].strip()
        if len(text) > 150:
            chapters.append(Chapter(title=title, text=text))
    return chapters


def chapters_from_paragraphs(body: str) -> list[Chapter]:
    """Fallback: group paragraphs into ~WORDS_PER_SECTION-word sections."""
    paragraphs = re.split(r'\n{2,}', body)
    chapters: list[Chapter] = []
    current: list[str] = []
    word_count = 0
    section_title = ""

    for para in paragraphs:
        w = len(para.strip().split())
        if word_count + w > WORDS_PER_SECTION and word_count > 0:
            chapters.append(Chapter(
                title=section_title,
                text="\n\n".join(current),
            ))
            current = []
            word_count = 0
            section_title = para.strip()[:60]
        if word_count == 0:
            section_title = para.strip()[:60]
        current.append(para)
        word_count += w

    if current:
        chapters.append(Chapter(title=section_title, text="\n\n".join(current)))
    return [c for c in chapters if c.text.strip()]


# ── public API ─────────────────────────────────────────────────────────────

def build_chapters(raw_text: str) -> list[Chapter]:
    # Normalize line endings (httpx may return \r\n from Gutenberg servers)
    raw_text = raw_text.replace('\r\n', '\n').replace('\r', '\n')
    body, offset = strip_boilerplate(raw_text)

    # 1. Keyword headings
    entries = [
        (m.group(1).strip(), offset + m.start())
        for m in KEYWORD_RE.finditer(body)
    ]
    if len(entries) > 2:
        chapters: list[Chapter] = []
        for i, (title, start) in enumerate(entries):
            end = entries[i + 1][1] if i + 1 < len(entries) else len(raw_text)
            chapters.append(Chapter(title=title, text=raw_text[start:end].strip()))
        return chapters

    # 2. TOC section (Faust, plays, collections)
    toc_titles = parse_toc_section(body)
    if toc_titles:
        toc_m = TOC_HEADING_RE.search(body)
        toc_pos = toc_m.start() if toc_m else 0
        triple_nl = body.find('\n\n\n', toc_pos)
        search_from = offset + max(triple_nl, 0)
        chapters = chapters_from_toc(raw_text, toc_titles, search_from)
        if len(chapters) > 2:
            return chapters

    # 3. Standalone heading heuristic
    chapters = chapters_from_standalone(body, offset, raw_text)
    if len(chapters) > 2:
        return chapters

    # 4. Paragraph fallback
    return chapters_from_paragraphs(body)
