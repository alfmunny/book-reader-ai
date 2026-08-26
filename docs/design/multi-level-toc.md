# Multi-Level Table of Contents

**Status:** Superseded (#2745, 2026-08-27)
**Author:** Architect
**Date:** 2026-04-27
**Priority:** P1
**Prior work:** #1742 (issue), `docs/design/epub-ncx-fragment-anchors.md` (parent splitter rewrite that exposed full NCX walks), `docs/design/epub-nested-ncx-titles.md` (the existing parent-leaf composed-title fallback), `docs/design/splitter-version-cache-invalidation.md` (companion follow-up — the resplit pipeline this design depends on for migrating existing books)

> **Superseded by #2745.** The *topic* remains valid — grouped navigation for
> books with parts, acts or scenes — but this design is not the way there.
>
> It predates fossilization (#2624) by four months and is built around a
> migration we have decided not to run: its Prior-work line names
> `splitter-version-cache-invalidation.md` as "the resplit pipeline this design
> depends on for migrating existing books", and that pipeline is gone. Books are
> frozen artifacts now, not recomputed splits.
>
> #2745 replaced the chapter `<select>` with a Contents panel in the reader
> sidebar (shipped in #2746) and folds grouping in as a second phase, gated on
> recording part metadata deliberately rather than inferring it. Kept for the
> problem statement and the survey of affected books, which are still accurate.

## Problem

The reader models every book as a **flat list of chapters** indexed `0..N-1`. That works for Moby Dick, Pride and Prejudice, and the long tail of single-level Gutenberg novels. It collapses structure for every book whose source has a deeper hierarchy:

| Book | Source structure | Today's TOC |
|---|---|---|
| War and Peace | Book → Chapter (2 levels) | flat |
| Les Misérables | Volume → Book → Chapter (3 levels) | flat |
| Faust Teil 1 | Part → (Prelude / Tragedy) → Scene | flat |
| Shakespeare plays | Act → Scene | flat |
| Anna Karenina | Part → Chapter | flat |

Two costs:

1. **Reader UX** — the sidebar shows "Chapter 1 … Chapter 200" instead of "Book Two → Chapter 5", losing the navigational scaffolding the original work relies on.
2. **Translation / annotation context** — when a chapter title is just `"V"` (a bare roman numeral), it is meaningless without the parent context. The 2026-04 nested-NCX-titles fix (`epub-nested-ncx-titles.md`) papered this over by *composing* the parent title into the leaf string (`"Book Two — V"`), but composing is lossy: it can't be collapsed by the user, and the bare `"V"` never round-trips out of the title.

The splitter's NCX walk already has the hierarchy in hand (`_walk_toc_with_path` carries an ancestor-title stack at every leaf — see `backend/services/splitter.py:921`). The information is being thrown away at the `Chapter(title=composed, text=...)` boundary because the dataclass has no field to hold it.

## Why Path B

- Schema change (`user_book_chapters` gets a structural column for uploaded books).
- Cross-cutting: ingestion (`splitter.py`), persistence (`user_book_chapters`), API (`GET /books/{id}/chapters`), and frontend (reader sidebar TOC tree). Three services, four files-of-significance, plus the test surface.
- Touches the existing chapter cache contract: `chapter_index` is the cache key for `translations`, `audio_cache`, `chapter_summaries`, `book_insights`, `annotations`, `word_occurrences`. The migration policy must be explicit about whether group introduction renumbers chapters (it does not — see §"Cache contract" below).
- Backfill story for existing hierarchical books in the catalog interacts with `docs/design/splitter-version-cache-invalidation.md` (resplit triggers cache wipe per book).

## Proposed solution

### 1. Data model — augment, don't replace

The single most important decision is **`chapter_index` stays the canonical reading-order cache key**. Hierarchy is added as a parallel display attribute, not a replacement for the flat index.

Add a `group_path` field to the `Chapter` dataclass:

```python
@dataclass
class Chapter:
    title: str            # leaf title, e.g. "V" or "Nacht"
    text: str
    group_path: list[str] = field(default_factory=list)  # ["Volume I", "Book Two"]
```

`group_path` is the ordered list of ancestor titles, root-first. Empty list = top-level chapter (today's flat case). For Anna Karenina chapter "V" inside "Part Two": `group_path = ["Part Two"]`. For Les Misérables chapter "I" inside "Volume I → Book Three": `group_path = ["Volume I", "Book Three"]`.

The composed title from `epub-nested-ncx-titles.md` (`"Part Two — V"`) is now derivable on the frontend from `group_path + [title]`, so the title field can return to carrying just the leaf — **no longer composed**. This is a behaviour change for hierarchical books but only affects `chapter.title`; `chapter_index` is stable.

### 2. Schema — `user_book_chapters` gets a `group_path` column

For Gutenberg books, chapters live only in memory (`services.book_chapters._chapter_cache`) and the splitter recomputes them per process. No schema change there.

For **uploaded books**, chapters persist in `user_book_chapters`. Migration `037_user_book_chapters_group_path.sql`:

```sql
ALTER TABLE user_book_chapters ADD COLUMN group_path TEXT NOT NULL DEFAULT '[]';
```

`group_path` is JSON-encoded (`'["Volume I", "Book Two"]'`). NULL not allowed; default `'[]'` is the flat-chapter case. Existing rows backfill to `'[]'` on migration — flat behaviour preserved.

The upload confirm endpoint (`POST /books/{book_id}/chapters/confirm`, `backend/routers/uploads.py:220`) accepts a per-chapter `group_path: list[str]` and persists it. The draft endpoint (`GET /books/{book_id}/chapters/draft`) returns it.

### 3. EPUB ingestion — surface what the walker already has

`_walk_toc_with_path` (`backend/services/splitter.py:921`) already passes an ancestor-title stack to its `on_entry` callback. Today only `_epub_nav_titles` consumes it, and only to compose `<Parent> — <Leaf>` strings.

Add a sibling helper that returns the ancestor list per item_id:

```python
# returns {item_id: ancestor_titles_for_first_or_deepest_navPoint}
def _epub_nav_groups(book) -> dict[str, list[str]]:
    ...
```

Inside `build_chapters_from_epub` (`splitter.py:579`), populate `Chapter.group_path` from this dict. For the multi-anchor-per-spine-file case (post-#1055 NCX-fragment anchors), each anchor inherits its file's group_path; if the NCX has *deeper* structure inside the file (uncommon but legal), per-anchor group_paths can extend further.

**Heuristics for "structural-only" parent navPoints** (already partially handled in `epub-nested-ncx-titles.md`'s `_strip_leading_headings`): a parent navPoint whose href shares the first anchor of its first child is a *structural marker* (a "Part" pointer that doubles as the heading of the first chapter). Today these are detected as duplicates and skipped. With group_path, the same detection applies but **the navPoint's title becomes the group_path entry** instead of being dropped — that's the whole point.

### 4. Plain-text splitter — detect group headings

Plain-text Gutenberg books (`build_chapters` path, no EPUB available) currently match the `KEYWORD_RE` regex at `splitter.py:47` against `CHAPTER`, `CHAPITRE`, `BOOK`, `PART`, `ACT`, `SCENE`, etc. — all already in the alternation. The match is treated as a chapter boundary regardless of which keyword fired.

Refine: classify the matched keyword by **rank**:

```
GROUP_RANKS = {
    "VOLUME":   0,
    "BOOK":     1, "LIVRE": 1, "BUCH": 1,
    "PART":     2, "PARTIE": 2, "TEIL": 2,
    "ACT":      3, "ACTE": 3, "AKT": 3,
    "CHAPTER":  4, "CHAPITRE": 4, "KAPITEL": 4,
    "SCENE":    5, "SCÈNE": 5, "SZENE": 5,
    "LETTER":   4, "LETTRE": 4, "BRIEF": 4,
    # PROLOGUE / EPILOGUE / INTRODUCTION → standalone leaves, group_path = []
}
```

Walk the matches in source order, maintaining a current `group_stack: list[(rank, title)]`. When a match arrives:

- If its rank is **lower (more structural)** than the stack top, pop the stack to the appropriate depth and push the new group.
- If its rank is **higher (more leaf)** than the stack top, this is a chapter boundary; the current stack contents are its `group_path`.
- If equal rank, this is a sibling at the current level — same depth, replace the stack top.

Group-only matches (Volume, Book, Part) emit no `Chapter` themselves; they only update the stack. The body between two adjacent leaf matches becomes a `Chapter` with the current stack as `group_path`.

This is best-effort; the splitter has always been heuristic on plain-text. The fallback when ranks don't pattern-match cleanly is the **flat behaviour** (group_path = []).

### 5. API response shape

`GET /books/{id}/chapters` keeps its current shape and **adds** a `group_path` field per chapter. The flat `chapters` array is unchanged in length and order:

```json
{
  "book_id": 2600,
  "meta": {...},
  "chapter_source": "epub",
  "chapters": [
    {"title": "I", "text": "...", "group_path": ["Book One"]},
    {"title": "II", "text": "...", "group_path": ["Book One"]},
    {"title": "I", "text": "...", "group_path": ["Book Two"]},
    {"title": "II", "text": "...", "group_path": ["Book Two"]}
  ]
}
```

Why not return a tree directly? Two reasons:

- The reader needs **flat chapter ordering** for next/prev navigation, scrubber positioning, and translation cache lookups (which are keyed by flat chapter_index). A tree would force the frontend to flatten on every render to derive the next-chapter link.
- Old clients (a deployed iOS prototype, the test fixtures, `npm test`) read `chapters[i]` and ignore unknown fields. Adding `group_path` is additive — no breakage.

Frontend builds the tree from `group_path` at render time. Backend response is ground truth.

### 6. Frontend — collapsible TOC tree

The reader sidebar TOC component reads `chapters` and groups them by `group_path` into a nested `<details>`/`<summary>` tree. Top-level chapters (`group_path = []`) render at the root. A group is collapsed by default if it doesn't contain the current chapter; expanded if it does.

A breadcrumb header above the chapter title in the reader chrome renders the current chapter's `group_path` (e.g. `Volume I › Book Three › V`).

Bookmarks include the group_path string in their display (the underlying bookmark row keeps just `chapter_index` — group_path is rendered from the chapter's response).

Touch targets are 44 × 44 px on mobile per the graphic-design rules in CLAUDE.md.

### 7. Migration — backfill via the resplit pipeline

The companion design `docs/design/splitter-version-cache-invalidation.md` (just merged via PR #1741) introduces `books.splitter_version` + `resplit_book.py`. This design **piggybacks on it**:

- The splitter version constant bumps from `1` → `2` when this design ships, because `Chapter.group_path` is a behaviour change for any hierarchical book.
- Existing hierarchical books in the catalog (the ~10–15 books out of the 91-book audit) become **resplit candidates**. Operator runs `resplit_book.py --book-id <N> --dry-run` to see the chapter-count delta (usually 0 for hierarchical books — the leaves are unchanged; only `group_path` is added) and `--confirm` to apply.
- Flat books stay at `splitter_version = 0` or get bumped to `2` with no actual data change. They're no-ops.

The cache-invalidation policy from the splitter-version design applies as written: `translations`, `audio_cache`, `chapter_summaries` etc. all wipe per book on resplit, even if `chapter_index` happens to be unchanged for a particular hierarchical book — because the operator can't tell from outside the splitter whether boundaries shifted, so the safe default is wipe.

A book where ONLY group_path changed (no chapter_index change) is technically cache-aligned and could skip the wipe. The CLI's `--bump-version-only` escape hatch (designed for exactly this case) handles it: operator runs `--dry-run`, confirms `chapters: N → N (0)` and zero shift in titles, then runs `--bump-version-only` to update the version stamp without wiping caches. This is the recommended path for hierarchical books that re-split cleanly.

### 8. Cache contract — `chapter_index` is invariant under "add group_path"

This is the heart of why the design is incremental rather than a rewrite.

- `chapter_index` continues to mean "0-based reading-order position in the flat chapter array".
- Adding `group_path` does NOT renumber chapters. A book that was `[Ch1, Ch2, Ch3]` stays `chapter_index = 0, 1, 2`; group structure is just additional metadata.
- Therefore: every chapter-indexed cache table (`translations`, `audio_cache`, `chapter_summaries`, `book_insights`, `annotations`, `word_occurrences`, `user_reading_progress`, `reading_history`) needs **no schema change** and **no row-shift migration**. The cache is invariant.
- The only data movement is the `user_book_chapters.group_path` column add (default `'[]'`).

Future-proof: if we ever need to support multiple flat orderings of the same hierarchical book (e.g. "Volume I → Volume II" vs "Volume II → Volume I" as a user preference), THAT is a different, much larger design — and explicitly out of scope.

## API changes

| Route | Change |
|---|---|
| `GET /books/{id}/chapters` | response `chapters[]` items gain `group_path: list[str]` (additive). |
| `GET /books/{id}/chapters/draft` | same — uploaded-book draft chapters surface `group_path`. |
| `POST /books/{id}/chapters/confirm` | request body's per-chapter object accepts `group_path: list[str]`; defaults `[]` for back-compat. |

No new routes. No deprecated routes.

## Test plan

| Test | Asserts |
|---|---|
| `test_chapter_dataclass_default_group_path_empty` | `Chapter(title="x", text="y").group_path == []` — flat books are unchanged. |
| `test_epub_ingestion_populates_group_path_war_and_peace` | golden test on a synthetic EPUB with NCX `<Book One> → <Chapter I>` produces `Chapter.group_path == ["Book One"]`. |
| `test_epub_ingestion_preserves_leaf_title_when_grouped` | the parent-leaf composition from `epub-nested-ncx-titles.md` is replaced — `chapter.title == "I"` (not `"Book One — I"`). |
| `test_epub_ingestion_three_level_hierarchy` | Les Misérables-style `<Volume I> → <Book Three> → <I>` produces `group_path == ["Volume I", "Book Three"]`. |
| `test_plain_text_book_part_chapter_split` | plain-text fixture with `"BOOK ONE\n\nCHAPTER I\n..."` → group_path `["BOOK ONE"]` on chapter `"CHAPTER I"`. |
| `test_plain_text_falls_back_flat_when_ranks_inconsistent` | broken / non-monotonic group keywords → splitter emits flat chapters with `group_path = []` (no exception). |
| `test_api_chapters_returns_group_path_field` | `GET /books/{id}/chapters` response includes `group_path` for every chapter; flat books get `[]`. |
| `test_api_chapters_back_compat_clients` | clients that ignore `group_path` see exactly the prior `{"title", "text"}` shape (no breaking field rename). |
| `test_uploaded_book_confirm_persists_group_path` | `POST /chapters/confirm` round-trips `group_path` into `user_book_chapters`. |
| `test_migration_037_backfills_empty_array` | rows existing pre-migration get `group_path = '[]'`. |
| `test_chapter_index_invariant_under_group_path` | for a fixture hierarchical book, `chapter_index` values match those of a flat-rendered version of the same book → caches are not silently misaligned. |

Frontend tests in `frontend/src/__tests__/`:

- `ReaderSidebarTOC.tree.test.tsx` — given a `chapters` array with mixed group_paths, the sidebar renders a nested `<details>` tree with the right titles and the current chapter's group is auto-expanded.
- `ReaderBreadcrumb.test.tsx` — current chapter's group_path renders as `Volume I › Book Three › V`.

## Risks / open questions

1. **Max nesting depth.** The design supports arbitrary depth in the data model (`group_path` is a list). The frontend tree renders any depth. In practice the deepest book we know of (Les Misérables) is 3 levels; setting an explicit cap risks rejecting a legitimate edge case. **Decision: no cap, but warn (log line) if depth > 4 — likely a parser bug, not a real book.**

2. **Group navigation — should clicking "Book Two" jump to its first chapter?** Yes. Group nodes in the TOC are clickable and navigate to the first chapter under that group (its `chapter_index`). This is a frontend-only decision.

3. **Existing composed titles.** `epub-nested-ncx-titles.md` (issue #1151) ships titles like `"Book Two — V"` for hierarchical books. After this design, the `title` field returns to carrying just `"V"`. Frontend must handle BOTH shapes during rollout — old cached responses with composed titles and new responses with `group_path` + leaf title. The transition is clean only if we resplit every hierarchical book in the catalog before frontend assumes the new shape. **Sequencing: backend ships first with both behaviours feature-flagged off. Once every hierarchical book is resplit, frontend ships and reads `group_path` only.**

4. **Annotations across re-render.** Annotations key on `(book_id, chapter_index, sentence_text)`. Adding group_path doesn't move them — they continue to work. Bookmarks display gets a free upgrade (group_path appears in the breadcrumb).

5. **Translation cache.** Same — translations key on `(book_id, chapter_index, target_language)`. Group introduction doesn't shift chapter_index in the steady state, so cache is preserved. The transient case is the resplit itself, handled by the splitter-version design.

6. **Upload UX.** Uploaded EPUBs that have NCX hierarchy will get group_path populated automatically. Uploads that come from plain-text manual confirmation (`POST /chapters/confirm`) get whatever the user types in the draft UI — most uploaders won't bother, so group_path stays `[]` for those. Acceptable.

7. **API tree vs flat — final call.** Recommended **flat with group_path field** (§5 above). A future REST resource `GET /books/{id}/toc` could expose a tree-shaped representation if we ever want a TOC-only endpoint, but it's not needed for the current sidebar; the same `chapters` payload that powers the reader powers the sidebar.

8. **Frontend tree library.** Considered using a third-party tree component (`react-arborist`, `rc-tree`). Rejected — native `<details>`/`<summary>` plus a small wrapper component matches the existing design language (CLAUDE.md graphic-design rules: parchment/amber/ink palette, custom Icons.tsx) better than dropping in a stranger.

## Acceptance

- Migration `037` ships with a test that seeds an existing-row + new-row pair and asserts default `'[]'`.
- Chapter dataclass carries `group_path`; EPUB ingestion populates from NCX walk.
- Plain-text splitter detects group keywords by rank and produces correct group_paths for a Les Misérables fixture.
- `GET /books/{id}/chapters` response includes `group_path` for every chapter.
- Reader sidebar renders a collapsible nested TOC; current chapter's group is auto-expanded.
- Breadcrumb above the chapter title shows `group_path`.
- Splitter version constant bumps to `2` (interlocks with the resplit design).
- One representative hierarchical book (proposal: War and Peace if cached, else Anna Karenina) is end-to-end resplit and verified in the deployed reader.

## Path B gate

This design doc PR will be created with `gh pr create --label needs-user-approval` to seed the gate label at PR-open time, **avoiding the auto-merge race observed on PR #1741** (filed as #1744). PM reviews for readiness and applies `pm-approved`; user is the sole approver and removes `needs-user-approval` + applies `user-approved` to release the merge. Implementation is filed as a follow-up issue (or via conversion of #1742) once this design is merged.

## Open questions for review

(Listed for the user / PM review pass — not blockers for the design as written, but explicit decision points.)

1. Confirm the **augment-don't-replace** decision: `chapter_index` stays canonical; `group_path` is additive metadata. (Alternative: stable `chapter_id` UUIDs and trees end-to-end. Heavier; see §8.)
2. Confirm the **rollout sequencing**: backend ships first (additive, dual-rendering), then frontend; resplit the catalog in between. (Alternative: ship both at once and break un-resplit hierarchical books for one deploy window.)
3. Confirm the **plain-text rank table** (Volume / Book / Part / Act / Chapter / Scene / Letter). Add or remove keywords here is cheap.
4. Confirm **no max depth cap**, only a warning log at depth > 4.
5. Confirm we drop the composed-title fallback from `epub-nested-ncx-titles.md` once group_path is end-to-end. (The composition logic stays in the codebase as a one-line `chapter.title = " — ".join(group_path + [chapter.title])` formatting helper for places that want a flat string, but it's no longer the canonical title.)
