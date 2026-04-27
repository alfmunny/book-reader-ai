# EPUB Parser Investigation — 2026-04-24

Full-catalog investigation of cached Gutenberg EPUBs to identify chapter-parser gaps.

## Method

1. Ran `epub_split_audit` on 91 cached EPUBs → 25 flagged anomalous
2. Dumped 7 representative EPUBs from different failure classes
3. Parsed each with the current `build_chapters_from_epub` + inspected NCX/OPF/xhtml
4. Traced failure modes to source lines in `backend/services/splitter.py`

## Sample

| Book ID | Title | Language | Audit flag type |
|---|---|---|---|
| 1982 | 羅生門 Rashomon | ja | 0-char class |
| 49501 | Anzeiger für Kunde der deutschen Vorzeit | de | 19 structural flags |
| 25575 | Mémoires d'Outre-Tombe | fr | char ratio 1.97 |
| 3221 | Mr Honey's Dictionary | de | paragraph ratio 0.18 |
| 43759 | Geflügelte Worte | de | paragraph ratio 2.10 |
| 77700 | Entstehung der Alchemie | de | 17 structural flags |
| 62215 | Le Fantôme de l'Opéra | fr | 5 structural flags |

## Key findings

### 1. NCX fragment-anchor chapter boundaries are ignored (HIGH severity → #964)

Gutenberg Ebookmaker frequently packs multiple navigable chapters into a single xhtml spine item, encoding chapter boundaries as `file.xhtml#anchor` fragments in the NCX navMap. The splitter walks only the spine, so every anchor beyond the first in a given file is lost.

Every inspected book (7/7) uses fragment anchors:

| Book | navPoints | Unique spine files | Splitter chapters | Collapse |
|---|---|---|---|---|
| #62215 Le Fantôme | 36 | 5 | 4 | 9× |
| #25575 Mémoires | 450 | 7 | 8 | 56× |
| #43759 Geflügelte Worte | 814 | 21 | 20 | 40× |
| #77700 Alchemie | 693 | 81 | 92 | 7× |

This is the single largest class of chapter-structure bug in the catalog.

### 2. Single-chapter EPUBs rejected by `>= 2` guard (MEDIUM severity → #965)

`build_chapters_from_epub` at line 668 returns `[]` for legitimate single-chapter works (short stories, novellas). Triggers the text fallback, which then fails for CJK.

### 3. CJK text-splitter fallback completely broken (HIGH severity → #966)

All 8 cached Japanese books produce 0 chapters — the `build_chapters` text fallback relies on `len(text.split())` word counts and English heading keywords that don't apply to CJK.

### 4. Speaker-cue regex false-positives on running headers (LOW severity → #967)

`_SPEAKER_CUE_RE` matches ALL-CAPS running headers (`ORGAN DES GERMANISCHEN MUSEUMS.`) in reference/periodical works. Only causes splits when the header lands mid-paragraph, so impact is cosmetic.

## Dictionary case (book 3221) — not yet a filed issue

Mr Honey's Dictionary is a 3.5 MB single xhtml file with 3 NCX navPoints. Splitter produces 2 chapters, the first containing a full 1 MB of entries with only 27 paragraphs — the dictionary is likely encoded as a `<dl>` or table that the current text extractor flattens poorly. Fix would fall out naturally from #964 (respecting NCX fragment anchors).

## Files referenced

- `backend/services/splitter.py:611` — spine-walk loop
- `backend/services/splitter.py:668` — `>= 2` chapter guard
- `backend/services/splitter.py:805` — `_SPEAKER_CUE_RE`
- `backend/services/splitter.py:883` — `build_chapters` text fallback entry

## Issues filed

- **#964** `architecture`: NCX fragment-anchor boundaries (High)
- **#965** `bug`: single-chapter EPUB rejection (Medium)
- **#966** `bug, P1`: CJK text fallback (High)
- **#967** `bug, P3`: speaker-cue false positives (Low)

Recommended fix order: #966 → #965 → #964 (#964 needs a design doc).
