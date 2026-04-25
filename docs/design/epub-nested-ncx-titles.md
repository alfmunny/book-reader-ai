**Status:** Draft
**Author:** Architect
**Date:** 2026-04-25
**Priority:** P3
**Prior work:** #1151 (issue), #1055 (NCX fragment-anchor segmentation), #964 (anchor design doc)

# EPUB nested-NCX title composition

## Problem

`backend/services/splitter._epub_nav_titles` flattens a two-level NCX hierarchy by picking the leaf navPoint's title for each spine item and discarding the enclosing section's `navLabel`. For multi-part books with NCX shaped as

```
<navMap>
  <navPoint><navLabel><text>PREMIÈRE PARTIE</text></navLabel><content src="part1ch1.xhtml"/>
    <navPoint><navLabel><text>I</text></navLabel><content src="part1ch1.xhtml"/></navPoint>
    <navPoint><navLabel><text>II</text></navLabel><content src="part1ch2.xhtml"/></navPoint>
    …
  </navPoint>
  <navPoint><navLabel><text>DEUXIÈME PARTIE</text></navLabel><content src="part2ch1.xhtml"/>
    <navPoint><navLabel><text>I</text></navLabel><content src="part2ch1.xhtml"/></navPoint>
    …
  </navPoint>
</navMap>
```

the reader displays:

| Splitter index | Splitter title | What the user expects |
|---:|---|---|
| 0 | (TOC concatenation: `"PREMIÈRE PARTIE I II III … TROISIÈME PARTIE …"`) | Title page or empty |
| 1 | `"PREMIÈRE PARTIE"` | `"Part 1 — Chapter I"` |
| 2 | `"II"` | `"Part 1 — Chapter II"` |
| 11 | `"DEUXIÈME PARTIE"` | `"Part 2 — Chapter I"` |
| 12 | `"II"` | `"Part 2 — Chapter II"` |
| 26 | `"TROISIÈME PARTIE"` | `"Part 3 — Chapter I"` |
| 27 | `"II"` | `"Part 3 — Chapter II"` |

Three concrete defects:

1. **Chapter 0 absorbs the entire TOC into its title.** `_epub_nav_titles` is called per-item, but the chapter-0 spine item happens to be the navMap root proxy whose title is the concatenation of every leaf navLabel. Audited on Madame Bovary (#14155): a 213-char title string `"PREMIÈRE PARTIE I II III IV V VI VII VIII IX DEUXIÈME PARTIE …"`.
2. **First chapter of each part takes the part heading verbatim.** When a `<navPoint>` and its first child navPoint share the same `content src=`, the parent's title wins (depth-first walk visits the parent first; the child's title is dropped via `setdefault`). Result: chapter 1 of each part is rendered with no chapter numeral.
3. **All other chapters are bare roman numerals.** Three different chapters titled `"II"`, three titled `"III"`, etc. — chapters lose part context, breaking sidebar navigation, search highlighting, and translation reuse across parts.

Audited reproduction: `reports/translation_audits_2026_04_25.md` §3 (Madame Bovary). Workaround currently applied per-translation: setting `translations.title_translation` to a clean Chinese `"第N部 第N章"` string at insert time, which fixes the zh display but not the source-language display and not search/sidebar.

Affects every multi-part book with a parent/leaf NCX hierarchy. Other Gutenberg books with this shape: Tolstoy *War and Peace*, Hugo *Les Misérables*, any book the Gutenberg packaging team treats as a "book in parts." Likely 5–15% of multi-volume titles.

## Solution

