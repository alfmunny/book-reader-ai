# EPUB Split Quality Audit — 2026-04-24

**Author:** Architect
**Scripts:** `backend/scripts/epub_split_audit.py` (#832, #839)
**DB snapshot:** `backend/books.db` (production copy, local)
**Related issues:** #769 (audit script), #834 (paragraph + structural extension), #820 (Faust verse collapse)

---

## TL;DR

- Audit in its current form catches the right class of bug (#820), but only **1 of 122 Gutenberg books** in the DB had a stored EPUB at the time of this audit. Coverage is effectively nil until the remaining books are backfilled.
- The one book it did audit (**Faust, #2229**) was flagged by the structural speaker-cue signal, confirming that the extension shipped in #839 surfaces the #820 class of collapse — verse/drama paragraphs that keep 100% of their characters but lose their line breaks.
- A follow-up backfill of EPUBs + a second audit pass is the cheapest way to grow coverage and file actionable bugs for the remaining books. The backfill script and a re-run are documented in this report.

## Signals the audit emits

Per `epub_split_audit.py` after #839:

| # | Signal | Gate | What it catches |
|---|---|---|---|
| 1 | **Character ratio** | `epub_chars / text_chars < --threshold` (default 0.5) | Content-drop regressions (#758 verse-span drop, #767 wrapper div skip). |
| 2 | **Paragraph ratio** | `epub_paragraphs / text_paragraphs < --para-threshold` (default 0.8) | Paragraph-count drops that leave char count intact. |
| 3 | **Structural speaker-cue collapse** | Any paragraph longer than `--structural-paragraph-len` (default 400) containing an embedded-newline all-caps speaker cue like `\n  HELENA.` | The #820 class — drama/verse collapsed into one visual block. No baseline needed; stands on its own. |

`main()` exits `1` when any signal fires, so the script can double as a CI data-quality gate once coverage is real.

## Results (pre-backfill)

Command:

```bash
DB_PATH=backend/books.db python -m scripts.epub_split_audit --csv /tmp/epub_audit_20260424.csv
```

Summary:

```
Audited 1 book(s).
  Char-ratio gate:      < 50%    flagged 0
  Paragraph-ratio gate: < 80%    flagged 0
  Structural speaker-cue collapse:      flagged 1
  Any signal:                           flagged 1

book_id   ratio   para    struct  title
--------------------------------------------------------------------------------
2229      1.00    0.99    1       Faust: Der Tragödie erster Teil
```

CSV row:

```
2229,Faust: Der Tragödie erster Teil,186610,186673,1.000,,1051,1063,0.989,,1,"MARGARETE. / Meine Mutter hab ich umgebracht, / Mein Kind hab ich ertränkt. / War es nicht dir und mir ges"
```

### Interpretation

- **Char ratio 1.000.** EPUB preserves all characters of the plain-text baseline — no content was dropped. So signal 1 correctly didn't fire.
- **Paragraph ratio 0.989** (1051 vs 1063). Essentially aligned; below the 80% gate, so signal 2 also correctly didn't fire.
- **Structural flag 1.** A paragraph exceeds 400 characters and contains an embedded-newline speaker cue `"\n  MARGARETE."`. This is the #820 pattern: `<br>` inside `<p>` collapses verse lines + speaker turns into one visual paragraph. The char-count audit would miss it entirely; only the structural signal catches it.

The sample excerpt is the final Faust I scene where Margarete confesses to Gretchen — real verse, real collapse, real bug.

## Coverage gap — the load-bearing finding

The audit only iterates books that have a stored EPUB (`book_epubs` table). Current counts on the snapshot I used:

```sql
SELECT COUNT(*) FROM books WHERE source IS NULL OR source != 'upload';  -- 122
SELECT COUNT(*) FROM book_epubs;                                        -- 1
```

**121 of 122 Gutenberg books have no stored EPUB**, so they contribute zero audit signal. That's because EPUBs are fetched on-demand: `services.book_chapters._background_fetch_epub` fires only the first time a user opens a book's chapter. Any book nobody's opened yet sits invisible to this audit.

## Recommended follow-ups

Ranked by value-per-effort.

1. **Backfill the remaining EPUBs.** New script `backend/scripts/backfill_epubs.py` (added in the same branch as this report) iterates books with no row in `book_epubs`, fetches the no-images EPUB from Gutenberg via `services.gutenberg.get_book_epub`, and persists it via `services.db.save_book_epub`. Throttled by default (1.5s delay) to be polite to Gutenberg. Dry-run flag available. Tested on the first 20 books (19 fetched, 1 — Oku no Hosomichi — had no upstream EPUB). A full backfill completes in ~3 minutes against the current 121 gap. Results: see `reports/epub_split_audit_2026_04_24_post_backfill.md`.

2. **Re-run the audit after backfill.** Same command; expect the "Audited N books" line to jump from 1 to ~120, and the structural signal to flag multiple dramatic works (other Goethe, Shakespeare, Shaw, classical Japanese drama, etc.). File one bug per flagged title with the structural excerpt from the CSV.

3. **Wire the audit into CI as a data-quality gate (post-backfill).** `epub_split_audit.py --csv` already exits 1 when anything is flagged. Adding a GitHub Actions step that runs it after book ingestion would turn regressions into CI failures at add-time, not "when a user happens to open the book."

4. **Extend the structural signal set (optional).** The current structural detector looks for one specific pattern (`\n[ \t]*UPPERNAME.`). Two adjacent patterns worth considering once we have backfilled data to validate against:
   - Long paragraphs (>400 chars) containing `\n` + indented verse lines (a line that starts with a lot of whitespace followed by text). Catches poetry that was meant to be visually indented but got flattened.
   - Paragraphs where the **ratio** of embedded-newline characters to total length exceeds a threshold. Catches cases where a whole stanza collapsed but there's no speaker cue to hang a rule on.

These are speculative — only worth building if the backfilled audit produces false negatives. Log them as ideas, don't build speculatively.

## Running the audit yourself

From the backend directory of any worktree that has the script:

```bash
cd backend
DB_PATH=/path/to/books.db python -m scripts.epub_split_audit

# Single book, write CSV report, tighter paragraph threshold:
DB_PATH=/path/to/books.db python -m scripts.epub_split_audit \
    --book-id 2229 --csv /tmp/audit.csv --para-threshold 0.9

# Relax structural detector to catch shorter verse collapses:
DB_PATH=/path/to/books.db python -m scripts.epub_split_audit \
    --structural-paragraph-len 250
```

Exit code is `1` when any book is flagged so this slots into CI.

## Artifacts

- `backend/scripts/epub_split_audit.py` — audit script (#832 / #839)
- `backend/scripts/backfill_epubs.py` — new backfill script (this report)
- `/tmp/epub_audit_20260424.csv` — CSV from this pre-backfill run
- `reports/epub_split_audit_2026_04_24_post_backfill.md` — follow-up report after full backfill
