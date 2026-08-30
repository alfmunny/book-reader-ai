# Contents panel grouping — parts, acts and scenes

**Status:** User-approved (repo owner, 2026-08-30; merged as #2772) — implementation pending
**Author:** UI/UX Dev
**Date:** 2026-08-30
**Priority:** P1
**Prior work:** #2745 (Phase 2 — this design), `docs/design/multi-level-toc.md` (Superseded 2026-08-27), #1742 / #1791 / #1740 (closed 2026-08-30 as superseded), #2755 → #2763 → #2767 (the `role` precedent this reuses), #2769 (Hamlet act titling, which this partly supersedes)

## Problem

The Contents panel renders a flat list. For four of the twenty frozen books, that discards the structure the work is built on.

Crime and Punishment is the clearest case. Its panel shows `CHAPTER I` **six times**, with nothing distinguishing them:

```
  2  CHAPTER I          16  CHAPTER I          28  CHAPTER I
  3  CHAPTER II         17  CHAPTER II         29  CHAPTER II
  …                     …                      …
```

A reader who wants Part IV Chapter II has to count. The information that separates those six rows — the part they belong to — exists in the work and is thrown away at the panel.

Two of the four books have a second, sharper defect: **the part heading swallowed the part's first chapter.**

| Book | Chapter titled… | …actually contains |
|---|---|---|
| Madame Bovary | `PREMIÈRE PARTIE` | Part 1, Chapter I |
| Madame Bovary | `DEUXIÈME PARTIE` | Part 2, Chapter I |
| Madame Bovary | `TROISIÈME PARTIE` | Part 3, Chapter I |

Each of those chapters opens with the bare paragraph `I`. The numbering in the panel then jumps `PREMIÈRE PARTIE`, `II`, `III` — Chapter I of every part is unreachable by name. This is the identical defect repaired for Hamlet in #2769, still unrepaired here.

## Why this design, and not the previous one

`docs/design/multi-level-toc.md` (2026-04-27) described the same topic and was marked **Superseded** on 2026-08-27. Its own Prior-work line names `splitter-version-cache-invalidation.md` as *"the resplit pipeline this design depends on for migrating existing books"* — and that pipeline is gone. Books are frozen artifacts now (#2624), not recomputed splits, so the migration it is built around is one we have explicitly decided not to run.

Its data model was also built for a catalogue we do not have. It proposed `group_path: list[str]` to carry arbitrary depth, motivated by Les Misérables (Volume → Book → Chapter). No book in the catalogue has more than one level of grouping. See "Data model" below.

What has changed since is that the route this design takes is now largely built. `role` (#2755 → #2763 → #2767) established the whole rail end to end:

| Piece | Built by |
|---|---|
| A display attribute on a frozen chapter, deliberately outside `content_sha256` | migration 050 |
| Declared per book with an `expect_title` guard and a `why`, never inferred | `chapter_split_overrides.py` |
| Written by `freeze_book.py`, carried by `ingest_book.py`, returned on the payload | #2763 |
| Applied to already-ingested rows by migration | 052 |
| Rendered as a collapsible group in the panel | `TableOfContents.tsx` |

A part label is the same shape as `role`. A part group is the same component as the Front matter group. This design adds one column, one registry key, three migrations and one generalisation of an existing component.

## Non-goal: inference

#2745 states the rule and this design keeps it: **we do not infer part boundaries.**

Every boundary here is derivable — Hamlet's `ACT n` titles, A Room with a View's `PART TWO — ` prefix, the numbering resets in Crime and Punishment and Madame Bovary. Deriving them is exactly what we must not do. Heuristics produced every defect repaired in #2712, #2713, #2716, #2725 and #2733. Part structure is real metadata: it gets recorded once, deliberately, with a stated reason, and guarded so a shifted split labels nothing.

## Scope — four books, audited

The other sixteen frozen books have no part structure and render identically either way.

### Hamlet #1524 — 5 acts over 20 chapters

Already retitled by #2769. Boundaries at chapters 0, 5, 7, 11, 18.

### Crime and Punishment #2554 — 6 parts + epilogue over 42 chapters

Parts are **not** present in any title; the numbering resets are the only signal in the text, which is precisely why they must be declared rather than detected.

| Part | Chapters | Leaf titles |
|---|---|---|
| PART I | 2–8 | CHAPTER I … CHAPTER VII |
| PART II | 9–15 | CHAPTER I … CHAPTER VII |
| PART III | 16–21 | CHAPTER I … CHAPTER VI |
| PART IV | 22–27 | CHAPTER I … CHAPTER VI |
| PART V | 28–32 | CHAPTER I … CHAPTER V |
| PART VI | 33–40 | CHAPTER I … CHAPTER VIII |
| — | 41 | EPILOGUE |

Chapters 0 and 1 are front matter and the translator's preface; chapter 0 already carries `role: frontmatter`. The epilogue takes no part label — it belongs to none.

### A Room with a View #2641 — 2 parts over 20 chapters, plus subtitles

The source sets `PART ONE` and `PART TWO` as literal headings (verified in the Gutenberg text at offsets 1891 and 144332). Part One is chapters 0–6, Part Two is 7–19.

The existing titles for Part Two are **already composed**: `PART TWO — Chapter VIII`. This is the lossy composition the superseded design complained about — the prefix cannot be collapsed and the bare `Chapter VIII` never round-trips out. Grouping moves the prefix into the header and returns the leaf to `Chapter VIII`.

This book also loses its **chapter subtitles**, which are in scope here by the owner's decision (2026-08-30). Forster titles every chapter, and the printed contents lists them:

```
Part One.
Chapter I. The Bertolini
Chapter II. In Santa Croce with No Baedeker
…
```

The splitter kept only the numeral, so the panel reads `Chapter I` … `Chapter XX` — twenty rows that say nothing. Every subtitle survives in the text as the chapter's **first paragraph**, in one of two shapes:

| Chapters | Title today | First paragraph |
|---|---|---|
| 0–6 (Part One) | `Chapter I` | `The Bertolini` |
| 7–19 (Part Two) | `PART TWO — Chapter VIII` | `Chapter VIII\nMedieval` |

## Subtitles: title-only, and why the obvious version is wrong

The tempting change is to move the subtitle out of the body and into the title. **That would corrupt the one existing translation.**

Chapter 19 carries a zh translation of 57 paragraphs whose first is `第二十章\n中世纪之终` — the translator translated the heading paragraph along with the rest. Translations align to the English by paragraph position. Dropping English paragraph 0 leaves 56 English against 57 Chinese, and every paragraph after the first renders against the wrong source. That is the failure mode the repo already built `realign_translations.py` to repair, and it is not worth re-creating deliberately.

So the change is **title-only**:

| | Today | Proposed |
|---|---|---|
| part | — | `PART ONE` |
| title | `Chapter I` | `Chapter I. The Bertolini` |
| paragraph 0 | `The Bertolini` | `The Bertolini` — unchanged |

The subtitle appears in both the title and the chapter's opening line. It already does today, in the sense that the line is already the first thing a reader sees; this adds it to the panel without removing anything. No paragraph moves, so chapter 19's translation stays aligned.

Titles come from the **printed contents listing**, not from the body paragraph, because the listing is the author's own canonical form and is punctuated (`Chapter I. The Bertolini`). Each is guarded on the current title as usual.

`title` sits inside `content_sha256`, so this re-stamps `book_freeze` and regenerates the artifact, following #2769 including its all-guards-match condition.

**One long row.** Forster's Chapter VI subtitle is a 200-character joke ending *"…Italians Drive Them"*. Per the owner's decision to show the work's own words, it is carried verbatim, and #2745's acceptance line — *"No chapter title is truncated in the panel"* — means it wraps rather than clips. That row will be several lines tall. Truncating it would both regress #2745 and blunt the joke, so it stands.

### Madame Bovary #14155 — 3 parts over 36 chapters

| Part | Chapters | Note |
|---|---|---|
| PREMIÈRE PARTIE | 1–9 | chapter 1 is Chapter I, mis-titled |
| DEUXIÈME PARTIE | 10–24 | chapter 10 is Chapter I, mis-titled |
| TROISIÈME PARTIE | 25–35 | chapter 25 is Chapter I, mis-titled |

Chapter 0 is a title page and printed contents listing; labelling it `frontmatter` is tracked separately and is not part of this design.

## Data model

Add a nullable `part` to the chapter, alongside `role`:

```python
@dataclass
class Chapter:
    title: str
    text: str
    role: str | None = None
    part: str | None = None   # display grouping; None = ungrouped
```

**One level, not a path.** The superseded design proposed `group_path: list[str]`. Every book in the catalogue groups exactly one level deep, so a list would be an abstraction with no caller — against the repo's "no speculative abstractions" rule. If a three-level book is ever added, `part` becomes `group_path` in a follow-up migration; nothing in the rendering or the registry depends on it being a scalar beyond the header row itself.

**`chapter_index` remains the canonical key.** Grouping is a display attribute. No index moves, so `annotations`, `translations`, `word_occurrences` and `user_reading_progress` are untouched. This is the same guarantee `role` gives.

**`part` sits outside `content_sha256`**, which covers `index`, `title` and `paragraphs` only. Labelling a book therefore moves no anchor and changes no frozen artifact's identity — no re-stamp, unlike the title change in #2769.

### Schema

```sql
ALTER TABLE book_chapters ADD COLUMN part TEXT;
```

Nullable, no constraint, so the migration policy requires no data-cleanup step.

## Where it is declared

A new `parts` key in `backend/scripts/chapter_split_overrides.py`, resolved **after** `apply_overrides` — the same position `frontmatter_roles` occupies today, so ranges name final indices and no entry has to account for another:

```python
"parts": [
    {"label": "PART I", "from": 2, "to": 8,
     "expect_first_title": "CHAPTER I",
     "why": "Dostoevsky's Part I; numbering resets at chapter 9"},
]
```

`expect_first_title` is verified before labelling. On a mismatch the freeze aborts, exactly as `frontmatter` and `retitle` do — a shifted split labels nothing rather than grouping the wrong chapters.

Ranges rather than per-chapter entries: 38 of Crime and Punishment's 42 chapters carry a part, and enumerating them individually would bury the boundaries that are the actual content of the declaration.

## Interaction with #2769 — a prefix moves

#2769 retitled Hamlet's five act chapters to `ACT I, SCENE I. Elsinore. A platform before the Castle.` and so on. Under a group header that reads twice:

```
▸ ACT I
    ACT I, SCENE I. Elsinore. A platform before the Castle.
```

So this design changes those five declared retitles to drop the `ACT n, ` prefix, and moves the act into the part label:

| | Today (#2769) | With grouping |
|---|---|---|
| part | — | `ACT I` |
| title | `ACT I, SCENE I. Elsinore. A platform before the Castle.` | `SCENE I. Elsinore. A platform before the Castle.` |

The audited work survives intact — the scene's location line, taken verbatim from the chapter text, is what #2769 established and what the leaf keeps. Only the prefix moves. #2769 was the correct fix for the flat panel that exists today; this supersedes half of it.

`title` **is** inside `content_sha256`, so unlike the part label this part of the change re-stamps `book_freeze` and regenerates the artifact, following #2769's pattern including its all-guards-match condition.

Madame Bovary needs the same treatment in the opposite direction: its three part chapters are retitled from `PREMIÈRE PARTIE` to `I`, which is meaningful once the group header carries the part.

## Rendering

`TableOfContents.tsx` already renders one collapsible group — Front matter — with `aria-expanded`, an auto-open when the reader is inside it, and dimmed italic rows. Generalise to an ordered list of groups:

- Front matter stays first, collapsed by default, dimmed. It is apparatus.
- Part groups follow in reading order, **expanded by default**. They are the reading path; collapsing them by default would hide the book.
- Ungrouped chapters (Crime and Punishment's epilogue) render at top level, in order.
- A group auto-opens when the current chapter is inside it, as Front matter does now.
- The filter keeps a group header whose children survive, and hides a header whose children all fail — per #2745's spec.
- Group headers are `aria-expanded` buttons, not headings, matching the existing control.

Row design does not change. #2745 anticipated this: *"Adding grouping later does not redesign the row. A group header is a row inserted between chapter rows."*

Collapse state is per-session UI state, not persisted — consistent with the current Front matter group.

## Migration

Three migrations, in order:

1. `ALTER TABLE book_chapters ADD COLUMN part TEXT` — additive, nullable.
2. Label the four books' parts, each `UPDATE` guarded on `book_id`, an index range, and the boundary chapter's exact title.
3. Retitle, re-stamping `book_freeze.content_sha256` per book and only when every guard for that book matched:
   - Hamlet's five act chapters — drop the `ACT n, ` prefix now carried by the group header.
   - Madame Bovary's three part chapters — `PREMIÈRE PARTIE` → `I`, and so on.
   - A Room with a View's twenty — append the subtitle from the printed contents, and drop the `PART TWO — ` prefix from the thirteen that carry it.

Steps 2 and 3 mirror migrations 052 and 056 respectively. Artifacts are regenerated through `freeze_book.py` in the same PR, never hand-edited. No paragraph is added, removed or reordered anywhere in this design, so no translation realigns.

## Testing

- Registry: a part range labels its chapters and nothing outside it; a boundary title mismatch aborts the freeze; ranges resolve after merges.
- Artifact drift: each of the four committed artifacts carries exactly the parts the registry declares — the guard that caught the U+2019 apostrophe in #2769.
- Migration: labels the declared ranges; leaves undeclared books NULL; labels nothing on a boundary mismatch; does not re-stamp a hash on a partial match; idempotent.
- Panel: renders N groups in order; front matter collapsed and parts expanded; auto-opens the group containing the current chapter; filter retains headers with surviving children and drops empty ones; a book with no parts renders exactly as today.
- Paragraph conservation: for each of the four books, every chapter's paragraph list is byte-identical before and after. This is the test that would have caught moving A Room with a View's subtitle out of the body, which would have left chapter 19's 57-paragraph zh translation against 56 English paragraphs.
- Regression: Crime and Punishment's six `CHAPTER I` rows are distinguishable by their group; Madame Bovary's Chapter I is reachable by name in all three parts; A Room with a View's twenty rows carry their subtitles.

## Rollback

The column is additive and nullable. `UPDATE book_chapters SET part = NULL` restores the flat panel with no other effect — grouping is purely presentational, and the panel already handles the no-groups case because sixteen books will always be in it. The retitles in step 3 roll back like #2769's, by restoring titles and the prior hash together.

## Risks

- **A part label disagreeing with the split.** Mitigated by the `expect_first_title` guard and the artifact drift test; the failure mode is "no grouping", never "wrong grouping".
- **Scope creep into inference.** The registry is the only place a boundary can be stated. There is no code path that derives one.
- **Churn on #2769.** Real but bounded, and stated above rather than discovered later.

## Decisions

Settled with the repo owner, 2026-08-30:

1. **Crime and Punishment's epilogue renders ungrouped at top level.** It belongs to no part, and inventing a one-chapter group to hold it would assert a structure the work does not have.
2. **Part labels are shown verbatim from the source.** Madame Bovary's headers read `PREMIÈRE PARTIE`, Hamlet's read `ACT I`, A Room with a View's read `PART ONE`. The panel shows the work's own words rather than normalising to English — the same principle that keeps `MOBY-DICK; or, THE WHALE.` rather than a tidied form.
3. **A Room with a View's chapter subtitles are in scope**, restored title-only for the alignment reason given above.

No open questions remain.