Replace `_epub_nav_titles` (and its sibling `_epub_nav_anchors` from #1055, where applicable) with a single TOC walker that:

1. **Tracks a path stack** during the depth-first walk: each navPoint pushes its `(title, href, anchor)` onto a stack on entry and pops on exit.
2. **Emits a composed title** for every navPoint that resolves to a `(item_id, anchor)`: the composed title is the path of *meaningful* ancestors joined by `" — "` (em dash with surrounding spaces), where "meaningful" means: ancestor whose title is non-empty AND distinct from the leaf's title AND not equal to a bare roman numeral or single character.
3. **Drops the chapter-0 TOC-concatenation case** by detecting that the root navPoint resolves to a spine item whose title length is unreasonable (>120 chars, or contains ≥4 navPoint titles concatenated). For those cases, fall back to the spine item's `<title>` element, then to a heuristic ("Title Page" / "Front Matter" / empty) — to be decided during implementation.

The output type stays `dict[str, str]` for `_epub_nav_titles` and `dict[str, list[tuple[anchor, title]]]` for `_epub_nav_anchors`, so callers don't change. This keeps the blast radius small.

### Composition examples

| NCX path | Composed title |
|---|---|
| `PREMIÈRE PARTIE > I` | `PREMIÈRE PARTIE — I` |
| `PREMIÈRE PARTIE > II` | `PREMIÈRE PARTIE — II` |
| `Book One: The Whale > Chapter 1. Loomings.` | `Book One: The Whale — Chapter 1. Loomings.` |
| `Part 3 > X.` (single bare leaf, ancestor labeled `Part 3`) | `Part 3 — X.` |
| `Chapter 1` (no parent or parent same as leaf) | `Chapter 1` |

The em-dash separator `" — "` matches the project's existing typographic convention (used in design-doc titles, journal entries, PR titles).

### Composition heuristic — when to compose vs. when to keep leaf-only

Compose **only** when ALL of:
- Ancestor has a non-empty `navLabel`.
- Leaf's title is "weak" — defined as: matches `^[IVXLCDM]+\.?$` (roman numeral, optional trailing dot) OR is a single character/digit OR is shorter than 5 characters AND ≤ 2 words.
- Composed title would not exceed 100 characters total.

Otherwise emit the leaf title as-is — preserves the current behaviour for books like *Faust* (#2229) where leaf navPoints already carry full descriptive titles ("Prolog im Himmel", "Vor dem Tor") and adding ancestor context would make titles redundant ("Erster Teil — Prolog im Himmel").

## Files touched

- `backend/services/splitter.py` — rewrite `_epub_nav_titles` (≈40 LOC change) and `_epub_nav_anchors` (≈30 LOC change). Both share the `_walk` core; refactor to a single inner walker that accepts a callback so the two functions can share path-tracking logic.
- `backend/tests/test_splitter_ncx_compose.py` (new) — table-driven tests with fixture EPUBs.
- `backend/tests/fixtures/epubs/nested-ncx-bovary.epub` (new) — minimal Bovary-shape NCX (3 parts × 3 chapters), zero text content. Already a pattern in the test suite (e.g., `nested-ncx-tolstoy.epub` via existing fixture-builder helpers).

No frontend changes — chapter title is already rendered as-is from the API.

## Schema / API changes

**None.** Chapter titles flow through `chapters.title` (already a free-form `TEXT`); no migration needed. The `translations.title_translation` workaround can stay in place for already-translated books that don't get re-split, but new translations of these books will have `chapter_index → composed-title` alignment without the workaround.

## Tests

| Case | Fixture | Expected |
|---|---|---|
| Two-level part/chapter (Bovary shape) | new `nested-ncx-bovary.epub` | `"PREMIÈRE PARTIE — I"` … `"TROISIÈME PARTIE — XI"` |
| Same href on parent and first child | same | First chapter of each part composes correctly (not just `"PREMIÈRE PARTIE"`) |
| Single-level navMap (Faust) | existing `faust-2229.epub` if cached, else build minimal | Leaf title preserved verbatim — no composition |
| TOC-concatenation root edge case | new `epub-toc-bloated-root.epub` | Chapter 0 falls back to "Title Page" or `<title>` element, NOT the 213-char concatenation |
| Single-level with #anchor fragments (NCX-fragment, #1055) | existing fragment-anchor fixture | Anchors still segment, titles still compose if applicable |
| Three-level deep NCX (Bible-style books > sections > verses) | new `epub-three-level.epub` | Compose only the immediate parent, not every ancestor — keep title length bounded |

Backend test target: `pytest backend/tests/test_splitter_ncx_compose.py` plus regression run of `test_splitter*.py` (existing) — all must pass.

Frontend: no behavioural change beyond the title strings the API already returns; existing `__tests__/ChaptersList.test.tsx` continues to pass since it stubs the chapter list.

## Migration policy compliance

No DB migration. No constraint changes. No data cleanup needed. Existing books in DB with bad titles (Bovary stored as `"II"` / `"III"`) will need to be re-split via the existing admin re-split flow OR will fix themselves on next EPUB cache eviction + re-fetch. Document the manual fix path in the implementation PR's body, not here.

## Risks

1. **Composition over-eager on books that don't need it.** Mitigation: the "weak leaf" heuristic above. Tested against Faust, Stundenbuch, Moby Dick (already audited and correct without composition). If implementation ships and a previously-correct book regresses to `"Buch I — Erster Teil"` style noise, hot-fix is to tighten the heuristic.
2. **Books with navPoint titles in non-Latin scripts.** The `^[IVXLCDM]+\.?$` regex is Latin-only. For CJK / Cyrillic / Greek roman-numeral equivalents, the heuristic falls back to "leaf is short" — which still catches the bulk of cases. Document as known limitation.
3. **Three-level-or-deeper NCX.** Compose only the immediate parent (one ancestor) rather than the full path. Tested in case 6 above. Avoids titles like `"Bible — Old Testament — Genesis — Chapter 1 — Verse 1"`.
4. **#1055 fragment-anchor interaction.** `_epub_nav_anchors` returns a list per spine item; each entry needs the same composition. Refactor extracts the path-tracking walker as a reusable helper so both functions stay in sync.

## Rollout

Single PR after design-doc sign-off. No flag — the change is mechanical and the test fixtures cover the regression risk. If a book regresses post-merge, the fix is a heuristic tweak, not a rollback.

## Open questions for review

1. **Em-dash separator vs. en-dash vs. colon.** Spec is `" — "` (em dash). Open to changing if PM prefers `": "` or `" – "`. Pick once, apply everywhere; downstream renderers don't care.
2. **Where does the chapter-0 TOC-concatenation root fall back to?** Three options: (a) `<title>` element from `<head>`, (b) literal `"Title Page"`, (c) empty string + frontend fallback to the book title. Recommend (a) → (c). Confirm.
3. **Should we re-split existing books in DB on this PR's deploy?** Recommend NO — re-split is an admin action, the user can trigger it for the books they care about. Surface a small CLI helper in `backend/scripts/` if the user wants automation.
4. **Three-level NCX: parent-only or full-path?** Spec says parent-only. Confirm.

## Out of scope

- `pageList` walking for per-poem splits (Stundenbuch §1 of audit). Tracked separately if filed.
- Re-running the alignment checker against books with corrected titles — that's #1073's domain.
- Any change to how `book_epubs` is cached or invalidated.
