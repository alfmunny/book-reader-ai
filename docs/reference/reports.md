<!-- THIS PAGE IS AUTO-GENERATED. Edit the source script or report, not this file. Re-run `python -m scripts.generate_docs` after changes. -->


# Reports

Audit outputs, benchmarks, and incident write-ups. Ordered newest first by filename.

## Translation alignment audit — Stundenbuch / Moby Dick / Madame Bovary

- **File:** `reports/translation_audits_2026_04_25.md`
- **TL;DR:** Date: 2026-04-25 Splitter: post-#1055 (EPUB NCX fragment-anchor support) Target language: zh

## Pre-Translation Benchmark Report

- **File:** `reports/pretranslate_benchmark_2229.md`
- **TL;DR:** | Language | Chapters | Total Words | Kernel Time | Wall Time | Words/sec | Sec/chapter (avg) | |----------|----------|-------------|-------------|-----------|-----------|-------------------| | **German** (`de`) | 26 of 27¹ | 30,315 | 19m 59s | 20m 11s | **25.3** | 46.1s | | **French** (`fr`) | 26 of 27¹ | 30,315 | 33m 58s | 34m 28s | **14.9** | 78.4s |

## Faust #2229 — Rendering Investigation & Re-Translation Plan

- **File:** `reports/faust_2229_investigation_2026_04_25.md`
- **TL;DR:** Date: 2026-04-25 Scope: Book #2229 — *Faust: Der Tragödie erster Teil* by Goethe (German, Gutenberg EPUB) Prompted by: "Check the titles / splits / stanzas / translation."

## EPUB Split Audit — Post-#888 Fix — 2026-04-24

- **File:** `reports/epub_split_audit_after_888_fix.md`
- **TL;DR:** - `reports/epub_split_audit_2026_04_24.md` (pre-backfill baseline) - `reports/epub_split_audit_2026_04_24_post_backfill.md` (pre-fix baseline, 91 books)

## EPUB Split Quality Audit — Post-Backfill — 2026-04-24

- **File:** `reports/epub_split_audit_2026_04_24_post_backfill.md`
- **TL;DR:** Backfilled EPUBs for 90 books (pre-backfill coverage was 1 book; now 91). The audit surfaced **30 flagged books, 4 of them with complete EPUB-splitter failure (0 characters extracted)** and 17 with the #820-class structural collapse. This is much bigger than the pre-backfill snapshot suggested.

## EPUB Split Quality Audit — 2026-04-24

- **File:** `reports/epub_split_audit_2026_04_24.md`
- **TL;DR:** - Audit in its current form catches the right class of bug (#820), but only **1 of 122 Gutenberg books** in the DB had a stored EPUB at the time of this audit. Coverage is effectively nil until the remaining books are backfilled. - The one book it did audit (**Faust, #2229**) was flagged by the structural speaker-cue signal, confirming that the extension shipped in #839 surfaces the #820 class of collapse — verse/drama paragraphs that keep 100% of their characters but lose their line breaks.

## EPUB Parser Investigation — 2026-04-24

- **File:** `reports/epub_parser_investigation_2026_04_24.md`
- **TL;DR:** Full-catalog investigation of cached Gutenberg EPUBs to identify chapter-parser gaps.

## CI Baseline — 2026-04-24

- **File:** `reports/ci_baseline_2026_04_24.md`
- **TL;DR:** Median CI wall time for a typical code-touching PR is **~5 minutes (311 s)**. Docs / chore PRs that correctly skip the code jobs finish in **~10 seconds**. P95 is **~7 minutes (433 s)**.

## Architect Session Report — 2026-04-27

- **File:** `reports/architect_session_report_2026_04_27.md`
- **TL;DR:** Scope: 10-min cron Architect loop, cycles 1–5 (~50 min wall time). Worktree: `/Users/alfmunny/Projects/AI/book-reader-ai-arch`. Main checkout reference: `/Users/alfmunny/Projects/AI/book-reader-ai`.

## Architect Session Report — 2026-04-24 through 2026-04-25

- **File:** `reports/architect_session_report_2026_04_25.md`
- **TL;DR:** Scope: this report covers the full Architect session as of 2026-04-25, including the Faust-specific investigation the user asked for.
