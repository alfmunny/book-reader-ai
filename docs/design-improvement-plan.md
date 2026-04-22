# UI/UX Design Improvement Plan
**Date:** 2026-04-22  
**Role:** Graphic Designer / UX Reviewer  
**Session duration:** 4 hours

---

## Research Summary

Book Reader AI uses a warm parchment/amber palette (`#f5f0e8` background, `#2c2416` ink) with Georgia serif for reading. The aesthetic is literary and intentional — good foundation. Three themes exist (light, sepia, dark).

---

## Weaknesses & Flaws Found

### Critical (affects usability)
1. **Emoji as UI icons** — All interactive buttons use emoji (💬 📝 🔊 🎨 📚 🌐 🔖 ✕). Emoji render inconsistently across OS/browser, look pixelated at small sizes, and fail accessibility checks. Found in: SelectionToolbar, reader header, mobile bottom bar, BookDetailModal.
2. **Reader header overflow** — At 768–1200px screens, 8+ buttons in a single row will squeeze or overflow. No grouping or overflow handling.
3. **No semantic design tokens** — All colors are hardcoded Tailwind classes (amber-700, stone-400). The dark-mode overrides in globals.css grow as a long list of selector hacks instead of CSS variables.
4. **Mobile tab bar scrolling** — With 4-5 tabs, small phones (375px) will clip the tab bar. No horizontal scroll or overflow handling.

### Major (affects quality)
5. **Font size button** — Shows `A` with tiny `+/++/-` superscripts. Barely legible, no affordance for current state.
6. **Theme toggle button** — Emoji-only cycle (☀ 📖 🌙). No text label, no current-state indication other than the emoji itself.
7. **BookCard cover placeholder** — The `📖` emoji placeholder is crude and cross-platform inconsistent.
8. **Progress bar** — `h-0.5` (2px) is nearly invisible. A reading progress indicator deserves more prominence.
9. **SelectionToolbar** — Dark stone popup with emoji buttons creates jarring style break from the warm parchment theme.
10. **Empty library state** — Minimal treatment, no illustration or warmth.
11. **Login page** — No app icon shown in the hero area (text-only branding).

### Minor (polish)
12. **List view book rows** — Tiny `w-8 h-12` cover thumbnail barely shows cover art detail.
13. **Spacing inconsistency** — Mix of `py-2`, `py-2.5`, `py-3` without clear system.
14. **BookDetailModal close button** — `✕` text character vs SVG.
15. **Select elements** — Plain HTML `<select>` for chapter navigation looks inconsistent with the polished card-based design.
16. **Typography hierarchy** — `text-sm`, `text-xs`, `text-lg` scattered without a clear type scale.

---

## Change Plan (Progressive)

### Wave 1 — Quick Wins (no test changes needed)
| # | Change | Impact | File(s) |
|---|--------|--------|---------|
| 1.1 | Replace emoji in SelectionToolbar with SVG icons | High | SelectionToolbar.tsx |
| 1.2 | Better book cover placeholder (styled SVG) | Medium | BookCard.tsx, BookDetailModal.tsx |
| 1.3 | Thicker reading progress bar (h-1) + rounded | Low | reader/[bookId]/page.tsx |
| 1.4 | Login page — add app icon to hero | Low | login/page.tsx |
| 1.5 | Font size button — show label text (S/M/L/XL) | Medium | reader/[bookId]/page.tsx |
| 1.6 | Theme button — show label (Light/Sepia/Dark) | Low | reader/[bookId]/page.tsx |

### Wave 2 — Component Improvements
| # | Change | Impact | File(s) |
|---|--------|--------|---------|
| 2.1 | Mobile bottom bar — SVG icons instead of emoji | High | reader/[bookId]/page.tsx |
| 2.2 | Reader header — group buttons, add visual separator | High | reader/[bookId]/page.tsx |
| 2.3 | Empty library state — better visual treatment | Medium | page.tsx |
| 2.4 | Tab bar — make scrollable on mobile | Medium | page.tsx |
| 2.5 | BookDetailModal — SVG close button, better spacing | Low | BookDetailModal.tsx |

### Wave 3 — Systemic Improvements
| # | Change | Impact | File(s) |
|---|--------|--------|---------|
| 3.1 | CSS custom properties for color tokens | High | globals.css, tailwind.config.ts |
| 3.2 | Dark mode via CSS variables (not selector hacks) | High | globals.css |
| 3.3 | Consistent icon component library (SVG) | High | new: components/icons.tsx |
| 3.4 | Typography scale documentation | Medium | globals.css |

