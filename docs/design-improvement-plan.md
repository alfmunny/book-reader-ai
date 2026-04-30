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
| 2026-04-28 | 8.1 | Admin error pages: AlertCircleIcon + Retry button (audio, users) | ✅ Done |
| 2026-04-28 | 8.2 | Admin inline error banners: AlertCircleIcon + Retry (books, uploads) | ✅ Done |
| 2026-04-28 | 8.3 | Upload, search, home page error banners: AlertCircleIcon added | ✅ Done |
| 2026-04-28 | 8.4 | Import and chapter-editor error banners: AlertCircleIcon added | ✅ Done |
| 2026-04-28 | 8.5 | Admin tables: title attributes on truncated book/user/file text | ✅ Done |
| 2026-04-28 | 8.6 | Admin dismiss error/message buttons: 44×44px mobile touch targets | ✅ Done |
| 2026-04-28 | 8.7 | Admin/QueueTab confirm dialogs: role="alertdialog" + aria-modal (PR #2000) | ✅ Done |
| 2026-04-28 | 8.8 | Admin/QueueTab confirm dialogs: focus on container open, restore on close (PR #2002) | ✅ Done |
| 2026-04-29 | 9.1 | Homepage: `<ul role="list">` on book grids (library + search results) for WCAG 1.3.1 (PR #2042) | ✅ Done |
| 2026-04-29 | 9.2 | ARIA live region + descriptive labels on Popular Classics pagination (PR #2040) | ✅ Done |
| 2026-04-29 | 9.3 | Notes/decks index pages: `<ul role="list">` on book and deck lists (PR #2044) | ✅ Done |
| 2026-04-29 | 9.4 | Search results: `<ul role="list">` in ResultsSection (PR #2046) | ✅ Done |
| 2026-04-29 | 9.5 | Vocabulary word groups: `<ul role="list">` wrapping sectionGroups map (PR #2048) | ✅ Done |
| 2026-04-29 | 9.6 | Homepage tablist: roving tabIndex + ArrowLeft/Right keyboard nav (PR #2050) | ✅ Done |
| 2026-04-29 | 9.7 | Notes/[bookId]: `<ul role="list">` on annotation and insight lists — all 6 map sites (PR #2052) | ✅ Done |
| 2026-04-29 | 9.8 | Reader sidebar: `<ul role="list">` on annotation panels + vocab panel + bottom notes expand (PR #2054) | ✅ Done |
| 2026-04-29 | 10.1 | Admin books: aria-label on queue-status symbol span + aria-hidden on inner symbol (PR #2094, closes #2093) | ✅ Done |
| 2026-04-29 | 10.2 | Search page: `<p>` → `<h2>` + Browse books CTA in initial empty state (PR #2096, closes #2095) | ✅ Done |
| 2026-04-29 | 10.3 | Docs: vocabulary word-saving tutorial added (PR #2098, closes #2097) | ✅ Done |
| 2026-04-29 | 10.4 | Pending approval page: 30s polling via getMe() + auto-redirect on approved=true (PR #2100, closes #2099) | ✅ Done |
| 2026-04-29 | 10.5 | Home/library page: added `document.title` in useEffect for WCAG 2.4.2 compliance (PR #2104, closes #2103) | ✅ Done |
| 2026-04-29 | 10.6 | Flashcards: 1/2/3/4 keyboard shortcuts for grading + Space/Enter to flip; key hints shown on grade buttons (PR #2114, closes #2113) | ✅ Done |
| 2026-04-29 | 10.7 | Import page: `document.title` updates to book name once SSE meta event fires, WCAG 2.4.2 (PR #2116, closes #2115) | ✅ Done |
| 2026-04-29 | 10.8 | Docs: decks tutorial added covering manual/smart modes and flashcard filtering (PR #2118, closes #2117) | ✅ Done |
| 2026-04-29 | 10.9 | Docs: in-app search tutorial added covering annotations, vocabulary, and chapter search (PR #2120, closes #2119) | ✅ Done |
| 2026-04-29 | 10.10 | Login page: `document.title` set to "Sign In — Book Reader AI", WCAG 2.4.2 (PR #2122, closes #2121) | ✅ Done |
| 2026-04-29 | 11.1 | WCAG 2.4.7 focus-visible ring sweep: reader toolbar + page components (PRs #2186, #2184, #2182) | ✅ Done |
| 2026-04-29 | 11.2 | WCAG 2.4.7: vocab, notes, flashcard page buttons (PR #2192, closes #2191) | ✅ Done |
| 2026-04-29 | 11.3 | WCAG 2.4.7: all 20 homepage buttons (PR #2194, closes #2193) | ✅ Done |
| 2026-04-29 | 11.4 | WCAG 2.4.7: AnnotationsSidebar + InsightChat buttons (PR #2197, closes #2196) | ✅ Done |
| 2026-04-29 | 11.5 | WCAG 2.4.7: BookCard remove + VocabWordTooltip save + upload chapter remove (PR #2199, closes #2198) | ✅ Done |
| 2026-04-29 | 11.6 | WCAG 2.4.7: 6 inline anchor links (reader sign-in × 3, vocab export URL, InsightChat Gemini links × 2) — closes #2200 | ✅ Done |
| 2026-04-29 | 11.7 | WCAG 2.4.7: 16 remaining anchor links across reader, notes, profile, import, vocabulary, VocabWordTooltip, AnnotationsSidebar, BookDetailModal — closes #2202 (PR #2203) | ✅ Done |
| 2026-04-29 | 11.8 | WCAG 2.4.7: AuthPromptModal sign-in link + notes InsightCard chapter reader link — closes #2204 (PR #2205) | ✅ Done |
| 2026-04-29 | 11.9 | useFocusTrap branch coverage 76.5% → 94.1%: empty-dialog, container-focus, inert filtering, shift-middle — closes #2206 (PR #2207) | ✅ Done |
| 2026-04-29 | 11.10 | SearchBar mobile overflow fix: replace inline-flex + min-w-[14rem] with flex flex-1 + flex-1 min-w-0 — closes #2208 (PR #2209) | ✅ Done |
| 2026-04-29 | 11.11 | Body scroll lock hook (useScrollLock) applied to BookDetailModal, AnnotationsSidebar, WordActionDrawer, AuthPromptModal — closes #2210 (PR #2211) | ✅ Done |
| 2026-04-29 | 11.12 | Add hover title tooltip to truncated book title/author in BookCard, Continue Reading banner, Popular Classics list — closes #2212 (PR #2213) | ✅ Done |
| 2026-04-29 | 11.13 | Add loading="lazy" to 7 remote img elements (book covers, user avatars) across 5 files — closes #2214 (PR #2215) | ✅ Done |
| 2026-04-29 | 11.14 | AnnotationToolbar missing useScrollLock — body scroll locked while note editor open — closes #2216 (PR #2217) | ✅ Done |
| 2026-04-29 | 11.15 | focus-visible ring to not-found and error page CTA links — closes #2218 (PR #2219) | ✅ Done |
| 2026-04-29 | 11.16 | focus-visible ring to &lt;summary&gt; disclosures in QueueTab and SeedPopularButton — closes #2220 (PR #2221) | ✅ Done |
| 2026-04-29 | 11.17 | dark-mode WCAG AA contrast for text-stone-600/700/500 — closes #2223 (PR #2224) | ✅ Done |
| 2026-04-29 | 11.18 | focus-visible ring on search empty-state CTA Links (both no-query and no-results states) — closes #2225 (PR #2226) | ✅ Done |
| 2026-04-29 | 11.19 | fix admin Retry button touch target: min-h-[36px] → min-h-[44px] md:min-h-0 in uploads and books admin pages — closes #2227 (PR #2228) | ✅ Done |
| 2026-04-29 | 11.20 | focus-visible ring on reader Gemini reminder banner "Add your free Gemini API key" button — closes #2229 (PR #2230) | ✅ Done |
| 2026-04-29 | 11.21 | upload dropzone role=button missing aria-disabled when quota full or uploading — closes #2231 (PR #2232) | ✅ Done |
| 2026-04-29 | 11.22 | select elements missing amber focus ring across admin/books, home, reader, QueueTab — closes #2233 (PR #2234) | ✅ Done |
| 2026-04-29 | 11.23 | title tooltips for truncated deck name (DeckCard h2, deck-detail h1) and book title (notes list) — closes #2235 (PR #2236) | ✅ Done |
| 2026-04-29 | 11.24 | title tooltips for reader header truncated book title h1 and authors p — closes #2237 (PR #2238) | ✅ Done |
| 2026-04-29 | 11.25 | title tooltips for profile deck names, SeedPopularButton current title, QueueTab retry/error — closes #2239 (PR #2240) | ✅ Done |
| 2026-04-29 | 11.26 | target=_blank links missing sr-only "(opens in new tab)" announcement for screen readers — closes #2241 (PR #2242) | ✅ Done |
| 2026-04-29 | 11.27 | vocabulary filter sr-only live region conditionally rendered — WCAG 4.1.3 fix: always render container — closes #2243 (PR #2244) | ✅ Done |
| 2026-04-29 | 11.28 | vocabulary word list missing lang attribute on foreign words — WCAG 3.1.2 fix: add lang to lemma button and sentence spans — closes #2245 (PR #2246) | ✅ Done |
| 2026-04-29 | 11.29 | reader vocab sidebar missing lang attribute on foreign words — WCAG 3.1.2 fix: add lang to lemma/form/sentence spans — closes #2247 (PR #2248) | ✅ Done |
| 2026-04-29 | 11.30 | reader scroll container missing lang attribute for non-English books — WCAG 3.1.2 fix: add lang={bookLanguage} to reader-scroll div — closes #2249 (PR #2250) | ✅ Done |
| 2026-04-29 | 11.31 | notes page missing lang attribute on annotation and vocab occurrence sentences — WCAG 3.1.2 fix — closes #2251 (PR #2252) | ✅ Done |
| 2026-04-29 | 11.32 | decks word list and picker missing lang attribute on foreign vocabulary words — WCAG 3.1.2 fix — closes #2255 (PR #2256) | ✅ Done |
| 2026-04-29 | 11.33 | VocabWordTooltip and WordActionDrawer missing lang attribute on displayed word — WCAG 3.1.2 fix — closes #2257 (PR #2259) | ✅ Done |
| 2026-04-29 | 11.34 | flashcard review page missing lang attribute + backend language field in due API — WCAG 3.1.2 fix — closes #2258 (PR #2260) | ✅ Done |
| 2026-04-29 | 11.35 | DefinitionSheet missing lang attribute on word and lemma spans — WCAG 3.1.2 fix — closes #2261 (PR #2262) | ✅ Done |
| 2026-04-29 | 11.36 | Search result snippets (AnnotationCard + VocabularyCard) missing lang on foreign text — backend book_language field + lang wrappers — WCAG 3.1.2 fix — closes #2265 (PR #2266) | ✅ Done |
| 2026-04-29 | 11.37 | Notes InsightCard context blockquote missing lang attribute — added bookLanguage prop to InsightCard + lang on blockquote — WCAG 3.1.2 fix — closes #2267 (PR #2268) | ✅ Done |
| 2026-04-29 | 11.38 | ChapterCard search snippet missing lang attribute — backend book_language + span lang wrapper in ChapterCard — WCAG 3.1.2 fix — closes #2269 (PR #2270) | ✅ Done |
| 2026-04-29 | 11.39 | Reader sidebar Notes tab annotation sentence_text missing lang attribute — added lang={bookLanguage} to annotation <p> tag — WCAG 3.1.2 fix — closes #2271 (PR #2272) | ✅ Done |
| 2026-04-29 | 11.40 | Flashcard status counter word in template literal missing lang — converted to JSX span with lang attribute — WCAG 3.1.2 fix — closes #2273 (PR #2274) | ✅ Done |
| 2026-04-29 | 11.41 | AnnotationsSidebar sentence_text and reader notes-expand panel missing lang — added bookLanguage prop to AnnotationsSidebar + lang on both elements — WCAG 3.1.2 fix — closes #2275 (PR #2276) | ✅ Done |
| 2026-04-29 | 11.42 | WordLookup selected word missing lang — added bookLanguage prop to WordLookup + lang on word heading — WCAG 3.1.2 fix — closes #2279 (PR #2280) | ✅ Done |
| 2026-04-29 | 11.43 | VocabularyToast word text missing lang — added lang={language} to word span in VocabularyToast — WCAG 3.1.2 fix — closes #2281 (PR #2282) | 🔄 In progress |
| 2026-04-29 | 11.44 | AnnotationToolbar quoted sentence missing lang — added bookLanguage prop to AnnotationToolbar + lang on quoted paragraph — WCAG 3.1.2 fix — closes #2283 (PR #2284) | ✅ Done |
| 2026-04-29 | 11.45 | Gutenberg search empty state missing CTA — added Clear search button that resets query + searchedQuery + results — closes #2285 (PR #2286) | ✅ Done |
| 2026-04-29 | 11.46 | InsightChat ContextChip and MsgContextBlock quoted text missing lang — added bookLanguage prop to both sub-components + lang on quoted spans — WCAG 3.1.2 fix — closes #2287 (PR #2288) | 🔄 In progress |
| 2026-04-29 | 11.47 | Flashcard feedback question word span missing lang — added lang={currentCard.language} to word span in grade prompt — WCAG 3.1.2 fix — closes #2289 | 🔄 In progress |

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

## Wave 10 — Accessibility Round 2 (2026-04-28)

### WCAG 2.4.7 Focus Visible — focus rings on card-style buttons
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-28 | `focus-visible:ring-2 focus-visible:ring-amber-400` on flashcard, reader annotation, and sidebar cards | flashcards/page.tsx, reader/[bookId]/page.tsx, AnnotationsSidebar.tsx | #1793 |

### WCAG 1.4.3 Contrast (text) — amber-600 → amber-700
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-28 | "Translate this chapter" button: `bg-amber-600` → `bg-amber-700` (3.75:1 → 5:1 on white) | reader/[bookId]/page.tsx | #1794 |

### WCAG 4.1.2 Name, Role, Value — settings panel semantics
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-28 | Removed `role="dialog"` from TypographyPanel — non-modal popover should not declare dialog role without `aria-modal="true"` | TypographyPanel.tsx | #1795 |

### WCAG 1.4.11 Non-text Contrast — icon color
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-28 | Delete-annotation buttons: `text-red-400` (#f87171, 2.8:1) → `text-red-500` (#ef4444, 3.8:1) on white | notes/[bookId]/page.tsx | #1797 |

## Wave 11 — Accessibility Round 3 (2026-04-28)

### WAI-ARIA 1.2 — Accordion Pattern (heading wraps button)
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-28 | Flashcard context sentence shown on answer side (`word_occurrences.sentence_text`) | flashcards/page.tsx, db.py | #1800 |
| 2026-04-28 | Vocabulary sort control: added `role="group" aria-label="Sort by"` wrapper | vocabulary/page.tsx | #1805 |
| 2026-04-28 | SelectionToolbar: Escape key dismisses floating toolbar (WAI-ARIA toolbar convention) | SelectionToolbar.tsx | #1806 |
| 2026-04-28 | CollapseHeading in notes: inverted `<button><h2>` → `<h2><button>` per WAI-ARIA accordion pattern | notes/[bookId]/page.tsx | #1809 |
| 2026-04-28 | Profile Obsidian accordion: inverted `<button><h2>` → `<h2><button>` per WAI-ARIA accordion pattern | profile/page.tsx | #1810 |

### UX polish
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-28 | Focus-mode HUD truncated chapter title: added `title` tooltip for hover-reveal | reader/[bookId]/page.tsx | #1770 |

## Wave 12 — Navigation + Contrast (2026-04-28)

### WCAG 1.4.3 Placeholder contrast
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-28 | `placeholder:text-stone-400` (2.4:1) → `placeholder:text-stone-600` (7.2:1) on 4 inputs | decks/[deckId]/page.tsx, AnnotationToolbar.tsx, SearchBar.tsx, InsightChat.tsx | #1819 |
| 2026-04-28 | Browser-default placeholder (~3.95:1) → `placeholder:text-stone-600` (7.2:1) on 14 inputs across 6 files | notes/page.tsx, vocabulary/page.tsx, page.tsx, decks/new/page.tsx, profile/page.tsx, TagEditor.tsx | #1824 |

### UX dead-end fixes
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-28 | DeckCard: added `onClick` prop + content-area button so `/decks` list navigates to `/decks/{id}` | DeckCard.tsx, decks/page.tsx | #1821 |

## Wave 13 — Placeholder Contrast Sweep Round 3 (2026-04-28)

### WCAG 1.4.3 Placeholder contrast
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-28 | Browser-default placeholder → `placeholder:text-stone-600` on 7 remaining inputs in QueueTab and admin pages | QueueTab.tsx, admin/uploads/page.tsx, admin/books/page.tsx | #1828 |

## Wave 14 — Keyboard Focus Trap (2026-04-29)

### ARIA APG Dialog Pattern — focus must stay within open modal
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-29 | Added `useFocusTrap` hook; applied to all 9 modal dialogs so Tab/Shift+Tab cycles within the dialog instead of escaping to background content | useFocusTrap.ts, AuthPromptModal.tsx, WordActionDrawer.tsx, BookDetailModal.tsx, VocabWordTooltip.tsx, AnnotationToolbar.tsx, AnnotationsSidebar.tsx, vocabulary/page.tsx, decks/[deckId]/page.tsx, reader/[bookId]/page.tsx | #2084 |

## Wave 15 — WCAG 3.1.2 Language of Parts (2026-04-29)

### Foreign-text elements must carry `lang` attribute (WCAG 3.1.2)
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-29 | Added `lang={bookLanguage}` to InsightCard blockquote context | InsightCard.tsx | #2268 |
| 2026-04-29 | Added `lang` to ChapterCard search snippet | ChapterCard.tsx | #2270 |
| 2026-04-29 | Added `lang` to Reader sidebar annotation sentence | reader/[bookId]/page.tsx | #2272 |
| 2026-04-29 | Added `lang` to FlashcardsPage SRS counter word | flashcards/page.tsx | #2274 |
| 2026-04-29 | Added `lang` to AnnotationsSidebar sentence_text and notes expand | AnnotationsSidebar.tsx | #2276 |
| 2026-04-29 | Added `lang` to WordLookup word heading | WordLookup.tsx | #2280 |
| 2026-04-29 | Added `lang` to VocabularyToast word span | VocabularyToast.tsx | #2282 |
| 2026-04-29 | Added `lang` to AnnotationToolbar quoted sentence | AnnotationToolbar.tsx | #2284 |
| 2026-04-29 | Added `lang` to InsightChat ContextChip and MsgContextBlock | InsightChat.tsx | #2288 |
| 2026-04-29 | Added `lang` to FlashcardsPage feedback word span | flashcards/page.tsx | #2292 |
| 2026-04-29 | Added `lang` to Notes VocabRow word anchor | notes/[bookId]/page.tsx | #2294 |

## Wave 16 — Interaction Quality: Error Feedback + UX Dead-ends (2026-04-29)

### Error state visual feedback on form inputs
| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-29 | WordActionDrawer: added retry button on dictionary API error (dead-end fix) | WordActionDrawer.tsx | #2297 |
| 2026-04-29 | Profile Gemini key input: conditional `border-red-400` when save fails | profile/page.tsx | #2298 |
| 2026-04-29 | Profile Obsidian settings inputs: conditional `border-red-400` when save fails | profile/page.tsx | #2301 |
| 2026-04-29 | TagEditor new-tag input: conditional `border-red-400` when tag is invalid | TagEditor.tsx | #2303 |
| 2026-04-29 | decks/new deck name input: conditional `border-red-400` on validation error | decks/new/page.tsx | #2304 |

---


## Wave 17 — Dialog ARIA, Title Tooltips, and Truncation UX (2026-04-29)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-29 | WordLookup popup: added role="dialog", aria-label, close button with CloseIcon (closes #2306) | WordLookup.tsx | #2307 |
| 2026-04-29 | DeckCard description: added title={deck.description} for truncated text tooltip (closes #2308) | DeckCard.tsx | #2309 |
| 2026-04-29 | Reader annotation cards: added title tooltip on desktop sidebar role=button and mobile bottom-sheet button for truncated sentence/note text (closes #2310) | reader/[bookId]/page.tsx | #2310 |
| 2026-04-29 | AnnotationsSidebar annotation card: added title tooltip on role=button for truncated sentence/note text (closes #2312) | AnnotationsSidebar.tsx | #2313 |
| 2026-04-29 | AnnotationToolbar sentence preview: added title={sentenceText} on line-clamp-2 paragraph (closes #2314) | AnnotationToolbar.tsx | #2315 |
| 2026-04-29 | Vocabulary sidebar occurrence buttons: added title={occ.sentence_text} on buttons wrapping line-clamp-2 sentence context (closes #2316) | reader/[bookId]/page.tsx | #2317 |
| 2026-04-29 | Deck word-list: added title={w.word} on member span and add-word picker button for truncated vocabulary words (closes #2318) | decks/[deckId]/page.tsx | #2319 |
| 2026-04-29 | TTSControls loading preview: added title={loadingState.preview} on truncate paragraph (closes #2320) | TTSControls.tsx | #2322 |
| 2026-04-30 | Import stage status messages: added title={s.message} on truncate paragraph during active stages (closes #2321) | import/[bookId]/page.tsx | #2324 |
| 2026-04-30 | Notes page stats/export + SeedPopularButton log entries: title tooltips for truncated count summary, export message, and log list items (closes #2325) | notes/[bookId]/page.tsx, SeedPopularButton.tsx | #2326 |
| 2026-04-30 | QueueTab admin: title tooltips for truncated preset chain div and cost comparison model name (closes #2323) | QueueTab.tsx | #2327 |
| 2026-04-30 | Design system: replace hardcoded shadow-sm on card containers (import, login, notes) with --shadow-card CSS variable and hover handlers (closes #2328) | import/[bookId]/page.tsx, login/page.tsx, notes/page.tsx | #2328 |
| 2026-04-30 | Deck name input: aria-required="true" for screen reader required-field announcement without native validation side-effects (closes #2360) | decks/new/page.tsx | #2361 |
| 2026-04-30 | QueueTab section-header spinners: role="status" wrappers on loadingCost and loadingItems inline Spinner components for WCAG 4.1.3 (closes #2362) | QueueTab.tsx | #2363 |
| 2026-04-30 | Profile Obsidian inputs: aria-invalid + aria-describedby + id="obsidian-msg" on status paragraph matching Gemini key pattern (closes #2364) | profile/page.tsx | #2365 |
| 2026-04-30 | Profile TTS gender + translation provider radio groups: role="radiogroup" + aria-labelledby — WCAG 1.3.1 (closes #2385) | profile/page.tsx | #2386 |
| 2026-04-30 | Vocabulary empty-state: added "Clear all filters" CTA when both tag filter and search are active simultaneously — prevents dead-end with zero results (closes #2389) | vocabulary/page.tsx | #2390 |
| 2026-04-30 | Deck form: live character counters (X/80, X/500) with aria-live="polite" on name and description inputs — WCAG 3.3.1 spirit (closes #2391) | decks/new/page.tsx | #2392 |
| 2026-04-30 | Deck detail page: distinguish zero-vocab state from all-in-deck state — show "Start reading" CTA with guidance when user has no vocabulary, instead of a silent disabled "Add word" button (closes #2394) | decks/[deckId]/page.tsx | #2394 |

---

## #364 — Mobile sub-sentence selection (design note, 2026-04-27)

**Status:** Shipped. Design note merged in #1671; implementation drops the touch `preventDefault` per Approach B.

**Problem.** Mobile users cannot highlight a sub-sentence phrase. `SentenceReader` calls `e.preventDefault()` on touch `pointerdown` (introduced in PR #324, UX-003 fix) to suppress the browser's native selection loupe so the 500ms long-press cleanly opens the word-action drawer. Side-effect: native text selection is also blocked, so a mobile user can only annotate the **full sentence** via long-press, never a sub-phrase. Documented as #UX-001 in `docs/reader-interaction-design.md`.

The `SelectionToolbar` infrastructure (selection-change listener, Highlight / Note / Chat / Vocab actions) already exists and works on desktop. The blocker is purely that touch input never produces a selection in the first place.

### Approaches considered

**A. Custom selection handles (issue's original proposal).**
Build draggable iOS-style start/end handles after the long-press fires, let the user drag them to extend/shrink the selection inside the AnnotationToolbar.

- Pros: full control, no race with the browser's native loupe, consistent across iOS/Android.
- Cons: meaningful new component (~200+ LOC), hit-testing characters during drag, edge cases at line wraps, must keep scroll/zoom under control during drag, accessibility (touch handles need aria-grabbed semantics or equivalent).
- Cost: 2-3 PRs minimum.

**B. Drop `preventDefault`, rely on motion-based gesture disambiguation. (Recommended)**
Stop calling `e.preventDefault()` on `pointerdown`. The 500ms timer + the existing pointermove `>10px` cancel already disambiguate cleanly:

- Quick tap (<200ms): seek-to-time (existing onClick path).
- Hold still ≥500ms: timer fires → `removeAllRanges()` clears any nascent selection → word-action drawer opens (existing path).
- Drag >10px before 500ms: pointermove cancels the long-press timer → browser's native loupe + selection handles take over → user lifts finger → existing `SelectionToolbar` mounts above the selection rect → Highlight saves a sub-sentence annotation.

- Pros: ~5 LOC change in `SentenceReader.tsx`; no new component; uses the platform's familiar selection UI; reuses `SelectionToolbar` end-to-end.
- Cons: Brief visual jank possible if the user holds still long enough for the browser to *start* showing its loupe (typically ~300-450ms across iOS/Android) before our 500ms timer clears the selection. In practice the loupe-flash is acceptable and ships in many native apps with similar gesture stacks.
- Cost: 1 PR for the implementation + 1 regression test asserting `preventDefault` is gone from the touch branch.

**C. Mode-toggle button on the reader top bar.**
Add an explicit "Select text" toggle that, while on, suspends the long-press handler entirely and lets native selection work normally. Toggle off to restore long-press → annotation flow.

- Pros: zero ambiguity; user opts into selection mode explicitly.
- Cons: extra chrome cluttering the toolbar; users have to know the toggle exists; adds a mode where there isn't one today; doesn't fix the discoverability problem (most users won't find the toggle).
- Cost: 1 PR but UX regression compared to platform native.

### Recommendation

Approach **B** is the smallest change with the highest leverage. The `SelectionToolbar` is already wired and tested on desktop; making touch produce a selection is the only missing link. The brief loupe-flash is a tolerable cost compared to building a custom handle system for marginal polish.

If post-ship telemetry or user feedback shows the loupe-flash is intrusive, we can iterate toward Approach A or C; both are additive on top of B.

### Implementation outline (next PR)

1. In `SentenceReader.tsx` `handleSegLongPress`: remove the `if (e.pointerType === "touch") e.preventDefault();` line at the top of the handler. Keep everything else (timer, removeAllRanges, drawer open).
2. Confirm by hand on iOS Safari + Android Chrome: long-press still opens the word-action drawer; drag-select produces a selection; existing SelectionToolbar Highlight/Note/Chat/Vocab actions all work on the touch-produced selection.
3. Update `docs/reader-interaction-design.md` mobile section: replace the "no sub-sentence path" note with the new gesture model, mark #UX-001 resolved.
4. Regression test: assert the `e.pointerType === "touch"` guard is no longer paired with `preventDefault()` in `SentenceReader.tsx`. (Negative regex on the file source is sufficient — the runtime semantics belong to manual + E2E coverage.)
5. Optional follow-up: extend an existing E2E in `frontend/e2e/` to simulate a `pointermove >10px` drag and assert the SelectionToolbar mounts.
