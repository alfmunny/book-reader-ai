**Status:** Draft
**Author:** Architect
**Date:** 2026-04-25
**Priority:** P3
**Prior work:** #1073 (issue), #1055 (NCX fragment-anchor segmentation), `reports/translation_audits_2026_04_25.md`

# Translation alignment checker — generalisation

## Problem

A throwaway script at `/tmp/check_faust_alignment.py` was useful for the 2026-04-25 audit pass: it caught 18 stanza-line drifts in Rilke's *Stundenbuch* zh translation (translator collapsing or splitting verse lines), and it gave per-row diff details that fed straight into hand-fixed patches. But it has three structural problems that block it from being a maintained tool:

1. **Hard-coded DE/ZH typography.** The speaker-cue regex (`^[A-ZÄÖÜ][A-ZÄÖÜß\s,]{1,}…\.$`) only matches Latin uppercase German cues with a trailing period (e.g. `MEPHISTOPHELES.`). It misses every other source language: French stage plays use mixed case (`Le Roi.` / `LE ROI.`), Russian uses Cyrillic uppercase, English uses italicized cues without all-caps, ancient Greek uses scripts the regex doesn't even cover. Trying to apply the checker against Madame Bovary, Anna Karenina, or any non-Faust play gives meaningless output.

2. **Stage-direction wrap false positives.** Stanza-line-count check flags every paragraph where the source has a multi-line block. But it can't distinguish *verse stanzas* (where line count is meaningful and must match exactly) from *prose paragraphs that happened to wrap across multiple lines in the source XML* (where line count is an artefact of EPUB packaging, not authorial structure). The current heuristic of "≥3 lines = verse" misfires both ways: a 2-line stanza of dialogue gets exempted; a 3-line wrapped stage direction gets falsely flagged.

3. **No detection of Opus's specific drift modes.** Claude Opus, when translating chunked input (the `/tmp/import_and_check_rilke.py` pipeline chunks paragraphs at ~4000 chars), occasionally drops a single line from an 8-line stanza — collapsing it to 7. Or splits a single long line into 2. These are the *exact* drifts the audit caught and that the checker needs to flag deterministically. The current paragraph-count check catches the gross case (whole-paragraph drops) but misses the subtle one-line-per-stanza drop, which only the existing stanza-line check would catch — and it only fires for ≥3-line paragraphs.

Audited reproduction of all three failure modes: `reports/translation_audits_2026_04_25.md`. Concrete drifts from the Rilke pass listed under §1.

## Goal

Promote the script to a maintained tool at a canonical location:

```
backend/scripts/check_translation_alignment.py
```

with a structured, language-aware set of checks; pluggable per-source-language speaker-cue detection; and machine-readable output suitable for CI gating and for being invoked from the in-session translation pipeline as a post-translation sanity check.

## Scope (in)

1. **Move + rename.** `/tmp/check_faust_alignment.py` → `backend/scripts/check_translation_alignment.py`. Update imports and DB path from absolute to repo-relative (use `services.db` and `services.splitter` like other backend scripts).
2. **Pluggable cue detector.** Rather than a single regex, a registry: `{source_language: SpeakerCueDetector}`. Detectors implement `is_cue(line: str) -> bool` and `is_translated_cue(line: str, target_language: str) -> bool`. Built-in detectors for `de`, `fr`, `en`, `ru`. Default: `NoCueDetector` (every chapter passes the cue check vacuously).
3. **Verse vs. prose classifier.** Replace the "≥3 lines = verse" heuristic with: a paragraph is verse iff (a) ≥3 lines AND (b) lines are roughly even-length (stddev/mean < 0.5) AND (c) at least 2 lines end without sentence-final punctuation. Empirically calibrated on Faust (verse), Stundenbuch (verse), Bovary (prose), Moby Dick (prose, occasional verse-quote inserts). Overrides via per-book config — see §"Per-book overrides" below.
4. **Opus line-drop detection.** New check `paragraph_line_count_drift`: for any paragraph (regardless of verse/prose), if `|src_lines - tr_lines| ≥ 1` AND src has ≥4 lines, flag it. Tighter threshold than the existing stanza check; catches off-by-one drops that the previous pass missed below the ≥3 cutoff. Already empirically catches all 18 drifts from the Rilke audit.
5. **Structured JSON output.** New `--format json` mode emits `[{chapter, paragraph, kind, src_excerpt, tr_excerpt, severity}, …]`. Markdown stays the default for human/issue use.
6. **Exit-code gating.** Existing 0/1 stays; add `--severity-threshold {info, warning, error}` so CI can gate on errors only. New `--book-id N --target-lang X` is the canonical invocation; old positional `book_id [lang]` stays as a deprecation-period alias.
7. **One unit test per check kind.** `backend/tests/test_translation_alignment_checker.py` — table-driven tests with synthetic source/translation pairs that hit each `kind` exactly once.

