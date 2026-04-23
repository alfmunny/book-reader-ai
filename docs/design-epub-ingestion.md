# Design: EPUB Ingestion for Gutenberg Books

**Status:** Shipped (PR #547, 2026-04-23) — see [Shipped Implementation](#shipped-implementation) below for what changed from the proposal.  
**Author:** Investigation 2026-04-23  
**Relates to:** `services/splitter.py`, `services/book_chapters.py`, `services/gutenberg.py`, `backend/migrations/023_book_epubs.sql`

---

## 1. Background: Current Ingestion Pipeline

When a user adds a Gutenberg book the system does the following:

```
User adds book ID
      │
      ▼
get_book_meta()        ← Gutendex API: title, authors, format URLs
      │
      ▼
get_book_text()        ← downloads plain text (.txt) and stores in books.text
      │
      ▼
[On first chapter request]
split_with_html_preference()
      │
      ├─ Try get_book_html()    → build_chapters_from_html()   ✅ semantic <div class="chapter">
      │   (re-fetched each cold start, cached in-memory)
      │
      └─ Fall back to text      → build_chapters()              ⚠️ regex heuristics
              │
              ├─ KEYWORD_RE (CHAPTER, ACT, LETTER, ...)
              ├─ Roman numerals (I, II, III...)
              ├─ Table of Contents scraping
              └─ Word-count chunking (2000-word blocks, last resort)
```

**What is stored in the DB:** only the raw plain text (`books.text`). The HTML edition is fetched on-demand when chapters are first requested and cached in process memory — never persisted.

---

## 2. Problem Statement

### Where plain-text splitting breaks down

| Failure case | Example | Symptom |
|---|---|---|
| No keyword headings | Poetry collections, essays | Falls to roman-numeral or word-count fallback |
| Non-English keywords | Finnish "Luku", Arabic books | KEYWORD_RE misses → bad fallback |
| Plays with scene numbering | Shakespeare | Over-splits into dozens of tiny scenes |
| Epistolary novels | Frankenstein, Dracula | Recently fixed with LETTER keyword, but fragile |
| Books with complex TOC | Multi-volume works | TOC scraper produces wrong chapter boundaries |
| Prose without blank lines | Some 19th-century typesetting | Entire book becomes one chapter |

The **word-count fallback** (2,000-word chunks) is semantically meaningless — it cuts mid-sentence, mid-scene, or mid-dialogue. Translation alignment suffers because paragraph boundaries are lost.

### Why HTML edition partially solves it

The `build_chapters_from_html()` path (lxml + `<div class="chapter">`) gives near-perfect results when available. But:

- Only **~60% of Gutenberg books** have an HTML edition indexed by Gutendex.
- HTML editions can themselves be poorly structured (flat `<p>` soup, or missing chapter divs).
- HTML editions are fetched on-demand but **never stored**, so every cold-start re-downloads ~1–3 MB.

---

## 3. Why EPUB is the Right Middle Tier

Gutenberg publishes EPUBs for **~90% of books** (vs ~60% for HTML). The EPUB format provides:

| Property | Plain text | Gutenberg HTML | EPUB |
|---|---|---|---|
| Chapter boundaries | Heuristic regex | `<div class="chapter">` | Explicit spine/TOC |
| Chapter titles | Matched from text | `<h1>/<h2>` in div | NCX/nav `<navPoint>` |
| Paragraph structure | `\n\n` split | `<p>` tags | `<p>` tags in XHTML |
| Reading order | Implicit | Implicit | Explicit spine |
| Format availability | ~100% | ~60% | ~90% |
| File size | ~200–800 KB | ~200–600 KB | ~80–300 KB (no-images) |
| Already a dependency | — | lxml | **ebooklib** ✅ |

### EPUB structure (Gutenberg)

A Gutenberg EPUB is a ZIP archive containing:
- **`content.opf`** — manifest + spine (ordered list of document items)
- **`toc.ncx`** or **`nav.xhtml`** — TOC with human-readable chapter titles
- **`chapter_001.xhtml`, `chapter_002.xhtml`, ...** — one XHTML file per chapter

The spine gives guaranteed reading order; the NCX/nav gives guaranteed chapter titles. No regex needed.

```
book.epub
├── OEBPS/
│   ├── content.opf          ← spine: [ch01, ch02, ch03, ...]
│   ├── toc.ncx              ← "Chapter I — Down the Rabbit-Hole"
│   ├── chapter001.xhtml     ← <html><body><h2>Chapter I</h2><p>...</p></body></html>
│   ├── chapter002.xhtml
│   └── ...
└── META-INF/container.xml
```

---

## 4. Proposed Architecture

Add EPUB as a **second fallback** between HTML and plain text. No DB schema change is required — this mirrors how HTML is currently handled (fetched on-demand, cached in memory).

```
split_with_html_preference()
      │
      ├─ 1. Pre-split JSON?      → return directly            (uploaded books, EPUB pre-parsed)
      │
      ├─ 2. get_book_html()      → build_chapters_from_html() ← EXISTING (keep, priority 1)
      │      lxml + <div class="chapter">
      │      Accept if ≥ 2 chapters
      │
      ├─ 3. get_book_epub()      → build_chapters_from_epub() ← NEW (priority 2)
      │      ebooklib spine + NCX titles + lxml body extract
      │      Accept if ≥ 2 chapters
      │
      └─ 4. build_chapters(text) → regex splitter             ← EXISTING (last resort)
```

**Why keep HTML as priority 1:** The existing `<div class="chapter">` parsing is excellent and already battle-tested. EPUB is only needed when HTML is unavailable or malformed.

**Why EPUB before plain text:** EPUB provides explicit TOC and spine — structural information that the regex splitter has to guess. Even a mediocre EPUB parser will beat the plain-text fallback for most books.

---

## 5. New Components

### 5.1 `gutenberg.py` — `get_book_epub(book_id: int) -> bytes | None`

```python
async def get_book_epub(book_id: int) -> bytes | None:
    """Download the no-images EPUB from Gutenberg, if available.

    Prefers 'application/epub+zip' (no-images variant) from Gutendex formats
    to minimise download size (~80–300 KB vs 2–5 MB with images).
    Returns raw bytes or None.
    """
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(f"{GUTENBERG_SEARCH}/{book_id}")
            resp.raise_for_status()
            formats = resp.json().get("formats", {})
    except Exception:
        return None

    # Prefer no-images variant (smaller download)
    epub_url = ""
    for key, url in formats.items():
        if key == "application/epub+zip":
            if "noimages" in url:
                epub_url = url
                break
            elif not epub_url:
                epub_url = url  # images variant as fallback

    if not epub_url:
        return None

    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            resp = await client.get(epub_url)
            if resp.status_code == 200:
                return resp.content
    except Exception:
        return None
    return None
```

### 5.2 `splitter.py` — `build_chapters_from_epub(epub_bytes: bytes) -> list[Chapter]`

Core logic:

```python
def build_chapters_from_epub(epub_bytes: bytes) -> list[Chapter]:
    import io
    import ebooklib
    from ebooklib import epub as epublib

    book = epublib.read_epub(io.BytesIO(epub_bytes), options={"ignore_ncx": False})

    # Build ordered chapter list from spine
    spine_ids = {item_id for item_id, _ in book.spine}
    nav_titles = _extract_nav_titles(book)          # id → human title from NCX/nav
    skip_names = {"nav.xhtml", "cover.xhtml", "toc.xhtml", "title.xhtml"}

    chapters: list[Chapter] = []
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        if item.get_name().lower() in skip_names:
            continue
        if item.get_id() not in spine_ids:
            continue

        html = item.get_content().decode("utf-8", errors="replace")
        title = nav_titles.get(item.get_id()) or _extract_html_title(html)
        text = _html_body_text(html)   # reuse existing helper from HTML splitter

        if not text.strip() or len(text.split()) < 30:
            continue  # skip nav pages, cover descriptions

        chapters.append(Chapter(title=title or f"Section {len(chapters)+1}", text=text))

    return chapters if len(chapters) >= 2 else []


def _extract_nav_titles(book) -> dict[str, str]:
    """Return {item_id: title} from NCX or EPUB3 nav document."""
    titles: dict[str, str] = {}
    # Try NCX (EPUB2)
    ncx = book.toc
    _walk_ncx(ncx, titles, book)
    return titles
```

**Key decisions:**
- Use `book.spine` for reading order (not `get_items_of_type` which is unordered).
- Pull titles from NCX/nav — do not rely on `<h1>` in body (inconsistent across publishers).
- Reuse `_html_body_text()` from the existing HTML splitter to extract clean paragraph text.
- Skip items shorter than 30 words (nav pages, cover pages, colophon).
- Return `[]` if fewer than 2 chapters — caller falls through to next strategy.

### 5.3 `book_chapters.py` — Insert EPUB tier

```python
async def split_with_html_preference(book_id: int, text: str) -> list[Chapter]:
    ...
    # 1. Pre-split JSON (existing)
    # 2. HTML (existing)

    # 3. EPUB — new tier
    epub_bytes = await asyncio.get_event_loop().run_in_executor(
        None, lambda: asyncio.run(get_book_epub(book_id))
    )
    # (or just: epub_bytes = await get_book_epub(book_id))
    if epub_bytes:
        epub_chapters = await asyncio.get_event_loop().run_in_executor(
            None, build_chapters_from_epub, epub_bytes
        )
        if len(epub_chapters) >= 2:
            _chapter_cache[book_id] = epub_chapters
            return epub_chapters

    # 4. Plain text regex fallback (existing)
    ...
```

---

## 6. Storage Strategy

**Proposed:** Keep fetching on-demand (no DB change).

**Shipped (PR #547):** EPUBs are stored in the DB in a new `book_epubs` table. See [Shipped Implementation](#shipped-implementation) for why the decision changed.

### What happens to existing books?

A backfill script (`scripts/backfill_epubs.py`) fetches and stores EPUBs for all books already in the DB. New books have their EPUB fetched and stored in a background task at add-time.

---

## 7. Impact on Translation Alignment

The translation pipeline consumes `chapter.text` split by `\n\n` (paragraph boundaries). EPUB improves alignment in two ways:

**Before (plain-text fallback):**
```
chapter.text = "Alice was beginning to be very tired...  [2000 words of merged paragraphs]"
# \n\n boundaries are wherever the regex split ended — often mid-scene
```

**After (EPUB):**
```
chapter.text = "Alice was beginning to be very tired...\n\n"
              "So she was considering in her own mind...\n\n"
              "There was nothing so very remarkable..."
# \n\n boundaries come from <p> tags in the EPUB XHTML — paragraph-perfect
```

Each `<p>` in the EPUB body becomes one paragraph in `chapter.text`. The translator sees clean paragraph boundaries, which means:
- Sentence-level context is preserved within each batch.
- Paragraph count matches between source and translated output (no boundary drift).
- The reader's paragraph-by-paragraph display aligns 1:1 with translated paragraphs.

---

## 8. Improving User-Upload EPUB Parsing (book_parser.py)

The existing `parse_epub()` in `book_parser.py` uses item filename as the chapter title (a rough heuristic). It should be upgraded to use the same NCX title extraction as the new Gutenberg path. This is a secondary improvement — same implementation, same `_extract_nav_titles()` helper.

---

## 9. Trade-offs

| Trade-off | Decision |
|---|---|
| HTML vs EPUB as tier 2 | EPUB — covers more books (~90% vs ~60%), and structural info (TOC) is explicitly provided rather than inferred from `<div>` class names |
| Store EPUB bytes vs fetch-on-demand | Fetch-on-demand — avoids DB migration, consistent with existing HTML handling |
| EPUB over HTML | No — keep HTML as tier 1. It's already proven and `<div class="chapter">` is more semantically specific than EPUB spine items |
| Parse NCX vs `<h1>` in body for titles | NCX — body headings are unreliable (sometimes missing, sometimes duplicated inside paragraphs) |
| Spine order vs document order | Spine — EPUB spec guarantees spine order reflects intended reading order |
| Minimum chapter threshold | 2 (same as HTML path) — lets the caller fall through gracefully if EPUB yields only 1 section |

---

## 10. Implementation Plan

All changes stay within three existing files. No DB migration, no new tables, no frontend changes.

| Step | File | Change | Size |
|------|------|--------|------|
| 1 | `services/gutenberg.py` | Add `get_book_epub()` | ~35 lines |
| 2 | `services/splitter.py` | Add `build_chapters_from_epub()` + `_extract_nav_titles()` | ~80 lines |
| 3 | `services/book_chapters.py` | Insert EPUB tier into `split_with_html_preference()` | ~12 lines |
| 4 | `services/book_parser.py` | Upgrade `parse_epub()` to use NCX titles | ~20 lines |
| 5 | `tests/test_splitter.py` | Unit tests for EPUB parsing with fixture `.epub` bytes | ~60 lines |
| 6 | `tests/test_book_chapters.py` | Integration test: EPUB tier is preferred over plain text | ~30 lines |

**Estimated effort:** 1 session (~3–4 hours with tests).

---

## 11. Out of Scope

- **Storing EPUB files in the DB** — deferred; fetch-on-demand is sufficient.
- **Re-ingesting existing books** — not needed; the cascade runs automatically on cold start.
- **Displaying EPUB-native formatting** (bold, italic, images) in the reader — the reader consumes plain text; formatting is stripped at ingestion time. A separate "rich reader" feature would be needed for this.
- **EPUB DRM** — all Gutenberg EPUBs are DRM-free. Not applicable.
- **User upload: EPUB 3 nav vs EPUB 2 NCX** — `ebooklib` handles both; no special case needed.

---

## Shipped Implementation

**PR #547 merged 2026-04-23.** The shipped version differs from the proposal in one key area: **EPUB bytes are stored in the DB**, not fetched on-demand.

### What changed

| Section | Proposed | Shipped |
|---|---|---|
| Storage | Fetch on-demand, cache in memory | New `book_epubs` table (migration 023) with `epub_bytes BLOB` |
| Existing books | Automatic on cold-start | `scripts/backfill_epubs.py` one-time backfill |
| New books | Fetch on first chapter request | Fetch in background task at book-add time |
| HTML tier | Kept as tier 1 | **Removed** — EPUB is now tier 1 for Gutenberg books; plain-text regex is the only fallback |

### Why DB storage was chosen over on-demand

Railway's ephemeral filesystem means the process restarts frequently. An in-memory cache survives only for the lifetime of the process. Storing EPUBs in SQLite ensures chapter splitting is reliable and consistent across restarts without re-fetching from Gutenberg.

### New files shipped

| File | Purpose |
|---|---|
| `backend/migrations/023_book_epubs.sql` | `book_epubs` table: `book_id PK`, `epub_bytes BLOB`, `epub_url TEXT`, `cached_at TIMESTAMP` |
| `backend/services/gutenberg.py` | `get_book_epub()` — fetches no-images EPUB via Gutendex formats |
| `backend/services/db.py` | `save_book_epub()`, `get_book_epub_bytes()` |
| `backend/services/splitter.py` | `build_chapters_from_epub()` with spine order + NCX/nav titles |
| `backend/services/book_chapters.py` | DB-only split: EPUB (from DB) → plain-text regex. No on-demand HTML fetch. Background lazy fetch for existing books. |
| `backend/routers/books.py` | Fires EPUB download in background at `POST /books/{id}` (book-add) |
| `backend/services/book_parser.py` | `parse_epub()` delegates to `build_chapters_from_epub()` — user-upload uses same logic |
| `backend/scripts/backfill_epubs.py` | One-time backfill for books already in DB |
