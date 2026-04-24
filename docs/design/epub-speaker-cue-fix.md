# Design: EPUB speaker-cue / verse paragraph collapse fix — Issue #888

**Status:** Draft — awaiting PM review, then user approval
**Author:** Architect
**Date:** 2026-04-24
**Priority:** P2 — user-visible on dramatic and verse books (Faust, Dumas, etc.); not app-wide.
**Supersedes:** #820 (single-book Faust bug)
**Driven by:** `reports/epub_split_audit_2026_04_24_post_backfill.md` — 17 books flagged by the structural speaker-cue detector

---

## Problem

The post-backfill audit flagged 17 books where the EPUB path produces paragraphs that pack multiple speaker turns (or verse lines) into a single visual block. Faust (#820) was the canonical case; 16 more followed once we backfilled the catalog.

The root cause was **not** what I assumed when filing #888 (a missing `<br>` → newline conversion). `<br>` handling already works — `_html_inline_text` in `backend/services/splitter.py:837` converts `<br>` to `\n`. The actual miss is downstream: the EPUB path **does not call `_split_dramatic_speakers`** even though the plain-text path and `build_chapters_from_html` both do.

### Confirming the root cause

`backend/services/splitter.py`:

| Entry point | Calls `_split_dramatic_speakers`? |
|---|---|
| `build_chapters` (plain-text) → `_finalize` → yes ✅ | line 914 |
| `build_chapters_from_html` (uploaded HTML) → yes ✅ | line 457 |
| **`build_chapters_from_epub`** | **no** ❌ — chapter constructed at line 664 without the normalisation step |

`_SPEAKER_CUE_RE` (line 805) and `_split_dramatic_speakers` (line 812) exist, are tested, and work correctly. The EPUB path just doesn't call them.

## Goals

1. Every flagged "real drama/verse" book (Faust, Dumas, Leviathan dialogue blocks, Le Fantôme de l'Opéra) produces correctly-split paragraphs after the fix.
2. Existing non-dramatic EPUB books are unchanged — `_split_dramatic_speakers` is a no-op on text without speaker-cue patterns.
3. No change to the plain-text or uploaded-HTML paths. They already work.

## Non-goals

- **TOC / index false positives.** Reference books (#49501 *Anzeiger für Kunde*, #77700 *Entstehung der Alchemie*, #58804 *Die Deutschen Familiennamen*, #25097 *Cités et ruines américaines*, #15113 *Vie de Jésus*) were flagged by the audit's structural detector because the regex matches "ANTIQUITÉS AMÉRICAINES" etc. Those are section headings, not speaker cues. Not a splitter bug — a detector false positive. Out of scope for this PR; filed as a follow-up in the audit report.
- **0-char EPUB extraction** (#887, the Die Verwandlung / Max und Moritz / Der Struwwelpeter / Die Liebe class). Different root cause — separate PR.
- **Audit detector tightening.** The structural regex lives in `backend/scripts/epub_split_audit.py`. If post-fix it keeps producing false positives, that's a detector tightening PR. Out of scope here.

## Solution

Single-line change in `backend/services/splitter.py`:

```python
# Current (line 663–664):
text = _strip_title_from_body_prefix(text, title)
chapters.append(Chapter(title=_clean_title(title), text=text))

# After:
text = _strip_title_from_body_prefix(text, title)
text = _split_dramatic_speakers(text)        # NEW — match the plain-text + HTML paths
chapters.append(Chapter(title=_clean_title(title), text=text))
```

That's the whole implementation. `_split_dramatic_speakers` is already well-tested and safe on text without speaker cues.

### Why this is enough

The 17 flagged books fall into two classes:

1. **Real drama / verse collapse** (the bug): paragraphs contain `\n<ALL_CAPS_NAME>.\n` — `_split_dramatic_speakers` splits at those boundaries. Fix works.
2. **TOC / index false positives** (not a bug): paragraphs contain `\nANTIQUITÉS.\n` where "ANTIQUITÉS" is a section title, not a speaker. `_split_dramatic_speakers` will split these too, which is *incorrect* — but the resulting paragraph is a single section heading on its own, which reads fine. The over-splitting is cosmetic, not a data loss.

If after the fix the TOC books render poorly, we tighten the regex (require `,` between two names, or require a newline both before and after the cue), or we scope `_split_dramatic_speakers` to apply only when the containing paragraph exceeds N chars. Follow-up, not blocking.

## Testing

### New tests in `backend/tests/test_book_parser.py`

One test per flagged "real drama" book, using checked-in EPUB fixtures (or mocks of `build_chapters_from_epub` arguments):

| Book | Assertion |
|---|---|
| Faust (#2229) | no chapter contains a paragraph matching `\n[ \t]*(HELENA|MARGARETE|FAUST|MEPHISTOPHELES)\.` embedded in a ≥400-char paragraph |
| Twenty years after (#1259) | same assertion on "D'ARTAGNAN.", "ATHOS." — or whatever the actual cues are |
| Le Fantôme de l'Opéra (#62215) | AVANT-PROPOS block splits into its heading + body paragraphs |
| Leviathan (#3207) | legal-style block-quote paragraphs don't embed "JUSTICE." etc. |

Tests are small (each asserts that the post-split chapter.text passes the audit's own `_find_structural_flags` check) — we can import the audit's function so the test directly uses the production signal.

### Existing tests stay green

`build_chapters_from_html` and `build_chapters` already call `_split_dramatic_speakers`. Their existing tests are unchanged.

### Audit regression check

After the fix merges:

```bash
cd backend
DB_PATH=./books.db python -m scripts.epub_split_audit \
    --csv /tmp/epub_audit_post_fix.csv
```

Expected: the 4–5 real-drama books (Faust, Dumas, Le Fantôme, Leviathan, Huck Finn) drop to zero structural flags. TOC books may still show flags — that's the known false-positive tail tracked separately.

Commit the post-fix audit CSV as a companion report at `reports/epub_split_audit_after_888_fix.md`, comparing before/after flag counts per book.

## Rollout

- Single implementation PR after this design doc merges. ~10 lines of production code + ~30 lines of tests.
- No migration, no config, no dependency change. Revert is one line.

## Rollback

`git revert <impl-commit>`. The change is additive — removing it restores the pre-fix behavior exactly. No data consequences.

## Open questions

1. **Should we centralise the "finalize" logic** so there's one path (`_finalize_chapters(chapters)`) that every builder calls? Currently `build_chapters`, `build_chapters_from_html`, and `build_chapters_from_epub` each have their own tail. Centralising removes the class of "we forgot to call X on one path" bug.
   **Proposed: yes, as a follow-up.** Don't bundle into this PR — too easy for a refactor to quietly change behaviour on one of the three paths. File as a separate `chore: centralise chapter finalisation pipeline` issue after this fix lands.
2. **Should we add a paragraph-length threshold to `_split_dramatic_speakers`** so it only fires on "long" paragraphs (≥400 chars, matching the audit's structural threshold)?
   **Proposed: no for this PR.** The function is already safe on short paragraphs (it splits each one individually; if a short paragraph has a speaker cue, the split is correct). Only revisit if the TOC false-positive tail proves user-visible.
3. **Should the audit script's structural detector be tightened** to distinguish speaker cues from section headings?
   **Proposed: separate issue.** After this fix merges, if the audit still shows a problem, file detector-tightening as its own bug. The splitter fix and the detector fix are orthogonal.

## References

- Audit findings: `reports/epub_split_audit_2026_04_24_post_backfill.md`
- Audit script: `backend/scripts/epub_split_audit.py` (#832, #839)
- Structural flag definition: `_find_structural_flags` in the audit script
- Tracking issue: #888 (supersedes single-book #820)
- Sibling issue: #887 (Category-1 0-char EPUB extraction — different root cause)

Closes #888 once this design doc merges. Implementation PR follows.
