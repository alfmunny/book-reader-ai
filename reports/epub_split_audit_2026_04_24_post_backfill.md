# EPUB Split Quality Audit — Post-Backfill — 2026-04-24

**Author:** Architect
**Scripts:** `backend/scripts/epub_split_audit.py` (#832, #839), `backend/scripts/backfill_epubs.py` (this report)
**DB snapshot:** `backend/books.db` (production copy)
**Companion report:** `reports/epub_split_audit_2026_04_24.md` (pre-backfill)
**Related issues:** #769, #834, #820, #758, #767

---

## TL;DR

Backfilled EPUBs for 90 books (pre-backfill coverage was 1 book; now 91). The audit surfaced **30 flagged books, 4 of them with complete EPUB-splitter failure (0 characters extracted)** and 17 with the #820-class structural collapse. This is much bigger than the pre-backfill snapshot suggested.

Per-request, the actionable findings below exclude Japanese books (8 of the 12 "0-char" cases). They are summarised separately at the end.

## Coverage delta

| Before backfill | After backfill |
|---|---|
| 1 book with stored EPUB | **91 books** |
| 0 books flagged by any signal | **30 books flagged** |

Backfill used the new `backend/scripts/backfill_epubs.py` — fetches missing EPUBs from Gutenberg, 1.5 s throttle, skips books where Gutenberg has no EPUB upstream. Ran to 91/122; I stopped it early because Gutenberg started responding slowly and we already had plenty of signal to act on. Remaining 31 books can be backfilled in a follow-up pass.

Invocation:

```bash
DB_PATH=backend/books.db python -m scripts.backfill_epubs --delay 1.5
DB_PATH=backend/books.db python -m scripts.epub_split_audit \
    --csv /tmp/epub_audit_20260424_postbackfill.csv
```

## Summary by signal

| Signal | Gate | Flagged |
|---|---|---|
| Character ratio | `epub_chars / text_chars < 0.5` | **12** |
| Paragraph ratio | `epub_paragraphs / text_paragraphs < 0.8` | **15** |
| Structural speaker-cue collapse | paragraph ≥400 chars with embedded all-caps cue | **17** |
| **Any signal** | | **30** |

CSV: `/tmp/epub_audit_20260424_postbackfill.csv`.

---

## Category 1: Catastrophic — EPUB splitter returns zero characters

Four non-Japanese books (and eight Japanese — see tail section) produce `0 epub_chars, 0 epub_paragraphs`. The `build_chapters_from_epub` pipeline opens the file, finds nothing it recognizes as a chapter, and returns an empty list. Reader currently falls back to plain-text split for these books, so users see *something*, but the EPUB path that we normally prefer is completely broken.

| book_id | title | text_chars | EPUB chars | Notes |
|---|---|---:|---:|---|
| 17161 | **Max und Moritz** (Wilhelm Busch) | 13,635 | 0 | Picture book — verse captions under illustrations. EPUB is mostly image-based. |
| 66452 | **Die Liebe: Novelle** (Clara Viebig) | 99,410 | 0 | Novella. Worth investigating — no obvious reason. |
| 22367 | **Die Verwandlung** (Kafka) | 121,106 | 0 | Short novella. This one is surprising and worth priority triage. |
| 24571 | **Der Struwwelpeter** | 18,644 | 0 | Children's picture book — verse + images. |

**Hypothesis.** Looking at the titles, three of the four (Max und Moritz, Struwwelpeter, and likely Die Verwandlung as packaged on Gutenberg) lean heavily on `<div class="illus">` / `<figure>` markup. Our splitter's chapter detection may be scanning for `<h1>`/`<h2>` heading patterns that aren't present in these simpler EPUB shapes.

**Recommended next step.** File one GitHub `bug` issue *per book*, labelled `bug` + `P1` (user-visible data loss), with: (a) the book_id, (b) the 0-char audit output, (c) a link to the EPUB URL, (d) a step to reproduce by running `epub_split_audit.py --book-id <N>`. The Dev role should pick these up via the standard bug flow. Target is a single splitter fix that covers the whole class, not four one-off patches.

---

## Category 2: Structural speaker-cue collapse (the #820 class)

17 books flagged by the structural detector. The full list, sorted by flag count:

| book_id | title | struct flags | Notes |
|---|---|---:|---|
| 49501 | Anzeiger für Kunde der deutschen Vorzeit | **19** | 19th-century periodical — lots of indented quoted speech. |
| 77700 | Entstehung und Ausbreitung der Alchemie | 18 | Monograph with lots of Latin quotations. |
| 58804 | Die Deutschen Familiennamen | 9 | Reference book with embedded quotes. |
| 68400 | Der Marquis de Sade und seine Zeit | 7 | Plus para-ratio 0.77 → also flagged by signal 2. |
| 62215 | Le Fantôme de l'Opéra | 5 | Front-matter AVANT-PROPOS block collapsed. |
| 1259 | Twenty years after (Dumas) | 3 | Dialogue-heavy. |
| 23756 | Geschichte Alexanders des Grossen | 2 | Historical citation blocks. |
| 15113 | Vie de Jésus (Renan) | 2 | TOC / index block. |
| 25097 | Cités et ruines américaines | 2 | TOC-like. |
| 25575 | Mémoires d'Outre-Tombe T.4 | 2 | + char ratio 1.97 (EPUB much bigger than cached text — stale text?). |
| 76 | Adventures of Huckleberry Finn | 1 | Dialogue. |
| 3207 | Leviathan | 1 | Legal-style block quotes. |
| 2229 | **Faust: Der Tragödie erster Teil** | 1 | **Known** #820 — Margarete's confession scene. |
| 28718 | Les crimes de l'amour | 1 | Footnote-style. |
| 43759 | Geflügelte Worte | 1 | Quotation reference. |
| 56156 | Venus im Pelz | 1 | Dialogue. |
| 6593 | History of Tom Jones, a Foundling | 2 | Dialogue. |

The Faust case (#820) is the canonical bug and is already tracked. For the rest, two structural causes explain most of them:

1. **Verse / dialogue collapse.** Same mechanism as Faust: `<br>` inside `<p>` collapses speaker turns. Shows up in dramatic works (Faust), drama-adjacent novels (Dumas, Fielding), and anything with embedded dialogue.
2. **TOC / index collapse.** Reference books (#49501, #77700, #58804, #25097, #15113) have long TOC/index entries with embedded newlines and capitalised labels. The speaker-cue regex (`[A-ZÄÖÜ]{2,}[A-ZÄÖÜ ]*\.`) matches some of those as false positives — or real positives if the TOC text gets rendered as one visual block.

**Recommended next step.** One architecture issue titled "EPUB splitter: generalised fix for verse / dialogue / TOC paragraph collapse (superseding #820)". The fix is likely a single change in `backend/services/splitter.py`'s HTML-to-text path: preserve `<br>` as an actual newline, or convert to paragraph splits when the surrounding block is long enough to suggest verse. Architect to file; Dev or Architect to implement.

Whether to treat the reference-book TOC flags as real bugs or as false positives depends on what the actual reading experience looks like. Pull the worst offender (#49501) up in the reader and check. If the book is readable, tighten the regex (require verse-like line-break density); if it's unreadable, treat it as the same class of bug.

---

## Category 3: Paragraph ratio outliers

Interesting-but-not-urgent cases:

| book_id | title | para_ratio | ratio | Takeaway |
|---|---|---:|---:|---|
| 3221 | Mr. Honey's Large Business Dictionary | 0.18 | 1.06 | Dictionary. 26 "paragraphs" vs 147 in plain text. Expected for dictionary formatting. Not a bug; tighten the threshold? |
| 43759 | Geflügelte Worte | **2.10** | 0.86 | EPUB produces *twice* as many paragraphs as the plain-text split. Inverted case — splitter is over-splitting. Worth investigating. |
| 68400 | Der Marquis de Sade und seine Zeit | 0.77 | 0.96 | Mild paragraph-drop + structural flags. Same root cause as Category 2. |
| 25575 | Mémoires d'Outre-Tombe T.4 | 1.84 | **1.97** | EPUB *much* larger than cached plain text. The cached `books.text` is probably stale/truncated, not an EPUB issue. Flag the cached text for refresh. |
| 77700 | Entstehung der Alchemie | 0.60 | 1.50 | Combination of EPUB over-extract and text under-extract. |

---

## Recommended action items

Ordered for impact per hour of work.

1. **File 4 `bug` issues for Category 1 (0-char EPUB extraction).** Each: book_id, audit output, EPUB URL, reproduction step. Prioritise **Kafka #22367** (flagship title, user-visible) and **Max und Moritz #17161** (well-known, will be noticed).
2. **File 1 `architecture` issue for Category 2** covering the Faust-class regression at scale. Reference this report. Architect writes the design note (probably short — a single change in `backend/services/splitter.py`).
3. **Run `backfill_epubs.py` to completion** (remaining 31 books) in a quiet period to get full catalog coverage. Then re-run the audit for a final baseline.
4. **Add the audit to CI as a post-ingestion gate** once Category 1 + 2 are resolved — `epub_split_audit.py --csv` already exits `1` on any flag.
5. **Flag `Mémoires d'Outre-Tombe T.4 (#25575)` for cached-text refresh** — its cached text is nearly half the size of the EPUB, suggesting truncation at ingest time.

---

## Japanese books (excluded from actionable list per request)

For reference. 8 of the 12 "0-char EPUB" books are Japanese:

| book_id | title | text_chars | EPUB chars |
|---|---|---:|---:|
| 37626 | 續惡魔 | 32,264 | 0 |
| 37605 | 惡魔 | 18,040 | 0 |
| 2592 | マルチン・ルターの小信仰問答書 | 11,834 | 0 |
| 38697 | 殉情詩集 | 9,226 | 0 |
| 39287 | 苦悶の欄 | 70,451 | 0 |
| 36358 | 火星の記憶 | 34,380 | 0 |
| 33307 | 友情 | 68,631 | 0 |
| 1982 | 羅生門 | 6,561 | 0 |

Other Japanese titles in the audit *did* produce characters (e.g. 血笑記 #34013 at ratio 0.77, 腕くらべ #34636 at 1.00), so this is not a blanket CJK problem — it's a specific interaction between our splitter and whatever format the 0-char subset uses. Separate investigation when prioritised.

---

## Artifacts

- `backend/scripts/backfill_epubs.py` — new backfill script.
- `backend/scripts/epub_split_audit.py` — audit script (#832 / #839).
- `/tmp/epub_audit_20260424_postbackfill.csv` — full CSV with every flagged row and its structural excerpt.
- `reports/epub_split_audit_2026_04_24.md` — pre-backfill companion.
