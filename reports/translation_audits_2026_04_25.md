# Translation alignment audit — Stundenbuch / Moby Dick / Madame Bovary

Date: 2026-04-25
Splitter: post-#1055 (EPUB NCX fragment-anchor support)
Target language: zh

---

## 1. Stundenbuch — Rilke (#24288)

**Imported fresh** (was not in DB). 133 KB EPUB, German.

**Splitter output: 4 chapters** matching the NCX navMap exactly:

| # | Title | chars | paras |
|---:|---|---:|---:|
| 0 | Das Stunden-Buch | 217 | 6 |
| 1 | Erstes Buch — Das Buch vom mönchischen Leben (1899) | 38,561 | 219 |
| 2 | Zweites Buch — Das Buch von der Pilgerschaft (1901) | 29,315 | 104 |
| 3 | Drittes Buch — Das Buch von der Armut und vom Tode (1903) | 25,014 | 103 |

**Existing zh translations**: 0 (fresh book).

**Splitter notes**: NCX has only 5 navMap points (title + 3 books + license footer). The individual ~134 poems live in the EPUB's `pageList`, not the navMap. Our splitter respects navMap by design, so producing 4 chapters is correct per current splitter contract. Per-poem splitting would require a `pageList` walker — separate splitter feature, not a defect.

**Stanza preservation**: each poem inside the "Buch" chapter is a paragraph separated by `\n\n`; verse lines preserved as `\n`-delimited internal lines. Looks correct.

**Translation status**: not started — fresh book, ~426 paragraphs across 3 long chapters.

---

## 2. Moby Dick — Melville (#2701)

**EPUB fetched and cached** (was missing from `book_epubs` despite the `books` row existing). 813 KB EPUB.

**Splitter output: 138 chapters**.

**Existing zh translations BEFORE audit**: 136 rows at indices 0–135.

### Mismatch found

The new splitter produces **2 extra leading chapters** (title page + transcriber's notes) that the old splitter didn't surface. So every existing zh row at index `N` corresponds to splitter chapter `N+2`. Verified at multiple spot points:

| Splitter index | Splitter chapter | Old zh at same index |
|---:|---|---|
| 0 | "MOBY-DICK; or, THE WHALE." (TOC) | Chapter 1 (Loomings) |
| 1 | "Original Transcriber's Notes" (= ETYMOLOGY + EXTRACTS) | Chapter 2 (Carpet-Bag) |
| 2 | "CHAPTER 1. Loomings." | Chapter 3 (Spouter-Inn) |
| 50 | "CHAPTER 49. The Hyena." | Chapter 51 (Spirit-Spout) |
| 100 | "CHAPTER 99. The Doubloon." | Chapter 101 (Decanter) |
| 134 | "CHAPTER 133. The Chase—First Day" | Chapter 135 (Third Day) |
| 135 | "CHAPTER 134. The Chase—Second Day" | Epilogue |

Uniform +2 shift across all 136 rows.

### Fix applied

1. **Backed up** all 136 rows to `data/translations/_backup_book_2701_zh_pre_realign_20260425_101251.json` with full paragraphs + provenance.
2. **Shifted in-place**: deleted from `translations` and re-inserted at `chapter_index = N + 2`. Rows now at indices 2–137.
3. **Translated chapter 0** (TOC) — 140 short paragraphs of chapter titles → Chinese chapter titles, using the canonical names already in the existing translations.
4. **Translated chapter 1** (Transcriber's note + ETYMOLOGY + EXTRACTS) — 96 paragraphs of canonical Melville frontmatter.

### Result

138 / 138 chapters now have aligned zh translations. Spot-checked alignment looks correct (Chapter 1 Loomings starts with "叫我以实玛利吧"; Epilogue starts with "尾声"). Existing translation model is `claude-sonnet-4-6`; ch 0 + ch 1 freshly added are `claude-opus-4-7 (in-session)`.

---

## 3. Madame Bovary — Flaubert (#14155)

**EPUB already cached** (373 KB), French.

**Splitter output: 36 chapters** — matches canonical structure (9 + 15 + 11 + 1 TOC).

**Existing zh translations**: 0.

### Issues found (titles only — not splits)

Filed as **issue #1151**:

1. **Chapter 0 absorbs the entire TOC into its title** — 213-char string `"PREMIÈRE PARTIE I II III IV V VI VII VIII IX DEUXIÈME PARTIE …"`.
2. **First chapter of each part is titled with the part heading** — `"PREMIÈRE PARTIE"` / `"DEUXIÈME PARTIE"` / `"TROISIÈME PARTIE"` instead of `"Part X — Chapter I"`.
3. **All other chapters are bare roman numerals** — three different chapters titled `"II"`, three titled `"III"`, etc., losing their part context.

### Root cause

Two-level NCX hierarchy: the EPUB has top-level part sections containing chapter-numeral leaves. Our `_epub_nav_titles` flattens the leaf and drops the parent navLabel. General problem; will affect every multi-part book with this NCX structure.

### Fix path

1. Splitter fix (per #1151): compose `"<Parent> — <Leaf>"` titles when the leaf is a child of a labeled section. Out of scope for this audit.
2. Per-row workaround: set `translations.title_translation` to a clean Chinese title (`第一部 第一章` etc.) when filling translations. Doesn't fix the source-language display, but unblocks readers using zh.

### Translation status

Not started — fresh book, 35 chapters of literary French (~700 KB total source). Substantial in-session work; deferred until user confirms scope.

---

## Backups

- `data/translations/_backup_book_2701_zh_pre_realign_20260425_101251.json` — pre-realignment Moby Dick zh dump (136 rows).

## Issues filed this audit

- **#1151** architecture: EPUB splitter mangles part/chapter titles for nested-NCX multi-part books. P3.

## Outstanding (per user request)

1. **Stundenbuch translation** — start fresh (DE→ZH, claude-opus-4-7 in-session).
2. **Madame Bovary translation** — start fresh (FR→ZH, claude-opus-4-7 in-session). Recommend setting per-row `title_translation` with clean part/chapter titles to work around #1151.