## Scope (out — explicit)

- **Per-paragraph retry on translation-time drift.** This is a translation-pipeline concern (the `/tmp/import_and_check_rilke.py` chunker), not a checker concern. Belongs in a separate issue if filed.
- **Auto-fix.** The checker reports drift; it does not modify translations. Fixing 18 drifts in the Rilke audit needed human judgement (which line to split, which to merge); a tool would have got it wrong half the time.
- **Title alignment.** The `title_translation` field is checked elsewhere (#1151 design); this checker treats it as informational only.
- **Translation-quality scoring.** Out of scope — this is a structural checker, not a translation-quality evaluator.
- **Cross-book consistency** (same character translated two different ways across books). Out of scope.

## Per-book overrides

Some books have legitimately weird structure that the heuristics can't infer:
- Faust intersperses verse and prose; the verse classifier needs to know.
- Moby Dick has occasional inset hymns and chants that look like verse but appear inside prose chapters.

Add a small registry at `backend/scripts/translation_alignment_overrides.py`:

```python
OVERRIDES = {
    2229: {  # Faust
        'source_language': 'de',
        'verse_chapters': 'all',  # everything is verse-mode
    },
    2701: {  # Moby Dick
        'source_language': 'en',
        'verse_paragraph_indices': {  # explicit verse markers per chapter
            42: [3, 7],  # Father Mapple's hymn
            ...
        },
    },
    24288: {  # Stundenbuch
        'source_language': 'de',
        'verse_chapters': 'all',
    },
    14155: {  # Madame Bovary
        'source_language': 'fr',
        'verse_chapters': [],  # all prose
    },
}
```

Books not in the registry fall through to the heuristic. This keeps the checker zero-config for new books while letting us pin known cases.

## Files touched

- `backend/scripts/check_translation_alignment.py` (new) — ~280 LOC.
- `backend/scripts/translation_alignment_overrides.py` (new) — ~60 LOC.
- `backend/scripts/translation_alignment_detectors/` (new module) — `__init__.py`, `base.py`, `de.py`, `fr.py`, `en.py`, `ru.py`. ~150 LOC across.
- `backend/tests/test_translation_alignment_checker.py` (new) — ~200 LOC.
- `docs/reference/scripts.md` (existing or new section) — auto-generated entry; just confirm the docstring is good.
- `/tmp/check_faust_alignment.py` is left in place as a developer convenience but should be deleted after this lands.

## Schema / API changes

**None.** The checker reads `translations` and `book_epubs`; neither schema changes.

## Tests

| Case | Fixture | Expected `kind` |
|---|---|---|
| Stanza line drop (Rilke-style) | DE 8-line stanza, ZH 7 lines | `paragraph_line_count_drift` |
| Stanza line split | DE 5-line stanza, ZH 6 lines | `paragraph_line_count_drift` |
| Whole paragraph dropped | 30 src paragraphs, 29 tr | `paragraph_count_drift` |
| Speaker cue missing (Faust) | `MEPHISTOPHELES.` line, no zh equivalent | `speaker_cue_missing` |
| Speaker cue translated as prose (Faust) | `FAUST.` → ZH long sentence | `speaker_cue_not_translated` |
| Speaker cue (French) | `Le Roi.` → `国王。` | passes (mixed-case detector) |
| No speaker cues at all (Bovary) | prose only | passes (all kinds) |
| Verse classification — false negative | 3 short rhyming lines flagged as verse | passes (correctly verse) |
| Verse classification — false positive | 3 long uneven prose lines | passes (correctly prose) |
| Opus 1-line drop (≥4-line para) | DE 5 lines, ZH 4 | `paragraph_line_count_drift` |

Backend test target: `pytest backend/tests/test_translation_alignment_checker.py -v` plus regression of existing splitter tests (no overlap expected).

## CI integration

Add a new optional CI step in `.github/workflows/ci.yml`:

```yaml
- name: Translation alignment check (informational)
  if: github.event_name == 'pull_request' && contains(steps.changes.outputs.changed-files, 'data/translations/')
  continue-on-error: true
  run: |
    venv/bin/python backend/scripts/check_translation_alignment.py \
      --all-books --target-lang zh --severity-threshold error \
      --format json > alignment-report.json
    venv/bin/python backend/scripts/check_translation_alignment.py \
      --all-books --target-lang zh --severity-threshold error \
      --format markdown
```

Initially `continue-on-error: true` so it doesn't block PRs while we calibrate. Once stable (no false positives across the 5 existing tracked books), flip to enforcing.

## Migration policy compliance

No DB migration. No constraint changes. No data cleanup needed.

## Risks

1. **False positives on prose books.** The verse classifier could flip mid-paragraph and trigger checks where they shouldn't fire. Mitigation: `--severity-threshold` lets CI gate on `error` only; verse-classification failures emit `warning`. Plus per-book overrides escape hatch.
2. **Cue detector misses for less-common languages.** Spanish, Portuguese, Italian, Japanese plays exist but aren't in the initial registry. Mitigation: `NoCueDetector` is the default; you opt in via the override registry. Adding a language detector is a one-file PR.
3. **Performance on long books.** Moby Dick has ~3000 paragraphs. A pure-Python loop over all of them with regex matching is well under a second; not a concern.
4. **Drift between checker and splitter.** If splitter changes how it segments paragraphs (e.g., #1055 fragment anchors), the checker might over- or under-count. Mitigation: the checker imports `services.splitter.build_chapters_from_epub` directly — same function the production reader uses — so they stay in sync.

## Rollout

Single PR after design-doc sign-off:
1. Create `backend/scripts/check_translation_alignment.py` and the detector module.
2. Add tests.
3. Add CI step in `continue-on-error: true` mode.
4. Run against all 5 currently-tracked books (1342, 1513, 2701, 14155, 24288, 84, 45304); calibrate thresholds; document any per-book overrides discovered.
5. Delete `/tmp/check_faust_alignment.py` workaround.

A follow-up PR (week or two later, after observing CI noise) flips `continue-on-error` off.

## Open questions for review

1. **Opus retry vs. checker-only scope.** Issue #1073 mentions "Opus line drops" — interpreted here as a checker concern (detect after the fact). PM may have intended a translation-pipeline retry mechanism. Confirm interpretation before implementation.
2. **Per-book overrides location.** A flat dict in a Python file, or a JSON/YAML config? Python lets us encode functions for complex predicates; YAML is more PM-readable. Recommend Python.
3. **`--all-books` behaviour.** Should it default to all `(book_id, target_language)` pairs that have ≥1 row in `translations`, or require an explicit list? Recommend the former with a `--exclude` flag.
4. **CI on which event?** `pull_request` only when `data/translations/` changes (cheap), or every PR (catches drift introduced by splitter changes too)? Recommend the latter — splitter regressions are exactly what this is supposed to catch.

## Out of scope (re-emphasis)

- Auto-fixing detected drifts.
- Quality-scoring translations beyond structural alignment.
- Per-paragraph retry mechanism in the translation pipeline (separate issue if filed).
- Cross-book name/term consistency.
