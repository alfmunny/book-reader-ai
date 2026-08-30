# Reading modes — scroll or page

**Status:** Draft
**Author:** Dev
**Date:** 2026-08-30
**Priority:** P2
**Prior work:** #2756 (arrow-key binding decision, which this settles), #2745 (Contents panel — the reader chrome this sits beside), design review artifact reviewed with the owner 2026-08-30

## Problem

The reader offers one way to read: a continuous vertical scroll. Every e-reader
people have used — Kindle, Apple Books, WeRead — offers a paginated mode too, and
some readers strongly prefer it: a page is a fixed unit, so you always know where
you are in it, and there is no drift between "where I stopped" and "where the
scrollbar is".

The toggle itself is trivial. What makes this a design question is that **five
existing reader features assume a vertical scroll container**, and each needs a
decision rather than a patch.

## Solution

A `readerMode: "scroll" | "page"` preference, toggled from the reader toolbar and
persisted per profile alongside `fontSize`, `contentWidth` and `theme`.

### Mechanism: CSS multi-column

Content flows into full-height columns; turning a page translates the flow
sideways by one column width plus the gutter. **One DOM, one render, no remount.**

The alternative — measuring paragraphs in JavaScript and rendering one page-sized
batch at a time — is rejected. It remounts the DOM on every turn, which:

- destroys TTS segment identity (`data-seg` spans are the audio-follow anchors),
- closes or orphans any open note dialog and selection toolbar,
- turns every annotation lookup into "which page holds paragraph N",
- forces re-measurement on every font-size, line-height and width change.

The column layout gives all of that for free, because the elements never move in
the DOM — only the containing flow's transform changes. Its one real cost is that
a paragraph can split across a page boundary, which is what printed books do.

### The five collisions

| # | Feature | Where | Resolution |
|---|---|---|---|
| 1 | Progress from scroll offset | `page.tsx:788` — `scrollTop / (scrollHeight − clientHeight)` | Page *n* of *m* while paginated; the scroll listener does not fire in a column layout |
| 2 | TTS follows the spoken sentence | `page.tsx:1072, 1083, 1135` — `scrollIntoView({ block: "nearest" })` | Turn to the page whose column contains the segment, derived from its offset in the flow |
| 3 | Arrow keys = previous/next chapter | `page.tsx:1022, 1027, 1138` | Arrows turn **pages**; chapters move to `[` and `]` |
| 4 | Parallel translation is already two columns | `page.tsx:442` — `displayMode: "parallel" \| "inline"` | Page mode **forces inline**; the parallel toggle is disabled with a short explanation |
| 5 | Overlays positioned by viewport rect | `SelectionToolbar`, `StoryPanel` — `getBoundingClientRect` | Close on page turn; re-anchoring costs more than the interaction is worth |

### Decisions (owner, 2026-08-30)

1. **Arrows turn pages.** Chapter navigation moves to `[` / `]`. Turning a page is
   the far more frequent act, and a paginated reader that ignores arrows feels
   broken. This also settles the binding question #2756 raised for the Contents
   panel — one answer for the whole reader rather than two.
2. **Parallel translation is forced inline while paginated.** Paired pages would
   need original and translation to paginate in lockstep, which they will not do at
   different lengths. The toggle is disabled, not hidden, so the reason is visible.
3. **Every chapter begins on a fresh page.** A chapter heading stranded mid-column
   reads as a bug, and navigation is already chapter-at-a-time.
4. **Mobile gestures land in slice 3.** Swipe *and* tap zones, after tap zones have
   been tested against the long-press that opens the selection toolbar. Until then
   mobile stays on scroll mode.

## Schema changes

None. Books are frozen artifacts and pagination is purely a render-time concern.

## API changes

None. No endpoint is added, changed, or called differently.

Annotations, notes and shares keep anchoring to paragraph indices, which
pagination never renumbers — the anchor model is untouched.

## Slices

Each is a PR that stands alone and leaves the reader working.

1. **Mechanism and toggle** — column pagination, turn controls, `readerMode`
   persisted in `AppSettings`. Inline translation only, desktop only; parallel mode
   and mobile keep scroll.
2. **Progress and audio follow** — page *n* of *m* replacing the percentage while
   paginated, and TTS turning pages instead of scrolling. Collisions 1 and 2.
3. **Mobile gestures and parallel** — swipe and tap zones tested against long-press
   selection; the forced-inline behaviour and its explanation. Collision 4.

## Testing

- **Mechanism:** page count for a known flow at a fixed height; the count changes
  when font size changes; the last page is reachable and `next` disables on it.
- **Anchor survival** (the mechanism's whole justification): a paragraph carrying a
  note keeps its marker and its `data-seg` spans across a mode switch — the DOM
  node is identical, not merely equivalent.
- **Collision 1:** progress reads page *n* of *m* in page mode and a percentage in
  scroll mode; switching modes does not corrupt either.
- **Collision 3:** ArrowRight turns a page in page mode and changes chapter in
  scroll mode; `]` changes chapter in both.
- **Collision 4:** enabling parallel translation while paginated disables the
  parallel control and renders inline.
- **Collision 5:** an open note dialog closes when a page turns.
- **Persistence:** `readerMode` survives a reload, like every other reader setting.

## Risks and rollback

- **Column height must be explicit.** The reader's chrome (toolbars, mobile bottom
  bar) changes the available height, so the flow height is computed, not constant.
  Getting it wrong shows as a clipped last line — visible immediately, and the
  first thing to check if pagination looks wrong.
- **Fragmentation is the browser's call.** Where a paragraph breaks across pages is
  not something we control precisely. This is correct e-reader behaviour, but it
  means "the break looks bad here" is not always fixable.
- **Rollback is a settings default.** Page mode is opt-in and lives entirely behind
  `readerMode`. Reverting the toggle's default returns every reader to today's
  behaviour without touching data — there is none to touch.

## Open questions

None blocking. The four decisions above were settled with the owner before this
doc was written; the artifact review that produced them is linked in Prior work.
