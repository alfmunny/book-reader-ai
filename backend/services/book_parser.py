"""Parse uploaded .txt and .epub files into chapter lists."""
import re
import io
from typing import Any

CHAPTER_PATTERNS = [
    re.compile(r'^\s*CHAPTER\s+[IVXLCDM\d]+', re.I),
    re.compile(r'^\s*Chapter\s+\w+'),
    re.compile(r'^\s*PART\s+[IVXLCDM\d]+', re.I),
    re.compile(r'^\s*[IVX]{1,6}\.\s*$'),
    re.compile(r'^\s*\d+\.\s*$'),
    re.compile(r'^\s*[A-Z][A-Z\s]{4,40}\s*$'),
]

MAX_CHAPTERS = 200
FALLBACK_WORDS = 5000


def _is_chapter_boundary(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    return any(p.match(stripped) for p in CHAPTER_PATTERNS)


def _extract_title(text: str) -> str:
    for line in text.split('\n')[:20]:
        line = line.strip()
        if line and len(line) < 100:
            return line
    return "Untitled"


def parse_txt(content: str) -> dict[str, Any]:
    """Detect chapters in plain text. Returns {title, chapters: [{title, text}]}."""
    lines = content.splitlines()
    # Find boundaries: lines matching chapter pattern preceded by blank line
    boundaries: list[int] = []
    for i, line in enumerate(lines):
        if _is_chapter_boundary(line):
            # Check at least one blank line before (or start of file)
            prev_blank = i == 0 or (i > 0 and not lines[i - 1].strip())
            if prev_blank:
                boundaries.append(i)

    if len(boundaries) < 2:
        # Fallback: split every FALLBACK_WORDS words
        words = content.split()
        chunks = [words[i:i + FALLBACK_WORDS] for i in range(0, len(words), FALLBACK_WORDS)]
        chapters = [{"title": f"Part {idx + 1}", "text": " ".join(chunk)} for idx, chunk in enumerate(chunks)]
    else:
        boundaries = boundaries[:MAX_CHAPTERS]
        boundaries.append(len(lines))  # sentinel
        chapters = []
        for i in range(len(boundaries) - 1):
            start = boundaries[i]
            end = boundaries[i + 1]
            title = lines[start].strip()
            body = "\n".join(lines[start + 1:end]).strip()
            chapters.append({"title": title, "text": body})

    title = _extract_title(content)
    return {"title": title, "author": "Unknown", "chapters": chapters}


def parse_epub(file_bytes: bytes) -> dict[str, Any]:
    """Parse epub file. Returns {title, author, chapters: [{title, text}]}."""
    try:
        import ebooklib
        from ebooklib import epub
        from html.parser import HTMLParser

        class _TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self.text_parts: list[str] = []
                self._skip = False

            def handle_starttag(self, tag, attrs):
                if tag in ('script', 'style'):
                    self._skip = True

            def handle_endtag(self, tag):
                if tag in ('script', 'style'):
                    self._skip = False
                if tag in ('p', 'div', 'br', 'h1', 'h2', 'h3', 'h4'):
                    self.text_parts.append('\n')

            def handle_data(self, data):
                if not self._skip:
                    self.text_parts.append(data)

            def get_text(self) -> str:
                return ''.join(self.text_parts)

        book = epub.read_epub(io.BytesIO(file_bytes))

        title = book.get_metadata('DC', 'title')
        title = title[0][0] if title else "Untitled"
        author_meta = book.get_metadata('DC', 'creator')
        author = author_meta[0][0] if author_meta else "Unknown"

        chapters = []
        for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
            extractor = _TextExtractor()
            extractor.feed(item.get_content().decode('utf-8', errors='replace'))
            text = extractor.get_text().strip()
            if len(text) < 50:  # skip very short items (nav, cover pages)
                continue
            ch_title = item.get_name().split('/')[-1].replace('.xhtml', '').replace('.html', '')
            chapters.append({"title": ch_title, "text": text})

        return {"title": title, "author": author, "chapters": chapters[:MAX_CHAPTERS]}

    except ImportError:
        raise RuntimeError("ebooklib is not installed. Add it to requirements.txt.")
