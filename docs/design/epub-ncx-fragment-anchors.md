# EPUB NCX Fragment-Anchor Chapter Boundaries

**Status:** Shipped (design PR #968; impl PR #1055, 2026-04-24)
**Author:** Architect
**Date:** 2026-04-24
**Priority:** P2
**Prior work:** #964 (issue), #780 / #783 (prior cache-misalignment incidents), `reports/epub_parser_investigation_2026_04_24.md`

## Problem

`build_chapters_from_epub` (`backend/services/splitter.py:579`) walks the EPUB **spine** and emits one `Chapter` per spine item. But Gutenberg Ebookmaker frequently packs multiple navigable chapters into a single xhtml spine item, encoding chapter boundaries as **fragment anchors** (`file.xhtml#anchor`) inside the NCX navMap.

When a book uses this structure, the splitter collapses N navPoints into 1 chapter per spine file, destroying the book's chapter structure. The reader sees one gigantic chapter where the source has many.

### Measured impact

Full-catalog investigation (report: `reports/epub_parser_investigation_2026_04_24.md`) found every inspected Gutenberg EPUB (7/7) uses fragment anchors to some extent:

| Book | navPoints | Unique spine files | Splitter chapters | Collapse |
|---|---|---|---|---|
| #62215 Le Fantôme de l'Opéra | 36 | 5 | 4 | 9× |
| #25575 Mémoires d'Outre-Tombe | 450 | 7 | 8 | 56× |
| #43759 Geflügelte Worte | 814 | 21 | 20 | 40× |
| #77700 Alchemie | 693 | 81 | 92 | 7× |

This is the single largest class of chapter-structure bug in the catalog.

## Proposed solution

### Step 1 — Collect NCX anchor map per spine item

Extend `_epub_nav_titles` to return, per spine item, the ordered list of anchors-within-file with their navLabels:

```python
# returns {item_id: [(anchor_id_or_None, title), …]}
# - anchor_id_or_None: the "#xxx" fragment, or None if href is a bare filename
# - list is ordered by NCX playOrder / DOM appearance
# - list length == 1 means the current behaviour (one chapter for the whole file)
```

An NCX entry with `src="file.xhtml"` (no fragment) or the only entry for a given file stays in the length-1 case — no behaviour change for already-correct books.

### Step 2 — Segment xhtml at anchor boundaries

Inside the spine loop (`backend/services/splitter.py:611`):

For a spine item with `len(anchors) >= 2`:

1. Parse the xhtml with `lxml.html.fromstring` (already done at line 625)
2. After boilerplate/frontmatter/toc removal, locate each anchor element:
   - first pass: elements with `id=<anchor>`
   - fall back to `name=<anchor>` for legacy HTML
3. Walk the DOM in document order; when an anchor id is encountered, close the current chapter and start a new one
4. Extract text from each accumulated DOM fragment using the existing `_html_body_text`
5. Emit one `Chapter` per anchor slice, using NCX navLabel as title

For single-anchor spine items, keep current behaviour.

### Step 3 — Treat NCX as authoritative chapter count

Today line 672 requires `len(chapters) >= 2`, which has two problems:

- Rejects legitimate single-chapter EPUBs (issue #965, companion fix)
- Has no way to validate output count against what the NCX claimed

Change: after producing chapters, compare to the flattened NCX navPoint count. If we produced fewer than ~70% of NCX chapters and NCX has more than 2 navPoints, log a warning — this catches parser regressions. The `>= 2` guard itself is lifted as part of #965.

### Nested NCX navPoints

The NCX can be hierarchical (depth=3 in Alchemie #77700). Flattening rules:

- **Default flatten**: every leaf navPoint becomes a chapter; non-leaf navPoints contribute their title as a prefix ("Book I → Chapter 1 → Scene a") only when their href is unique (no separate leaf).
- **Skip purely structural**: navPoints whose href resolves to the same anchor as their first child are skipped (common in Gutenberg — a "Part" pointer that shares its anchor with the first chapter).
- Start with simple flattening; if it over-fragments in practice, add structural-skip heuristics.

## Schema / data migration

No schema changes. Re-splitting an already-cached book changes its chapter count, which affects:

- `chapters` table (rows keyed by `(book_id, chapter_index)`)
- `translations` table (rows keyed by `(book_id, chapter_index, target_lang, …)`)
- `audio_cache` table (same keyed by chapter_index)
- `reading_history`, `book_insights`, `chapter_summaries` (all chapter-indexed)
- `annotations.chapter_index`
- Frontmatter/backmatter navigation that may reference by index

**Risk profile:** same as prior splitter changes (#780/#783 taught us this the hard way for Faust + Kafka). A book's chapter_index is the translation cache key.

**Mitigation plan** (derived from the #780/#783 incident):

1. **Version the cache**. Add `splitter_version` column to `books` table; stamp rows on import. Any chapter-indexed cache read checks the version and invalidates on mismatch. (Out of scope for *this* design, but called out — ship in a follow-up before re-splitting anything.)
2. **Backfill gate**. A dedicated CLI `backend/scripts/resplit_book.py <book_id>` that:
   - re-runs `build_chapters_from_epub`
   - produces a before/after diff (chapter count, first/last title, first 200 chars of each chapter)
   - requires `--confirm` to write to the DB
   - deletes all cache rows for the book before writing new chapters
3. **No automatic re-split on parser update.** Books stay frozen with their original chapter count until explicitly re-split. New imports after the fix use the new parser.

## API changes

None at the public API surface. The function signature of `build_chapters_from_epub` is unchanged (`bytes → list[Chapter]`).

## Test plan

New tests in `backend/tests/test_splitter_epub.py`:

- `test_ncx_fragment_anchors_produce_one_chapter_per_anchor` — synthetic EPUB with 1 spine item, 4 anchors → expect 4 chapters with matching NCX titles
- `test_ncx_single_anchor_file_keeps_current_behaviour` — regression: 1 spine / 1 anchor stays as 1 chapter
- `test_ncx_missing_anchor_falls_back_gracefully` — NCX says `#foo` but `#foo` isn't in the DOM → whole file becomes one chapter, log warning
- `test_nested_ncx_flattens_to_leaves` — 3-level hierarchy → leaf count chapters
- Golden-file test for book #62215 — use the cached EPUB, assert chapter count ≈ 27 (real novel structure) ± heading/frontmatter tolerance

Existing tests should continue to pass (single-spine-item books dominate the current test corpus).

## Open questions

1. **Frontmatter anchors**: NCX often lists cover/title/copyright as separate anchors. Do we emit them as standalone chapters or drop them? (Current behaviour drops frontmatter *files* via `_SKIP_SUFFIXES`; extend the same logic to anchor titles? Blocklist: `Cover`, `Titlepage`, `Copyright`, language variants.)

2. **Anchor-less tail content**: if content appears *after* the last anchor in a file, which chapter does it belong to? (Propose: append to the final anchor's chapter.)

3. **Cache invalidation UX**: if we ship the re-split tool, should old cached books show a "re-split available" indicator in the admin panel? (Follow-up, not part of this design.)

4. **Interaction with #965 / #966**: should all three splitter fixes ship as a single batch behind the splitter-version gate, or sequentially? Sequential is safer but each ships its own potential chapter-count change.

## Rollout

1. Merge this design doc (this PR)
2. Implement splitter change behind tests (separate PR per #964)
3. Ship splitter-version cache gate (separate issue + PR, prerequisite before any re-split tool)
4. Ship `resplit_book.py` CLI (separate PR)
5. Re-split catalog incrementally; monitor translation cache for misalignment

## References

- Investigation report: `reports/epub_parser_investigation_2026_04_24.md`
- Related: #965 (single-chapter EPUB rejection), #966 (CJK text fallback)
- Prior art: #780 / #783 (Faust + Kafka cache misalignment after splitter change)
- Source: `backend/services/splitter.py:579` (`build_chapters_from_epub`), `:760` (`_epub_nav_titles`)
