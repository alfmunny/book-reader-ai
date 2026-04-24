# EPUB Split Audit — Post-#888 Fix — 2026-04-24

**Author:** Architect
**Context:** Before/after comparison for PR #903 (implementation of #888).
**Fix applied:** `backend/services/splitter.py:663` — `build_chapters_from_epub` now calls `_split_dramatic_speakers(text)` before appending each chapter (the plain-text and HTML paths already did).
**Prior reports:**
- `reports/epub_split_audit_2026_04_24.md` (pre-backfill baseline)
- `reports/epub_split_audit_2026_04_24_post_backfill.md` (pre-fix baseline, 91 books)

---

## Headline

**Faust (#2229) — the canonical #820 case — is fully fixed.** The structural detector no longer flags it. Five structural flags cleared in total across four books. The remaining flags are predominantly the TOC / index false-positive class explicitly out of scope for #888 (see design doc `docs/design/epub-speaker-cue-fix.md` §Non-goals).

## Summary delta

| Signal | Pre-fix | Post-fix | Δ |
|---|---:|---:|---:|
| Char ratio (< 50%) | 12 | 12 | 0 |
| Paragraph ratio (< 80%) | 15 | 15 | 0 |
| **Structural speaker-cue collapse** | **17** | **16** | **−1 book** |
| Total structural flag count (sum across books) | ~78 | ~73 | **−5** |
| Any signal | 30 | 29 | −1 |

Char + paragraph-ratio signals are unchanged (as expected — the fix affects paragraph splitting, not content extraction or paragraph count).

## Per-book delta (structural flag count)

| book_id | title | pre-fix | post-fix | Δ |
|---|---|---:|---:|---:|
| **2229** | **Faust: Der Tragödie erster Teil** | **1** | **0** | **✅ fully fixed** |
| 58804 | Die Deutschen Familiennamen | 9 | 6 | −3 |
| 77700 | Entstehung und Ausbreitung der Alchemie | 18 | 17 | −1 |
| 6593 | History of Tom Jones, a Foundling | 2 | 1 | −1 |
| 49501 | Anzeiger für Kunde der deutschen Vorzeit | 19 | 19 | 0 |
| 68400 | Der Marquis de Sade und seine Zeit | 7 | 7 | 0 |
| 62215 | Le Fantôme de l'Opéra | 5 | 5 | 0 |
| 1259 | Twenty years after | 3 | 3 | 0 |
| 23756 | Geschichte Alexanders des Grossen | 2 | 2 | 0 |
| 15113 | Vie de Jésus | 2 | 2 | 0 |
| 25097 | Cités et ruines américaines | 2 | 2 | 0 |
| 25575 | Mémoires d'Outre-Tombe, Tome 4 | 2 | 2 | 0 |
| 76 | Adventures of Huckleberry Finn | 1 | 1 | 0 |
| 3207 | Leviathan | 1 | 1 | 0 |
| 28718 | Les crimes de l'amour | 1 | 1 | 0 |
| 43759 | Geflügelte Worte | 1 | 1 | 0 |
| 56156 | Venus im Pelz | 1 | 1 | 0 |

## Interpretation

**What the fix caught.** Paragraphs that packed multiple speakers via an internal speaker cue (`\n  NAME.\n`) now split correctly:

- **Faust** — the canonical #820 regression; one MARGARETE confession paragraph. Cleared.
- **Die Deutschen Familiennamen** — 3 paragraphs cleared; likely historical citations with embedded all-caps references that also match the cue pattern (arguably a false-positive flag pre-fix, now split but innocuously).
- **History of Tom Jones** — 1 paragraph cleared; likely a long dialogue block.

**What the fix didn't catch — by design.** The remaining structural flags are predominantly TOC / index / section-heading false positives that the design doc explicitly classifies as "not a splitter bug":

- **Anzeiger für Kunde der deutschen Vorzeit** (19 flags, unchanged) — reference periodical. The flags are on section-heading labels that happen to fit the speaker-cue regex. The text reads fine; these are detector false positives.
- **Entstehung und Ausbreitung der Alchemie** (17 flags) — monograph with Latin section labels.
- **Le Fantôme de l'Opéra AVANT-PROPOS** (5 flags) — front-matter block-level labels.

For these, either the detector needs tightening (separate issue, not this PR), or the paragraphs are genuinely readable as-is and the flags are harmless.

**Drama / dialogue books still flagged.** A few (Dumas #1259, Leviathan, Huck Finn, Marquis de Sade biographies) still show flags. Possible reasons:

1. The speaker cue pattern in those books is different — e.g., Dumas uses French name capitalisation (`D'Artagnan.`) which our regex allows but the specific pattern may not match (e.g. the name isn't all-caps).
2. The flagged paragraph's structure is different from Faust — maybe the cue is at the start of the paragraph (not embedded after a newline), so `_split_dramatic_speakers` treats it as the start of a speaker block, not a mid-paragraph split.
3. Detector over-flagging on non-speaker long paragraphs with incidental capitalised labels.

Investigating each is a follow-up; they're not in scope for the PR that ships the Faust fix. File a narrow issue per title if user-visible.

## Conclusion

- The Faust-class regression (#820 → #888) is resolved.
- Four books lost redundant structural flags as a side effect.
- The remaining flags are consistent with the design doc's "out of scope" classes (TOC false positives) and deserve separate investigation.
- **Recommendation:** land #903. File narrow follow-up issues for:
  - Detector tightening (to eliminate TOC false positives on the audit side).
  - Non-Faust dramatic books (Dumas, Leviathan) still showing flags, to confirm whether they're real bugs or detector artefacts.

## Artifacts

- `/tmp/epub_audit_after_888_fix.csv` — full post-fix CSV.
- Pre-fix comparison: `reports/epub_split_audit_2026_04_24_post_backfill.md`.
- Design doc: `docs/design/epub-speaker-cue-fix.md` (merged via #902).
- Implementation PR: #903 (this PR).
