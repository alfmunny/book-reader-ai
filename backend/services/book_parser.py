"""Parse uploaded .txt and .epub files into chapter lists."""
import re
import io
from typing import Any

# High-confidence chapter markers — unlikely to appear in front matter / preamble.
# Tried first; if ≥ 2 boundaries found here we use them exclusively.
_HC_PATTERNS = [
    re.compile(r'^\s*(CHAPTER|CHAPITRE|KAPITEL|CAPITULO|CAPO)\s+\S', re.I),
    re.compile(r'^\s*(PART|BOOK|SECTION|ACT)\s+\S', re.I),
    re.compile(r'^\s*[IVX]{1,6}\.\s*$'),    # I.  II.  III.
    re.compile(r'^\s*\d+\.\s*$'),             # 1.  2.  3.
    re.compile(r'^\s*\d+\s*$'),              # 1   2   3  (bare numbers — Hemingway, Chandler)
]

# Low-confidence: ALL-CAPS headings. More false positives in title/preamble;
# only used when HC patterns find fewer than 2 boundaries.
_LC_PATTERNS = [
    re.compile(r'^\s*[A-Z][A-Z\s]{4,40}\s*$'),
]

MAX_CHAPTERS = 200
FALLBACK_WORDS = 5000


def _find_boundaries(lines: list[str], patterns: list[re.Pattern]) -> list[int]:
    boundaries: list[int] = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        if any(p.match(stripped) for p in patterns):
            prev_blank = i == 0 or not lines[i - 1].strip()
            if prev_blank:
                boundaries.append(i)
    return boundaries


def _normalize_text(text: str) -> str:
    """Strip leading tab indentation and collapse excess blank lines."""
    lines = [line.lstrip('\t') for line in text.splitlines()]
    result = '\n'.join(lines)
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result.strip()


def _extract_title(text: str) -> str:
    for line in text.split('\n')[:20]:
        stripped = line.strip()
        if stripped and len(stripped) < 100:
            return stripped
    return "Untitled"


def _extract_author(text: str) -> str:
    for line in text.split('\n')[:30]:
        m = re.match(r'^\s*[Bb]y\s+(.+)$', line.strip())
        if m:
            candidate = m.group(1).strip()
            if 1 < len(candidate) < 80:
                return candidate
    return "Unknown"


def parse_txt(content: str) -> dict[str, Any]:
    """Detect chapters in plain text. Returns {title, author, chapters: [{title, text}]}."""
    lines = content.splitlines()

    # 1. Try high-confidence patterns only (avoids false positives from title/preamble).
    boundaries = _find_boundaries(lines, _HC_PATTERNS)

    # 2. Fall back to including all-caps headings if too few HC boundaries found.
    if len(boundaries) < 2:
        boundaries = _find_boundaries(lines, _HC_PATTERNS + _LC_PATTERNS)

    if len(boundaries) < 2:
        # Last resort: word-count splitting.
        words = content.split()
        chunks = [words[i:i + FALLBACK_WORDS] for i in range(0, len(words), FALLBACK_WORDS)]
        chapters = [
            {"title": f"Part {idx + 1}", "text": _normalize_text(" ".join(chunk))}
            for idx, chunk in enumerate(chunks)
        ]
    else:
        boundaries = boundaries[:MAX_CHAPTERS]
        boundaries.append(len(lines))  # sentinel

        chapters = []
        # Capture substantial front matter (copyright, dedication, etc.)
        front = _normalize_text("\n".join(lines[:boundaries[0]]))
        if len(front.split()) > 50:
            chapters.append({"title": "Front Matter", "text": front})

        for i in range(len(boundaries) - 1):
            start = boundaries[i]
            end = boundaries[i + 1]
            title = lines[start].strip()
            body = _normalize_text("\n".join(lines[start + 1:end]))
            chapters.append({"title": title, "text": body})

    return {
        "title": _extract_title(content),
        "author": _extract_author(content),
        "chapters": chapters,
    }


def parse_epub(file_bytes: bytes) -> dict[str, Any]:
    """Parse epub file. Returns {title, author, chapters: [{title, text}]}.

    Delegates to build_chapters_from_epub() for consistent spine-ordered,
    NCX-titled extraction shared with the Gutenberg ingestion path.
    """
    try:
        from services.splitter import build_chapters_from_epub
        from ebooklib import epub

        book_epub = epub.read_epub(io.BytesIO(file_bytes), options={"ignore_ncx": False})
        dc_title = book_epub.get_metadata("DC", "title")
        title = dc_title[0][0] if dc_title else "Untitled"
        author_meta = book_epub.get_metadata("DC", "creator")
        author = author_meta[0][0] if author_meta else "Unknown"

        chapters_obj = build_chapters_from_epub(file_bytes)
        chapters = [{"title": c.title, "text": c.text} for c in chapters_obj]

        return {"title": title, "author": author, "chapters": chapters[:MAX_CHAPTERS]}

    except ImportError:
        raise RuntimeError("ebooklib is not installed. Add it to requirements.txt.")