---

## Research Round 2 — Findings (2026-04-22)

Second pass covered: vocabulary page, notes page, profile page, import page, AnnotationToolbar, TTSControls, InsightChat, VocabWordTooltip, VocabularyToast.

### New Weaknesses Found

| Severity | Issue | Location |
|----------|-------|----------|
| 🔴 High | `⏸ Pause` / `▶ Read` / `↻ Retry` text symbols in TTS bar | TTSControls.tsx |
| 🔴 High | `📝 💬 📚` emoji as semantic badges in Notes page | notes/page.tsx |
| 🔴 High | `💾` emoji in VocabularyToast (save confirmation) | VocabularyToast.tsx |
| 🔴 High | `📒` emoji in Notes empty state | notes/page.tsx |
| 🟡 Major | `✕` character for close in AnnotationToolbar (not SVG) | AnnotationToolbar.tsx |
| 🟡 Major | VocabularyToast has no `aria-live` — screen readers miss it | VocabularyToast.tsx |
| 🟡 Major | InsightChat font-size toggle (A/a) has no visible active state | InsightChat.tsx |
| 🟡 Major | `♀ F` / `♂ M` gender toggle in TTS — symbols render oddly | TTSControls.tsx |
| 🟡 Major | Profile page Obsidian section too long, no accordion/tabs | profile/page.tsx |
| 🟡 Major | Import page cost panel: visual hierarchy unclear, mixed colors | import/[bookId]/page.tsx |
| 🟠 Minor | Vocabulary page empty state uses `📖` emoji | vocabulary/page.tsx |
| 🟠 Minor | Notes page "← Library" back button is text-only (inconsistent) | notes/page.tsx |
| 🟠 Minor | VocabWordTooltip `×` close is a text character | VocabWordTooltip.tsx |
| 🟠 Minor | Notes metadata badges (`📝 3 annotations`) styling is flat | notes/page.tsx |

### Wave 4 — Remaining Emoji Removal (this session)
| # | Change | Impact | File(s) |
|---|--------|--------|---------|
| 4.1 | TTSControls: SVG icons for Play/Pause/Cancel, text labels for gender | High | TTSControls.tsx |
| 4.2 | VocabularyToast: SVG check icon + `aria-live` region | High | VocabularyToast.tsx |
| 4.3 | Notes page: SVG icons for annotation/insight/vocab badges | High | notes/page.tsx |
| 4.4 | Notes empty state: SVG illustration instead of 📒 emoji | Medium | notes/page.tsx |
| 4.5 | AnnotationToolbar: SVG close button | Low | AnnotationToolbar.tsx |
| 4.6 | VocabWordTooltip: SVG close button | Low | VocabWordTooltip.tsx |
| 4.7 | Add SaveIcon + new icons needed by Wave 4 to Icons.tsx | Low | Icons.tsx |

### Wave 5 — Polish & Accessibility
| # | Change | Impact | File(s) |
|---|--------|--------|---------|
| 5.1 | InsightChat: highlight active font-size toggle state | Medium | InsightChat.tsx |
| 5.2 | Profile page: collapse Obsidian section under accordion | Medium | profile/page.tsx |
| 5.3 | Notes metadata badges: pill-style with colored dot instead of emoji | Low | notes/page.tsx |
| 5.4 | Import page: unify cost panel color hierarchy (remove emerald, use amber only) | Low | import/[bookId]/page.tsx |
| 5.5 | Notes back button: consistent with reader (SVG arrow + "Library" text) | Low | notes/page.tsx |

### Wave 6 — Page-level Improvements
| # | Change | Impact | File(s) |
|---|--------|--------|---------|
| 6.1 | Vocabulary page: SVG empty state illustration | Medium | vocabulary/page.tsx |
| 6.2 | Notes page: stat summary row with icon+count pills in header | Low | notes/page.tsx |
| 6.3 | Profile page: section header dividers for better visual grouping | Low | profile/page.tsx |

---

## UX Issues (Opened for Later)

