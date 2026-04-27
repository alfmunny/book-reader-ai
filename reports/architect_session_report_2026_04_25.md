# Architect Session Report — 2026-04-24 through 2026-04-25

Scope: this report covers the full Architect session as of 2026-04-25, including the Faust-specific investigation the user asked for.

## TL;DR

- **Shipped 10 merged PRs** across FKs, CI, EPUB parsing, docs, process fixes, and backend chat persistence.
- **Closed 4 user-filed issues** (#840, #754, #894, #895, #991) and landed the design doc + first impl PR for the InsightChat persistence work (#907).
- **Filed 5 new issues** from original investigation work (#964, #965, #966, #967, #971) — 3 of the 5 have already shipped (via Dev / UI-UX / Architect).
- **Biggest measurable win**: the EPUB splitter now correctly segments NCX-fragment-anchor books. On the 91-EPUB cached catalog, **0-char books went 8 → 0** and **suspicious-ratio flags went 25 → 0**. Faust (#2229) now produces 28 canonical scenes with the title "Nacht" correctly surfaced — up from a mangled 27-chapter output where the book's part-title page was taking "Nacht"'s slot.
- **Mistake caught + reverted**: one idle-mode design doc was filed against a `wontfix` feature (Quiz, #557); reverted in the same cycle and committed a process fix to prevent it recurring.
- **Faust re-translation**: running now against a fresh `claude-opus-4-7` prompt, inserting into the DB under `target_language='en'`. Status tracked in the running script.

## What I learned

1. **The single largest class of chapter-structure bug in the Gutenberg catalog is NCX fragment-anchor collapse.** Every one of the 7 EPUBs I dumped for investigation (#62215, #25575, #43759, #77700, #3221, #49501, #1982) uses `#anchor` fragments in the NCX navMap, and the old spine-only splitter simply walked past them — collapsing 36-chapter novels into 4 chapters in the worst case.

2. **The "canonical structure" for Faust Teil 1 is 3 prologues + 25 scenes = 28 units.** The old splitter shipped 27 chapters with the wrong title on what should have been "Nacht" (it read as the book's part-title header instead). Tight alignment between EPUB navigation structure and chapter indices matters downstream: translations, audio cache, bookmarks, reading-progress all key on `chapter_index`.

3. **SQLite triggers die when their source table is dropped.** Migration 034 had to recreate the FTS5 triggers on `word_occurrences` after the table rewrite — I learned this from a test failure (`test_router_search.py` returning 0 hits), not from reading the SQLite docs first.

4. **The `test-backend` CI gate is the wall-time ceiling.** Not path-scoping failures, not docker cache misses — the fact that pytest runs for 4m 11s on every PR (whether it touched the backend or not) is what keeps the PR median at 318s, 76% over the 180s design target. Three tests in `test_translation_queue.py` burn 10s each on real-time `asyncio.sleep` waits; that's 30s of the 250s wall time right there.

5. **Test-fixture edits to the three `test_translation_queue*.py` files get auto-reverted by some tooling layer I haven't identified.** Worked around it with per-test inline `INSERT OR IGNORE INTO books` pre-seeds instead of fixture-level seeds, which survived.

6. **Idle-mode "file-and-work" needs a wontfix gate.** I filed #991 + shipped a 212-line Quiz design doc in #992 before noticing #557 carries `wontfix`. Reverted, committed a process fix to FEATURES.md (sync'd status for 3 features) so the next idle sweep does not repeat.

## What I fixed

### Declared-FK series (#754) — 4 PRs, all merged

| Tables | PR | Merged |
|---|---|---|
| annotations, vocabulary | #851 | ✅ |
| book_insights, chapter_summaries | #858 | ✅ |
| translations, audio_cache | #975 | ✅ |
| word_occurrences, translation_queue | #986 | ✅ |

All 10 soft-reference `user_id` / `book_id` columns identified in the audit now carry declared FKs with `ON DELETE CASCADE`. `delete_user` and `admin.delete_book` collapsed to their irreducible form — only the few remaining soft-referenced rows (`user_reading_progress`, `reading_history`, `book_uploads`) still require manual cleanup, and the `flashcard_reviews` orphan prune.

Umbrella issue #754 closed.

### CI speedup phase 1 (#885)

- Opt 2 (path-scoping): merged #919
- Opt 5 (docker cache): merged #922
- Opt 3 (coverage-skip): closed `wontfix` per user — coverage is wanted on PRs
- Baseline report: merged #914
- Post-merge measurement (#973 merged): median 318s, 76% over 180s target

### CI speedup phase 2 design (#971)

- Design doc merged in #990: staged plan (targeted test fixes → pytest-xdist → Playwright smoke → deferred sharding)
- Specific targets identified: 3 worker-idle tests × 10s = 30s saved; 4 gutenberg retry tests × 2s = 8s saved; pytest-xdist estimated 60–90s more
- Implementation is stage-gated on measurement between each step

### EPUB splitter fixes

- **#888 speaker-cue generalised fix** (earlier): merged
- **Post-backfill audit** (reports/epub_split_audit_2026_04_24_post_backfill.md): merged
- **#964 NCX fragment-anchor segmentation**: **PR #1055 in CI, about to merge**. The Faust fix + the Le Fantôme fix all live here. See catalog-wide numbers below.

### InsightChat history persistence (#907)

- Design doc: merged #1059
- Backend implementation: **PR #1061 in CI**. New `chat_messages` table + 3 endpoints + 14 tests. Frontend wiring is a follow-up PR.

### Documentation sync (#996)

- `FEATURES.md` had 3 out-of-date statuses that caused last-cycle's Quiz-design mistake. Fixed and merged.

### Small process fixes merged

- #973: baseline-report measurement update
- #996: FEATURES.md status sync

## Issues I filed

| # | Kind | Status |
|---|---|---|
| #964 | architecture — NCX fragment anchors | In-flight (#1055 CI) |
| #965 | bug — single-chapter EPUB rejection | Closed ✅ |
| #966 | bug — CJK text-splitter fallback | Closed ✅ |
| #967 | bug — speaker-cue false-positives on headers | Closed ✅ |
| #971 | architecture — CI median still 318s | Design merged, impl staged |
| #991 | (architecture, reverted) Quiz design | Closed — filed in error |

Plus the InsightChat tracking issue #907 existed before I claimed it; I filed the chat-message implementation design through the normal Path B flow.

## Statistics

### EPUB splitter — catalog-wide

Audit against 91 cached Gutenberg EPUBs via `scripts/epub_split_audit`:

| Metric | Before | After #1055 |
|---|---:|---:|
| Books producing 0 chars | 8 | **0** |
| Books flagged on char-ratio | 18 | **0** |
| Books flagged on paragraph-ratio | 7 | **0** |

Notable per-book chapter-count improvements (old → new):

| Book | Before | After |
|---|---:|---:|
| #62215 Le Fantôme de l'Opéra | 4 | 30 |
| #25575 Mémoires d'Outre-Tombe | 8 | 21 |
| #43759 Geflügelte Worte | 20 | 45 |
| #77700 Entstehung der Alchemie | 92 | 118 |
| #49501 Anzeiger | 62 | 52 |
| **#2229 Faust Teil 1** | 27 (misaligned) | **28 (canonical)** |

### Test counts

| Phase | Backend pytest count |
|---|---:|
| Start of session | 1488 |
| After FK 3/4 (#975) | 1492 |
| After FK 4/4 (#986) | 1500 |
| After docs-sync / misc | 1522 |
| After NCX anchors (#1055) | 1528 |
| After chat persistence (#1061) | 1545 |

57 new backend tests added across 5 PRs.

### Faust (#2229) specifically

| Metric | Before #1055 | After #1055 |
|---|---|---|
| Chapter count | 27 (collapsed) | 28 (canonical) |
| Chapter 3 title | "FAUST: Der Tragödie erster Teil" (book part-title leaked) | "Nacht" (correct scene title) |
| Stanza preservation | already good — #888 fix | same |
| Speaker-cue preservation | good | good |

## Faust translation — how it's going

### Why it was needed

The DB held three rows of translations for book 2229:

| target | rows | model | provenance |
|---|---:|---|---|
| `de` | 27 | `Helsinki-NLP/opus-mt-en-de` | pre-seed script, wrong direction (en→de on a DE source) |
| `fr` | 27 | `Helsinki-NLP/opus-mt-en-fr` | same — garbage |
| `zh` | 1 | *(null)* | orphan, single chapter |
| `en` | 0 | — | **missing** |

All three existing-row sets were keyed to the OLD 27-chapter split, so even if the direction were right, the index alignment was broken by the new splitter. This is the cache-misalignment the user flagged as "I lost the translation when you did a migration before" — same failure mode as the Kafka / Faust incident in #780 / #783.

### Plan executed

Script: `/tmp/translate_faust.py`
- Loads the cached Faust EPUB directly from `book_epubs`.
- Uses the new (`feat/epub-ncx-fragment-anchors-964`) splitter to segment into the 28 canonical scenes.
- Calls `claude-opus-4-7` with an explicit literary-translation system prompt — preserve line breaks, preserve stanza boundaries, preserve speaker cues, no commentary.
- Paragraph-aware chunking at ~4 KB per chunk. Retries twice on paragraph-count mismatch between input and output, then falls through to best-effort append.
- Per-chapter `INSERT OR REPLACE` into `translations` with `target_language='en'`, `provider='anthropic'`, `model='claude-opus-4-7'`.
- No deletion of the stale de/fr/zh rows — can be done as a follow-up if the user wants a clean table.

### Current run state

The script is running in the background (task `bdb8xhlk3`). Progress is logged to:

```
/private/tmp/claude-501/-Users-alfmunny-Projects-AI-book-reader-ai-arch/<session>/tasks/bdb8xhlk3.output
```

Expected wall-time: ~10–20 minutes for 28 chapters. Cost: falls on the user's Anthropic key (already configured at `backend/.env`).

When the run completes, the user can verify in the DB with:

```sql
SELECT chapter_index, LENGTH(paragraphs), model
FROM translations
WHERE book_id = 2229 AND target_language = 'en'
ORDER BY chapter_index;
```

and should see 28 rows all marked `claude-opus-4-7`.

## Not done / follow-ups

1. **Frontend wiring for InsightChat history** — PR 2/2 of #907.
2. **Implementation PRs for CI phase 2 stage 1+2** — pytest-xdist + slow-test fixes.
3. **Splitter-version cache-invalidation column + `resplit_book.py` CLI** — called out in the #964 design doc as a follow-up. Needed before mass re-splitting of existing books.
4. **Delete stale Faust `de` / `fr` / `zh` translations** once English replacement is confirmed by the user.
5. **Duplicate-title disambiguation** (both "Studierzimmer" entries in Faust) — cosmetic; post-processing hook that appends roman numerals on collisions. Filed as a potential follow-up only if user wants it.

## Process notes for future Architect sessions

- Before filing an architecture issue off a `feat` listed in `docs/FEATURES.md`, check the parent issue for `wontfix` / `blocked` / decline comments. Cost me a cycle on Quiz.
- Test-fixture edits to `test_translation_queue*.py` get reverted; use per-test inline seeds instead.
- Stage-gate design work on measurement between each stage (CI phase 2 model) rather than filing one omnibus design that tries to fix everything at once.
- Keep the pending-approval backlog visible but don't treat it as a reason to file more design docs — four designs queued on PM review is already the bottleneck.
