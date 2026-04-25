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

- [x] **UX-001**: Reader header button overflow on mid-size screens *(fixed Wave 7.2: icon-only on md, icon+text on lg)*
- [x] **UX-002**: Chapter select dropdown — `appearance-none` + ChevronDown overlay + SVG prev/next *(fixed Wave 8.2)*
- [x] **UX-003**: Long-press annotation on mobile conflicts with native text selection — fixed: `e.preventDefault()` on `pointerType === "touch"` in `handlePointerDown` and `handleSegLongPress`
- [x] **UX-004**: Mobile tab bar with 5 tabs clips on 375px screens *(fixed Wave 7.4: `overflow-x-auto scrollbar-none`)*
- [x] **UX-005**: Translation sidebar panels open/close without animation *(fixed Wave 7.3: `transition-[width] duration-200`)*
- [x] **UX-006**: No keyboard shortcut shown anywhere *(fixed Wave 8.1: `?` button opens shortcuts panel in reader)*
- [x] **UX-007**: "Remove from library" × button is 24px — below 44px touch target minimum on mobile *(fixed Wave 7.1)*
- [x] **UX-008**: Reading stats buried in Profile page — move to Home tab as personal dashboard *(fixed PR #290)*
- [x] **UX-009**: `WordActionDrawer` action buttons use emoji (`🔊 💾 📝`) — should be SVG icons *(fixed Wave 8.2)*
- [x] **UX-010**: `SentenceActionPopup` action buttons use emoji (`🔊 📝 💬`) — inconsistent with icon system *(fixed Wave 8.3)*
- [x] **UX-011**: `ChapterSummary` uses `📋` emoji in header and empty state — replace with `SummaryIcon` SVG *(fixed Wave 8.4)*
- [x] **UX-012**: `InsightChat` context snippet uses `📎` emoji — replace with `PaperclipIcon` SVG *(fixed Wave 8.5)*
- [x] **UX-013**: Profile page gender selector shows `♀ Female / ♂ Male` — text-only labels *(fixed Wave 8.6)*
- [x] **UX-014**: Import page status cells use `✓` / `…` / `!` — SVG icons via CheckCircle/Retry/AlertCircle/CircleDot *(fixed Wave 8.7)*
- [x] **UX-015**: Vocabulary page back button uses `←` — replaced with `ArrowLeftIcon` SVG *(fixed Wave 8.8)*

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

## Wave 8 — Round 3 Emoji Removal + UX Polish

| # | Change | Impact | File(s) | Status |
|---|--------|--------|---------|--------|
| 8.1 | UX-006: Keyboard shortcuts panel (`?` button in reader header) + FocusIcon SVG (replaces 🎯) | Medium | reader/[bookId]/page.tsx, Icons.tsx | ✅ Done |
| 8.2 | UX-002: Chapter select styled with `appearance-none` + ChevronDown overlay + SVG prev/next buttons | Medium | reader/[bookId]/page.tsx, Icons.tsx | ✅ Done |
| 8.3 | Wave 5.3: Notes count badges — pill style (amber bg, border, rounded-full) | Low | notes/[bookId]/page.tsx | ✅ Done |
| 8.4 | UX-009: WordActionDrawer: SVG icons (SpeakerIcon, SaveIcon, NoteIcon, CheckCircleIcon) | High | WordActionDrawer.tsx, Icons.tsx | ✅ Done |
| 8.5 | UX-010: SentenceActionPopup: SVG icons (SpeakerIcon, NoteIcon, ChatIcon) | High | SentenceActionPopup.tsx | ✅ Done |
| 8.6 | UX-011: ChapterSummary: SummaryIcon replaces 📋 in header and empty state | Medium | ChapterSummary.tsx | ✅ Done |
| 8.7 | UX-012: InsightChat: PaperclipIcon replaces 📎 context snippet decorator | Low | InsightChat.tsx, Icons.tsx | ✅ Done |

## Wave 9 — Accessibility Sweep (2026-04-23 → 2026-04-25)

Systematic WCAG 2.1 AA pass covering loading states, dialog semantics, focus management, error announcements, and live regions. Every change ships with a static assertion test.

### WCAG 4.1.3 Status Messages — loading states
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-23 | role=status on AnnotationsSidebar loading spinners | AnnotationsSidebar.tsx | #1069 |
| 2026-04-23 | role=status on 6 page-level skeleton/spinner loaders (admin users, vocabulary/flashcards, upload chapters, notes/[bookId], ReadingStats, vocabulary) | multiple | #1076 |
| 2026-04-23 | role=status on reader chapter skeleton and QueueTab initial skeleton | reader/[bookId]/page.tsx, QueueTab.tsx | #1079 |
| 2026-04-23 | role=status on InsightChat/SentenceReader/ChapterSummary skeletons | InsightChat.tsx, SentenceReader.tsx, ChapterSummary.tsx | #1071 |
| 2026-04-25 | role=status on WordActionDrawer loading ("Looking up word") | WordActionDrawer.tsx | #1099 |
| 2026-04-25 | role=status on TranslationView skeleton (parallel + inline modes) | TranslationView.tsx | #1110 |

### WCAG 4.1.2 Name, Role, Value — dialogs, toolbars, state
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-25 | role=dialog + aria-modal on vocabulary DefinitionSheet + aria-hidden backdrops | vocabulary/page.tsx, AuthPromptModal.tsx | #1088 |
| 2026-04-25 | role=toolbar + aria-label on QuickHighlightPanel popover | QuickHighlightPanel.tsx | #1104 |
| 2026-04-25 | role=dialog + aria-labelledby + focus management on AnnotationsSidebar drawer | AnnotationsSidebar.tsx | #1107 |
| 2026-04-25 | aria-pressed + role=group on TypographyPanel SegmentedControl | TypographyPanel.tsx | #1117 |
| 2026-04-25 | aria-current=page on active home tab button | app/page.tsx | #1122 |
| 2026-04-25 | role=log + aria-live=polite on InsightChat message container | InsightChat.tsx | #1126 |

### WCAG 2.4.3 Focus Order — modal focus management
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-25 | Focus moves to dialog on open, restored on close — BookDetailModal + AuthPromptModal | BookDetailModal.tsx, AuthPromptModal.tsx | #1097 |
| 2026-04-25 | Same pattern — WordActionDrawer + DefinitionSheet | WordActionDrawer.tsx, vocabulary/page.tsx | #1099 |
| 2026-04-25 | Same pattern — AnnotationsSidebar drawer | AnnotationsSidebar.tsx | #1107 |

### WCAG 1.3.1 Info and Relationships — label associations
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-25 | AnnotationToolbar Note `<p>` replaced with `<label htmlFor>` on textarea | AnnotationToolbar.tsx | #1101 |

### WCAG 4.1.3 Status Messages — error announcements
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-25 | role=alert on error blocks across notes, vocabulary, ChapterSummary, AnnotationToolbar | multiple | #1113 |

### Pattern shifts (non-WCAG-only but UX-visible)
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-25 | Native `confirm()` → optimistic delete + UndoToast in notes/library pages | notes/[bookId]/page.tsx, app/page.tsx | #1084 |
| 2026-04-25 | Desktop touch-target scoping: `md:min-h-0` on reader header buttons (44px becomes mobile-only) | reader/[bookId]/page.tsx, CLAUDE.md | #1081 |
| 2026-04-25 | Browse-books CTA on vocabulary + notes empty states | vocabulary/page.tsx, notes/page.tsx | #1093 |