- [ ] **UX-001**: Reader header button overflow on mid-size screens — needs a "More" overflow menu or collapsible toolbar
- [ ] **UX-002**: Chapter select dropdown is native HTML `<select>` — consider custom dropdown or at minimum better styling
- [ ] **UX-003**: Long-press annotation on mobile conflicts with native text selection — needs review
- [ ] **UX-004**: Mobile tab bar with 5 tabs (Library, Discover, Notes, Word List, Admin) clips on 375px screens
- [ ] **UX-005**: Translation sidebar panels open/close without animation on desktop — could use smooth slide transition
- [ ] **UX-006**: No keyboard shortcut shown anywhere — discoverable features hidden
- [ ] **UX-007**: "Remove from library" × button is 24px — below 44px touch target minimum on mobile

---

## Change Log

| Date | Wave | Change | Status |
|------|------|--------|--------|
| 2026-04-22 | 1.1 | SVG icons in SelectionToolbar | ✅ Done |
| 2026-04-22 | 1.2 | Book cover SVG placeholder | ✅ Done |
| 2026-04-22 | 1.3 | Progress bar thicker + rounded | ✅ Done |
| 2026-04-22 | 1.4 | Login page app icon in hero | ✅ Done |
| 2026-04-22 | 1.5 | Font size button labels (S/M/L/XL) | ✅ Done |
| 2026-04-22 | 1.6 | Theme button with label | ✅ Done |
| 2026-04-22 | 2.1 | Mobile bottom bar SVG icons | ✅ Done |
| 2026-04-22 | 2.2 | Reader header button grouping | ✅ Done |
| 2026-04-22 | 2.3 | Empty library state visual | ✅ Done |
| 2026-04-22 | 2.4 | Tab bar scrollable on mobile | ✅ Done |
| 2026-04-22 | 2.5 | BookDetailModal SVG close + spacing | ✅ Done |
| 2026-04-22 | 3.1 | CSS custom properties for color tokens | ✅ Done |
| 2026-04-22 | 3.3 | Shared SVG icons component | ✅ Done |
| 2026-04-22 | 4.1 | TTSControls: SVG icons, text gender labels | ✅ Done |
| 2026-04-22 | 4.2 | VocabularyToast: SVG check icon + aria-live | ✅ Done |
| 2026-04-22 | 4.3 | Notes page: SVG badge icons (ann/insight/vocab) | ✅ Done |
| 2026-04-22 | 4.4 | Notes empty state: EmptyNotesIcon SVG | ✅ Done |
| 2026-04-22 | 4.5 | AnnotationToolbar: SVG close button | ✅ Done |
| 2026-04-22 | 4.6 | VocabWordTooltip: SVG close + Saved icon | ✅ Done |
| 2026-04-22 | 5.1 | InsightChat: amber highlight on active font size | ✅ Done |
| 2026-04-22 | 5.2 | Profile: Obsidian section accordion | ✅ Done |
| 2026-04-22 | 5.4 | Import: cost panel card hierarchy | ✅ Done |
| 2026-04-22 | 5.5 | Notes back buttons: ArrowLeftIcon SVG | ✅ Done |
| 2026-04-22 | 6.1 | Vocabulary: EmptyVocabIcon SVG empty state | ✅ Done |
| 2026-04-22 | 6.2 | Notes header: icon+count stat pills | ✅ Done |
| 2026-04-22 | 6.3 | Profile: section category labels | ✅ Done |

---

## Wave 7 Plan — UX Issue Fixes (Next Session)

These are structural changes requiring more careful implementation and testing:

| # | Issue | Effort | Approach | Status |
|---|-------|--------|---------|--------|
| 7.1 | UX-007: "Remove from library" × button below 44px touch target | Low | Increase to 32×32px w/ CloseIcon SVG + flex centering | ✅ Done |
| 7.2 | UX-001: Reader header button overflow on mid-size screens | High | Icon-only on md (768–1024px), icon+text on lg (1024px+), Marks moved to lg+ | ✅ Done |
| 7.3 | UX-005: No slide animation on translation sidebar | Medium | Added `transition-[width] duration-200` to desktop sidebar container | ✅ Done |
| 7.4 | UX-004: Mobile tab bar 5-tab clip at 375px | Medium | `overflow-x-auto scrollbar-none` — implemented in Wave 2.4 | ✅ Done |
| 7.5 | UX-006: Keyboard shortcut discoverability | Low | Add `?` shortcut panel or tooltip hints on hover | ⏳ Open |
