"""Parse uploaded .txt and .epub files into chapter lists."""
import re
import io
import unicodedata
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


# ── Text decoding ────────────────────────────────────────────────────────────

# Tried in order, strictly. Order matters: a byte string valid in several of
# these decodes to different text in each, and the first match wins.
#
# latin-1 and cp1251 are deliberately NOT here — single-byte codecs accept any
# byte sequence, so putting them in this list would mean nothing is ever
# rejected and a Shift_JIS file would silently become mojibake.
_STRICT_ENCODINGS = ("utf-8-sig", "utf-8", "cp932", "euc-jp", "gb18030", "big5")

# Last resort for genuinely single-byte text. It cannot fail, so it is gated on
# the result looking like prose rather than binary.
#
# Which single-byte codec is right is not decidable from the bytes alone —
# cp1251 and latin-1 both accept everything, and the same bytes are valid
# Russian and valid French. charset-normalizer is consulted for the one
# distinction it makes reliably (Cyrillic has a distinctive byte distribution);
# anything else falls to latin-1, which covers Western European. Getting this
# wrong is recoverable — the text is readable and re-uploadable — unlike the
# errors="replace" it replaces, which destroyed the bytes.
_FALLBACK_ENCODINGS = ("latin-1",)

_CYRILLIC_CODECS = ("cp1251", "koi8-r", "koi8-u", "iso8859-5", "mac-cyrillic")

# Above this share of control characters the "decode" is binary noise, not text.
_MAX_JUNK_RATIO = 0.05


def _junk_ratio(text: str) -> float:
    """Share of characters that no prose contains — controls, surrogates, U+FFFD."""
    if not text:
        return 1.0
    bad = sum(
        1
        for ch in text
        if ch not in "\t\n\r"
        and (unicodedata.category(ch) in ("Cc", "Co", "Cs") or ch == "\ufffd")
    )
    return bad / len(text)


def _detected_cyrillic(data: bytes) -> tuple[str, ...]:
    """The detector's guess, but only when it says Cyrillic — see the note above."""
    try:
        from charset_normalizer import from_bytes

        best = from_bytes(data).best()
    except Exception:  # detector missing or unhappy — the fallbacks still apply
        return ()
    encoding = (best.encoding or "").replace("_", "-").lower() if best else ""
    return (encoding,) if encoding in _CYRILLIC_CODECS else ()


def decode_text_bytes(data: bytes) -> str:
    """Decode uploaded text, detecting its encoding. Raises ValueError if none fits.

    Japanese plain text is usually Shift_JIS, EUC-JP or ISO-2022-JP; Chinese is
    usually GB18030 or Big5. Decoding those as UTF-8 with errors="replace" turns
    every non-ASCII sequence into U+FFFD, destroying the text irreversibly (#2789)
    — so this never replaces, it either decodes or refuses.
    """
    if not data:
        raise ValueError("The file is empty.")

    # ISO-2022-JP is 7-bit: it decodes cleanly as UTF-8 into escape sequences
    # rather than Japanese, so it has to be recognised by its escapes first.
    if b"\x1b$" in data or b"\x1b(" in data:
        try:
            return data.decode("iso-2022-jp")
        except UnicodeDecodeError:
            pass

    # The junk check applies to every candidate, not only the single-byte ones:
    # NUL bytes are valid UTF-8, so a binary file "decodes" strictly into a
    # string of control characters.
    for encoding in _STRICT_ENCODINGS + _detected_cyrillic(data) + _FALLBACK_ENCODINGS:
        try:
            text = data.decode(encoding)
        except UnicodeDecodeError:
            continue
        if _junk_ratio(text) <= _MAX_JUNK_RATIO:
            return text

    raise ValueError(
        "Could not determine the file's text encoding. Save it as UTF-8 and try again."
    )


def parse_txt(content: str) -> dict[str, Any]:
    """Detect chapters in plain text. Returns {title, author, chapters: [{title, text}]}."""
    lines = content.splitlines()

    # 1. Try high-confidence patterns only (avoids false positives from title/preamble).
    boundaries = _find_boundaries(lines, _HC_PATTERNS)

    # 2. Fall back to including all-caps headings if too few HC boundaries found.
    if len(boundaries) < 2:
        boundaries = _find_boundaries(lines, _HC_PATTERNS + _LC_PATTERNS)

    if len(boundaries) < 2:
        # Last resort: split on length, but along LINE boundaries. Chunking a
        # flat word list and rejoining with spaces destroyed every line break
        # in the book — a Japanese upload arrived as one 248,000-character
        # paragraph, which left the reader nothing to review and the chapter
        # detector nothing to work with next time (owner, 2026-08-31).
        chunks: list[list[str]] = []
        current: list[str] = []
        words_in_current = 0
        for line in lines:
            words = line.split()
            # A file with no line breaks at all is still one line here, so a
            # line longer than the budget is broken on words — the only case
            # where a line break has to be invented.
            if len(words) > FALLBACK_WORDS:
                if current:
                    chunks.append(current)
                    current, words_in_current = [], 0
                for i in range(0, len(words), FALLBACK_WORDS):
                    chunks.append([" ".join(words[i : i + FALLBACK_WORDS])])
                continue
            current.append(line)
            words_in_current += len(words)
            if words_in_current >= FALLBACK_WORDS:
                chunks.append(current)
                current, words_in_current = [], 0
        if current:
            chunks.append(current)
        # A chunk that normalises to nothing is not a chapter: a whitespace-only
        # upload must still produce zero chapters so the route can reject it,
        # rather than a draft that can never be confirmed.
        bodies = [_normalize_text("\n".join(chunk)) for chunk in chunks]
        chapters = [
            {"title": f"Part {idx + 1}", "text": body}
            for idx, body in enumerate(b for b in bodies if b.strip())
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


# Script ranges are enough to tell a translator what it is reading. Uploads
# record no language at all — books.languages is [] — so a Japanese novel was
# translated as though it were English (owner, 2026-08-31).
_SCRIPTS = [
    ("ja", r"[\u3040-\u309f\u30a0-\u30ff]"),   # kana settles Japanese first
    ("ko", r"[\uac00-\ud7af\u1100-\u11ff]"),
    ("zh", r"[\u4e00-\u9fff]"),                  # ideographs without kana
    ("ru", r"[\u0400-\u04ff]"),
    ("el", r"[\u0370-\u03ff]"),
    ("he", r"[\u0590-\u05ff]"),
    ("ar", r"[\u0600-\u06ff]"),
    ("hi", r"[\u0900-\u097f]"),
]


def detect_language(text: str, sample: int = 4000) -> str:
    """Best guess at the language of `text`, by script. Falls back to English."""
    head = text[:sample]
    if not head.strip():
        return "en"
    for code, pattern in _SCRIPTS:
        hits = len(re.findall(pattern, head))
        # A stray borrowed word should not decide the language of a book.
        if hits >= 8:
            return code
    return "en"
