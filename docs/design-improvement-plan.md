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
| 2026-04-29 | 11.43 | VocabularyToast word text missing lang — added lang={language} to word span in VocabularyToast — WCAG 3.1.2 fix — closes #2281 (PR #2282) | ✅ Done |
| 2026-04-29 | 11.44 | AnnotationToolbar quoted sentence missing lang — added bookLanguage prop to AnnotationToolbar + lang on quoted paragraph — WCAG 3.1.2 fix — closes #2283 (PR #2284) | ✅ Done |
| 2026-04-29 | 11.45 | Gutenberg search empty state missing CTA — added Clear search button that resets query + searchedQuery + results — closes #2285 (PR #2286) | ✅ Done |
| 2026-04-29 | 11.46 | InsightChat ContextChip and MsgContextBlock quoted text missing lang — added bookLanguage prop to both sub-components + lang on quoted spans — WCAG 3.1.2 fix — closes #2287 (PR #2288) | ✅ Done |
| 2026-04-29 | 11.47 | Flashcard feedback question word span missing lang — added lang={currentCard.language} to word span in grade prompt — WCAG 3.1.2 fix — closes #2289 | ✅ Done |
| 2026-05-01 | 12.1 | SentenceReader note-dot button aria-controls + note card id; InsightChat ContextChip/MsgContextBlock useId + aria-controls; AnnotationsSidebar toggle aria-haspopup="dialog" — WAI-ARIA disclosure/dialog pattern — closes #2563 (PR #2564) | ✅ Done |
| 2026-05-01 | 12.2 | VocabWordTooltip, WordLookup, WordActionDrawer, decks add-word picker, reader chat sheet dialogs: added aria-describedby — WAI-ARIA dialog description for screen-reader context on focus — closes #2565 (PR #2566) | ✅ Done |
| 2026-05-01 | 12.3 | Vocabulary page rapid-delete silently swallowed backend errors — added deleteErrorMsg state + visible red error banner with 5 s auto-dismiss; both handleDelete commit-path and onDone toast-expiry path now surface errors — closes #2603 (PR #2604) | ✅ Done |
| 2026-05-01 | 12.4 | Decks page (deleteDeck), deck detail page (removeDeckMember), notes page (deleteAnnotation + deleteInsight) — all 8 UndoToast commit paths had bare .catch(() => {}) silent errors — added error banner state to each — closes #2605 (PR #2606) | ✅ Done |
| 2026-05-01 | 12.5 | Upload chapter review dead-end — user removing all chapters saw disabled confirm button with no explanation; added empty-state <li> with "at least one chapter needed" message and escape link — closes #2607 (PR #2608) | ✅ Done |
| 2026-05-01 | 12.6 | TTSControls idle Read button had no accessible name — WCAG 4.1.2 violation; screen readers announced "Read, dimmed" with no context; added aria-label="Read aloud — loading chapter text" — closes #2609 (PR #2610) | ✅ Done |
| 2026-05-01 | 12.7 | Reader annotation undo-restore silently swallowed createAnnotation errors — user clicked Undo and believed annotation was restored but it was permanently lost on failure; added annotationUndoError state + role="alert" banner — closes #2611 (PR #2612) | ✅ Done |
| 2026-05-01 | 12.8 | Deck detail add-word silently rolled back on API failure with no user feedback — user saw word appear then disappear with no explanation; added addMemberErrorMsg state + role="alert" banner — closes #2614 (PR #2615) | ✅ Done |
| 2026-05-01 | 12.9 | Reader enqueue-all (Translate remaining) used blocking browser alert() for all feedback — replaced with inline enqueueToast state (role="status" for success, role="alert" for errors) with 5s auto-dismiss — closes #2617 (PR #2618) | ✅ Done |
| 2026-05-01 | 12.10 | Reader retry-failed used blocking browser alert() on error — replaced with inline retryToast state (role="alert") with 5s auto-dismiss — closes #2619 | ✅ Done |

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
| 2026-04-30 | Profile Obsidian form: remove aria-invalid from all three fields on generic save error — WCAG 1.3.1 violation fixed; role="status" region (obsidian-msg) is the correct channel for form-level errors; aria-describedby links fields to it (closes #2396) | profile/page.tsx | #2396 |
| 2026-04-30 | Deck add-word picker: aria-live status region announces each word addition to screen readers — WCAG 4.1.3 (closes #2398) | decks/[deckId]/page.tsx | #2398 |
| 2026-04-30 | TTS sliders: add aria-valuetext to playback position slider (formatted time, e.g. "2:32") and speed slider ("1.0×"); add aria-label to speed slider — WCAG 4.1.2 (closes #2400) | components/TTSControls.tsx | #2401 |
| 2026-04-30 | Reader annotation/highlight save: sr-only role=status live region announces "Note saved" / "Highlight applied" after AnnotationToolbar or QuickHighlightPanel saves — WCAG 4.1.3 (closes #2402) | reader/[bookId]/page.tsx | #2403 |
| 2026-04-30 | SelectionToolbar: always renders sr-only aria-live="polite" live region; announces available actions when text selection activates — prevents silent WCAG 4.1.3 violation for keyboard selection (closes #2404) | components/SelectionToolbar.tsx | #2405 |
| 2026-04-30 | AnnotationToolbar: close button disabled (opacity-40, cursor-not-allowed) and backdrop click no-op while save/delete in flight — prevents silent data loss risk (closes #2406) | components/AnnotationToolbar.tsx | #2407 |
| 2026-04-30 | InsightChat: API error responses now render as a distinct red alert bubble (role="alert", AlertCircleIcon) instead of appearing as normal AI assistant messages (closes #2408) | components/InsightChat.tsx | #2409 |
| 2026-04-30 | QuickHighlightPanel: added error state — save/delete failures now show inline role="alert" message ("Save failed — tap a colour to retry") instead of silently resetting the panel (closes #2410) | components/QuickHighlightPanel.tsx | #2411 |
| 2026-04-30 | Reader annotations sidebar: replaced silent empty state on getAnnotations failure with "Couldn't load annotations" error state + Retry button — prevents misleading "No annotations yet" (closes #2414) | app/reader/[bookId]/page.tsx | #2415 |
| 2026-04-30 | Vocabulary DefinitionSheet: replaced silent .catch() on getWordDefinition failure with error state — shows "Couldn't load definition" + Retry button instead of misleading "No definition found." (closes #2417) | app/vocabulary/page.tsx | #2418 |
| 2026-04-30 | VocabWordTooltip (reader): replaced silent .catch() on getWordDefinition failure with error state — shows "Couldn't load definition" + Retry button instead of misleading "No definition found." in core reading flow (closes #2419) | components/VocabWordTooltip.tsx | #2420 |
| 2026-04-30 | ReadingStats: replaced silent null return on fetch failure with error state — shows "Couldn't load reading stats" message and Retry button (closes #2412) | components/ReadingStats.tsx | #2413 |
| 2026-04-30 | Reader vocab sidebar: replaced silent .catch() on getVocabulary failure with error state — shows "Couldn't load vocabulary" + Retry button instead of misleading "No vocabulary saved yet" (closes #2421) | app/reader/[bookId]/page.tsx | #2422 |
| 2026-04-30 | Upload page: replaced silent getUploadQuota() failure with "Couldn't load quota" error state + Retry button — prevents misleading active upload zone when user may be at limit (closes #2423) | app/upload/page.tsx | #2425 |
| 2026-04-30 | Profile Obsidian settings: replaced silent .catch() on getObsidianSettings failure with error state — shows "Couldn't load Obsidian settings" + Retry button inside accordion so user knows load failed (closes #2424) | app/profile/page.tsx | #2428 |
| 2026-04-30 | TagEditor: replaced silent .catch() on initial tag fetch with loadFailed state — shows Retry button instead of misleading empty tag list (closes #2426) | components/TagEditor.tsx | #2427 |
| 2026-04-30 | Home page stats panel: replaced silent getUserStats() failure with inline "Couldn't load stats" error + Retry — panel no longer disappears invisibly on network error (closes #2429) | app/page.tsx | #2430 |
| 2026-04-30 | Vocabulary page tag filter: replaced silent listVocabularyTags() failure with inline "Couldn't load tags" error + Retry — filter strip no longer silently disappears (closes #2431) | app/vocabulary/page.tsx | #2432 |
| 2026-04-30 | Notes/[bookId]: annotation edit save failure now shows inline "Couldn't save — try again." error below Save/Cancel buttons instead of silently keeping edit open (closes #2433) | app/notes/[bookId]/page.tsx | #2434 |
| 2026-04-30 | Profile page: getMe() failure no longer silently shows key-input form to users who already have a Gemini key — shows "Couldn't load key status" + Retry instead (closes #2435) | app/profile/page.tsx | #2436 |
| 2026-04-30 | Profile page: listDecks() failure now shows "Couldn't load study decks" + Retry in the decks section instead of silently hiding it (closes #2437) | app/profile/page.tsx | #2438 |
| 2026-04-30 | Flashcards page: listDecks() failure now shows "Couldn't load decks" + Retry instead of silently removing the deck selector (closes #2439) | app/vocabulary/flashcards/page.tsx | #2440 |
| 2026-04-30 | Admin users page: getMe() failure no longer silently exposes own Revoke/Delete buttons — hides all action buttons and shows "Couldn't verify identity" + Retry (closes #2441) | app/admin/users/page.tsx | #2442 |
| 2026-04-30 | Reader page: notifyAIUsed now uses strict `=== false` check so Gemini key reminder doesn't fire on transient getMe() failure when hasGeminiKey is null (closes #2443) | app/reader/[bookId]/page.tsx | #2444 |
| 2026-04-30 | Reader page: added role="status" to translation queue and login-required banners so screen readers announce them (WCAG 4.1.3, closes #2445) | app/reader/[bookId]/page.tsx | #2446 |
| 2026-04-30 | Home page nav bar: replaced router.push buttons with Link elements for Upload/Notes/Vocabulary/Admin so Ctrl+Click opens new tab and screen readers announce them as links (closes #2447) | app/page.tsx | #2448 |
| 2026-04-30 | Replace `<button onClick={router.push}>` with `<Link href>` across upload, reader, flashcards, notes, import, deck pages (8 locations) — WCAG 4.1.2 (closes #2453) | multiple | #2454 |
| 2026-04-30 | Deck zero-vocab 'Start reading' CTA: split into `<Link href="/">` vs `<button>` conditional (closes #2455) | decks/[deckId]/page.tsx | #2456 |
| 2026-04-30 | Import page 'Skip' button: `<button onClick={() => router.push(nextUrl)}>` → `<Link href={nextUrl}>` (closes #2457) | import/[bookId]/page.tsx | #2458 |
| 2026-04-30 | AnnotationToolbar color picker: roving tabindex + ArrowRight/Left/Up/Down keyboard nav — WCAG 2.1.1 (closes #2459) | AnnotationToolbar.tsx | #2460 |
| 2026-04-30 | QuickHighlightPanel + SentenceActionPopup: focus restored to trigger element on close — WCAG 2.4.3 (closes #2473) | QuickHighlightPanel.tsx, SentenceActionPopup.tsx | #2474 |
| 2026-04-30 | TypographyPanel: focus restored to trigger on close; reader handleKeyDown guard updated to allow ArrowLeft/Right chapter nav from non-toolbar buttons — WCAG 2.4.3 (closes #2475) | TypographyPanel.tsx, reader/[bookId]/page.tsx | #2476 |
| 2026-04-30 | Vocabulary DefinitionSheet: Wiktionary fallback link in "No definition found" state — eliminates dead-end UX (closes #2477) | app/vocabulary/page.tsx | #2478 |
| 2026-04-30 | Search page: Retry button in error banner + `.finally()` cleanup — user can retry same query on network failure (closes #2479) | app/search/page.tsx | #2480 |

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

## Wave 10 — Interaction Quality (2026-04-30)

Dead-end error states given actionable fallback paths so users are never stranded.

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-30 | Search page: added Retry button to error state + `.finally()` for loading cleanup | app/search/page.tsx | #2480 |
| 2026-04-30 | Vocabulary DefinitionSheet: Wiktionary fallback link when definition empty/null | app/vocabulary/page.tsx | #2478 |
| 2026-04-30 | WordLookup: Wiktionary fallback link in error state when dictionary API finds nothing | components/WordLookup.tsx | #2483 |

## Wave 11 — Keyboard Accessibility (2026-04-30)

WCAG 2.1.1 (Keyboard) and 4.1.2 (Name, Role, Value) fixes for keyboard-only and AT users.

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-04-30 | SelectionToolbar: auto-focus first button on keyboard-driven text selection (Shift+Arrow); restore prior focus on close | components/SelectionToolbar.tsx | #2492 |
| 2026-04-30 | TTS gender toggle: aria-label omits "Click to switch" when button is disabled (WCAG 4.1.2) | components/TTSControls.tsx | #2494 |
| 2026-04-30 | QueueTab inline spinner: aria-label changed from empty string to undefined when not loading (WCAG 4.1.2) | components/QueueTab.tsx | #2496 |
| 2026-04-30 | Deck form counters: text-stone-400 → text-stone-600 on parchment background; contrast 2.3:1 → 6.7:1 (WCAG 1.4.3) | app/decks/new/page.tsx | #2497 |
| 2026-04-30 | Annotations tutorial: added "Select a phrase (partial text selection)" section with Shift+Arrow, Arrow Left/Right, Escape keyboard flow documentation | docs/tutorials/annotations.md | #2500 |
| 2026-04-30 | Flashcard done-state: tabIndex=-1 + useEffect focus-move on done=true; prevents focus loss when grade buttons unmount (WCAG 2.4.3) | app/vocabulary/flashcards/page.tsx | #2501 |
| 2026-04-30 | Upload chapter word-count pill: added AlertCircleIcon when word count < 100 or > 8000; color alone is insufficient per WCAG 1.4.1 | app/upload/[bookId]/chapters/page.tsx | #2503 |
| 2026-04-30 | Reading stats heatmap legend: added title + aria-label to each swatch (0, 1–2, 3–5, 6–10, 11+) so colorblind users can identify intensity levels (WCAG 1.4.1) | components/ReadingStats.tsx | #2505 |
| 2026-04-30 | Flashcard card-to-card transition: flipButtonRef + useEffect focus-move on currentIndex change; prevents focus loss when grade buttons unmount between cards (WCAG 2.4.3) | app/vocabulary/flashcards/page.tsx | #2507 |
| 2026-04-30 | UndoToast: increased auto-dismiss from 3 s → 5 s; timer now pauses on mouseenter/focusin and resumes on mouseleave/focusout — WCAG 2.2.1 Timing Adjustable (Level A) | components/UndoToast.tsx | #2509 |
| 2026-04-30 | QueueTab display-only scroll containers: added tabIndex={0} + focus ring to books-to-translate table wrapper and dry-run preview wrapper — WCAG 2.1.1 Keyboard (Level A) | components/QueueTab.tsx | #2511 |
| 2026-04-30 | Activity-log lists + VocabWordTooltip body: added tabIndex={0} + focus ring to QueueTab activity-log ul (max-h-60), SeedPopularButton events ul (max-h-40), and VocabWordTooltip definition body div (max-h-40) — WCAG 2.1.1 | components/QueueTab.tsx, SeedPopularButton.tsx, VocabWordTooltip.tsx | #2513 |
| 2026-04-30 | VocabularyToast: increased auto-dismiss from 2 s → 4 s; timer now pauses on mouseenter/focusin and resumes on mouseleave/focusout — WCAG 2.2.1 Timing Adjustable (Level A) | components/VocabularyToast.tsx | #2515 |
| 2026-04-30 | Reader scroll area: added tabIndex={0} + focus-visible inset ring to #reader-scroll (main chapter reading viewport) — keyboard users can now focus and scroll with Page Up/Down/Arrow keys — WCAG 2.1.1 (Level A, P1) | app/reader/[bookId]/page.tsx | #2517 |
| 2026-04-30 | Upload chapter preview panel: added tabIndex={0} + focus-visible inset ring to the right-side preview div in the chapter editor — WCAG 2.1.1 Keyboard (Level A, P3) | app/upload/[bookId]/chapters/page.tsx | #2519 |
| 2026-04-30 | AI content panels: added tabIndex={0} + focus-visible inset ring to InsightChat message log (role=log) and ChapterSummary body — keyboard users can scroll AI-generated content — WCAG 2.1.1 (Level A, P2) | components/InsightChat.tsx, ChapterSummary.tsx | #2521 |
| 2026-04-30 | Inline retry buttons: added min-h-[44px] md:min-h-0 to text-xs py-1.5 Retry buttons in error states across 6 user-facing files — WCAG 2.5.5 mobile touch target (P2) | app/page.tsx, app/search/page.tsx, app/upload/page.tsx, app/profile/page.tsx, app/vocabulary/page.tsx, components/ReadingStats.tsx | #2523 |
| 2026-04-30 | Reader sidebar + confirm dialogs: added min-h-[44px] md:min-h-0 to annotations/vocabulary Retry buttons in reader sidebar and Confirm/Cancel dialog buttons in QueueTab and admin/books — WCAG 2.5.5 touch target sweep (P2) | app/reader/[bookId]/page.tsx, components/QueueTab.tsx, app/admin/books/page.tsx | #2525 |
| 2026-04-30 | Reader sidebar error panels: changed role="status" → role="alert" on annotations and vocabulary fetch-error divs — WCAG 4.1.3 assertive announcement for errors (P2) | app/reader/[bookId]/page.tsx | #2527 |
| 2026-04-30 | Gemini banner key link: replaced button+window.open with semantic &lt;a href="/profile" target="_blank" rel="noopener noreferrer"&gt; + sr-only "opens in new tab" — WCAG 3.2.2 On Input / G201 (P2) | app/reader/[bookId]/page.tsx | #2529 |
| 2026-04-30 | Error panel role=status → role=alert sweep: 11 "Couldn&apos;t load …" error panels across 8 files — WCAG 4.1.3 assertive announcement so screen readers announce fetch errors immediately (P2) | app/page.tsx, app/admin/users/page.tsx, app/profile/page.tsx, app/vocabulary/page.tsx, app/vocabulary/flashcards/page.tsx, app/upload/page.tsx, components/ReadingStats.tsx, components/VocabWordTooltip.tsx | #2531 |
| 2026-04-30 | Profile page sections: added aria-labelledby to 4 sections and aria-label to 1 error-state section — exposes them as role="region" landmarks for screen reader landmark navigation (P3) | app/profile/page.tsx | #2533 |
| 2026-04-30 | Home page sections: added aria-labelledby to 5 sections and aria-label to 1 conditional-heading section (Your Library) — exposes them as role="region" landmarks (P3) | app/page.tsx | #2535 |
| 2026-04-30 | Notes book page sections: added aria-label to 5 sections (Annotations, AI Insights, Vocabulary, per-chapter, Book-level Insights) — landmark navigation for screen readers (P3) | app/notes/[bookId]/page.tsx | #2537 |
| 2026-04-30 | Search results sections: added aria-label={title} to ResultsSection <section> — exposes Annotations, Vocabulary, Chapters result groups as role="region" landmarks (P3) | app/search/page.tsx | #2539 |
| 2026-04-30 | Profile Obsidian Export section: added aria-label="Obsidian Export" — missed in #2533 sweep, section was role="generic" and invisible to landmark navigation (P3) | app/profile/page.tsx | #2541 |
| 2026-05-01 | CollapseHeading disclosure buttons: added aria-controls prop referencing controlled region id — WAI-ARIA disclosure pattern for AT programmatic navigation (P3) | app/notes/[bookId]/page.tsx | #2543 |
| 2026-05-01 | DeckCard article: added aria-labelledby={`deck-name-${deck.id}`} and id on <h2> — multiple unnamed article landmarks on decks page made distinguishable for screen reader navigation (P3) | components/DeckCard.tsx | #2545 |
| 2026-05-01 | Reader translation Display mode: replaced orphan `<label>Display</label>` (no htmlFor) with `<p id="reader-trans-display-label">` + `role="group" aria-labelledby` on button wrapper — WCAG 1.3.1 / 4.1.2 fix (P3) | app/reader/[bookId]/page.tsx | #2547 |
| 2026-05-01 | AnnotationsSidebar notes-page links: changed static aria-label="View in notes page" to template literal including sentence_text snippet — WCAG 2.4.9 Link Purpose (Link Only) fix, distinguishes multiple annotation links for AT users (P3) | components/AnnotationsSidebar.tsx | #2549 |
| 2026-05-01 | BookCard aria-label: appended badge content (chapter/time) to button accessible name — badge was invisible to AT because aria-label overrides button text in the accessibility tree (P3) | components/BookCard.tsx | #2551 |
| 2026-05-01 | Flashcard shortcut hint spans: added aria-hidden="true" to grade key numbers (1–4) and "Space / Enter" flip hint — opacity-60 at 10px gave ~2.5:1 contrast (WCAG 1.4.3 fail); decorative since button aria-label already includes shortcut info (P3) | app/vocabulary/flashcards/page.tsx | #2554 |
| 2026-05-01 | Vocabulary word button: changed base color from text-ink to text-amber-700 (hover: text-amber-900) — text-ink with only hover:text-amber-700 gave no visual affordance on touch devices where hover doesn't fire (P3) | app/vocabulary/page.tsx | #2557 |
| 2026-05-01 | Reader mobile Notes button: added aria-controls="reader-mobile-notes-panel" and id on revealed panel — WAI-ARIA 1.1 disclosure pattern; AT can now programmatically navigate to panel after activating button (P3) | app/reader/[bookId]/page.tsx | #2559 |
| 2026-05-01 | Reader sidebar chapter-collapse buttons + admin books disclosure buttons: added aria-controls + id pairs — WAI-ARIA disclosure pattern; reader sidebar per-chapter ul, admin book-detail div, admin lang-detail div now all programmatically linked to their triggers (P2) | app/reader/[bookId]/page.tsx, app/admin/books/page.tsx | #2561 |
| 2026-05-01 | aria-controls + aria-haspopup on 3 icon-only buttons (vocabulary filter/sort/tag expand, reader chat toggle) — trigger buttons were not connected to their popups via ARIA, breaking AT programmatic navigation (P3) | app/vocabulary/page.tsx, app/reader/[bookId]/page.tsx | #2563 |
| 2026-05-01 | aria-describedby on 5 role=dialog elements (VocabWordTooltip, WordLookup, WordActionDrawer, decks add-word picker, reader chat sheet) — dialogs had aria-label/labelledby but no description; AT read only the title on focus with no context (WCAG 1.3.1, P3) | components/VocabWordTooltip.tsx, components/WordLookup.tsx, components/WordActionDrawer.tsx, app/decks/[deckId]/page.tsx, app/reader/[bookId]/page.tsx | #2566 |
| 2026-05-01 | Import page: keep "Start reading now" button visible after import done — was hidden by `started && !isDone` guard; serves as escape hatch if socket fails to fire done event (P2) | app/import/[bookId]/page.tsx | #2569 |
| 2026-05-01 | Mobile annotation toggle: added showAnnotations toggle inside reader-mobile-notes-panel — desktop-only `hidden lg:flex` button was inaccessible on mobile; toggle now grouped logically with annotations (P2) | app/reader/[bookId]/page.tsx | #2570 |
| 2026-05-01 | Admin audio empty state: added "Go to Books" CTA link — no-audio state gave no escape hatch; users had to use sidebar nav to generate audio (P3) | app/admin/audio/page.tsx | #2574 |
| 2026-05-01 | Flashcard done state: added "Go to Decks" primary CTA — done state only had "Back to Vocabulary"; users had to navigate Vocabulary → Decks to review another deck (WCAG 2.4.4, P3) | app/vocabulary/flashcards/page.tsx | #2576 |
| 2026-05-01 | Continue reading link: changed static aria-label="Continue reading" to template literal including book title — WCAG 2.4.4 Link Purpose (Level A); screen readers now announce which book the link opens (P2) | app/page.tsx | #2578 |
| 2026-05-01 | Keyboard word-lookup mode: W (in sentence-select mode) enters per-word navigation, H/L or ←/→ navigate words, Enter opens vocab tooltip, Esc returns to sentence mode — word-select indicator strip + aria-live region for AT (P3) | app/reader/[bookId]/page.tsx, components/SentenceReader.tsx | #2589 |

## Wave 18 — Selection Gesture (2026-08-18)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-18 | SelectionToolbar: defer showing the toolbar until the pointer gesture ends — `selectionchange` fires continuously during a drag, so the toolbar mounted mid-gesture, sat over the text under the cursor and swallowed the pointer events needed to keep extending the selection. Drag now clears any stale toolbar on pointerdown and evaluates the final selection once on pointerup/pointercancel; keyboard (Shift+Arrow) selections resolve off `selectionchange` as before. Pointer timestamp now stamped on release too, so a drag longer than the 300ms keyboard heuristic is no longer misread as a keyboard selection and does not steal focus (P1) | components/SelectionToolbar.tsx | #2655 |

## Wave 19 — Vocabulary Base Forms (2026-08-20)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-20 | Word tooltip: an inflected word's Wiktionary entry only states which form it is ("past participle of gehen"), so the lookup now follows the pointer once and shows the base form's actual definitions, with the form-of note kept as secondary context. Save button names the word it will file (`Save "gehen" to vocab`) so the stored word is never a surprise (P1) | components/VocabWordTooltip.tsx, services/wiktionary.py | #2663 |
| 2026-08-20 | Vocabulary entries are stored under the base form. One word met in several inflections is now one entry with several occurrences instead of one entry per inflection. Resolution happens before the insert (previously a fire-and-forget task that could silently fail); the tooltip passes the base form it already fetched, so no extra round-trip. Every failure path falls back to the word as it appeared in the text (P1) | services/db.py, routers/vocabulary.py, app/reader/[bookId]/page.tsx | #2663 |
| 2026-08-20 | Migration 042 merges historical inflected entries into their base form, repointing word_occurrences, flashcard_reviews, vocabulary_tags and deck_members first — all four cascade off vocabulary(id), so deleting first would have wiped spaced-repetition history, tags and deck membership (P1) | migrations/042_vocabulary_base_form_merge.sql | #2663 |

## Wave 20 — Stored Meanings + Dictionary Language (2026-08-26)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-26 | Vocabulary stores each word's meaning at save time instead of re-running a dictionary lookup on every click. The tooltip already holds a definition when Save is pressed, so it travels with the save; saved words then render instantly from the DB. Meanings also appear under each vocabulary-page entry and on the flashcard back, which previously showed only the sentence context (P2) | components/VocabWordTooltip.tsx, app/vocabulary/page.tsx, app/vocabulary/flashcards/page.tsx, services/db.py, routers/vocabulary.py | #2704 |
| 2026-08-26 | Dictionary language is selectable from a picker in the word tooltip, remembered in localStorage. Each Wiktionary edition is its own wiki, so the target language selects the host; the chain is target Wiktionary → AI writing in that language → English as a last resort, and the panel says when it could not answer in the language asked for | components/VocabWordTooltip.tsx, lib/dictionaryLanguage.ts, services/wiktionary.py | #2704 |
| 2026-08-26 | Migration 031 rebuild switched from `INSERT … SELECT *` to an explicit column list — the bare form breaks as soon as a later migration ALTERs `vocabulary` (044 appends four columns). Same fix migrations 033/034 already carried | migrations/031_fk_annotations_vocabulary.sql | #2704 |

## Wave 21 — Export Choice (2026-08-26)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-26 | The Export button on the book-notes and vocabulary pages went straight to the Obsidian vault flow, which does nothing without a configured vault. It now opens a menu offering a direct Markdown download (built client-side, no vault or network needed) alongside the unchanged Obsidian export. New `ExportMenu` popover pattern: Escape and outside-click close it, arrow keys move between items, focus returns to the trigger, 44px touch targets on mobile (P2) | components/ExportMenu.tsx, lib/download.ts, lib/vocabularyMarkdown.ts, app/notes/[bookId]/page.tsx, app/vocabulary/page.tsx | #2705 |

## Wave 21 — Home / Bookshelf restructure (2026-08-26)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-26 | Home shows the curated catalog directly. Readers no longer import books — an admin/architect session audits the chapter split and writes the freeze record — so the Gutenberg search and the Discover tab it lived in are removed, and Home absorbs Discover entirely. The catalog is keyed on `book_freeze` ("published"), not on ownership, so the coming user-upload flow stays additive (P2) | app/page.tsx, routers/books.py, services/db.py | #2711 |
| 2026-08-26 | "Your Library" became "Your Bookshelf" on its own `/bookshelf` route, carrying the greeting, Continue Reading, stats strip and book grid. The two-tab strip became a real `<nav>` landmark with links and `aria-current="page"` — tabs promised in-page panels that no longer exist (P2) | app/bookshelf/page.tsx, components/SiteHeader.tsx | #2711 |
| 2026-08-26 | Header and primary nav extracted to `SiteHeader` — it now has to render on two routes rather than living inline in the homepage (P2) | components/SiteHeader.tsx | #2711 |

## Wave 22 — Chapter audit panel (2026-08-26)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-26 | Chapter split audit rebuilt as a shared `ChapterAuditPanel`. The previous editor could retitle and remove, showed a 300-character preview, and had **no split or merge** — the two operations a bad split actually needs, since a merged pair of chapters is the commonest failure. Splitting now happens between paragraphs where the eye already is; merge and discard sit beside it; the full chapter text replaces the preview | components/ChapterAuditPanel.tsx, app/upload/[bookId]/chapters/page.tsx | audit |
| 2026-08-26 | Per-chapter flags so a long audit is a search rather than a read: runt, oversized (>3× median — the merged-chapters tell), no title, and "shouting" (an all-caps speaker cue buried in a long paragraph — the verse-collapse pattern from #820, reusing the signal `epub_split_audit.py` applies at book level). Hints, never gates | lib/chapterFlags.ts | audit |
| 2026-08-26 | Autosave: debounced PATCH while typing, immediate PUT after a split or merge, with a quiet saved marker and an explicit warning when a save fails — an unsaved change is only on that device. Review ticks and a progress meter let a 47-chapter audit be interrupted and resumed | components/ChapterAuditPanel.tsx | audit |
| 2026-08-26 | Bulk title tools — number them (strips any existing ordinal first, so running twice cannot produce "2. 1. Nacht"), use first line (fills empty titles only), strip numerals — each one undo step | lib/chapterFlags.ts | audit |
| 2026-08-26 | Chapter rows became real `<button>`s rather than divs with `role="button"` + `onKeyDown`, and the scrollable text pane keeps its `tabIndex={0}` for keyboard scrolling (#2519) | components/ChapterAuditPanel.tsx | audit |

## Wave 23 — Fossilize on confirm, generated covers (2026-08-26)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-26 | Finishing an upload's audit fossilizes it: `confirm` writes a `book_freeze` row with `audited_by` = the owner's user id, and copies the confirmed chapters into `book_chapters`. Annotations anchor to `chapter_index`, so a split that can still move silently re-anchors them. `published_at` stays NULL — an upload is private for good | routers/uploads.py | audit |
| 2026-08-26 | Covers are drawn from the record instead of stored, with the ground colour derived deterministically from the book. A shelf of identical placeholders cannot be scanned, and recognition is the whole job of a cover; hues stay inside the app's warm range so a shelf still reads as one set. Long titles step down a size and wrap rather than truncate | components/GeneratedCover.tsx, components/BookCard.tsx | audit |
| 2026-08-26 | `Your upload` badge on cards for books the reader brought themselves (`source='upload'`). Library books stay unmarked — the badge marks the exception | components/BookCard.tsx | audit |

## Wave 24 — Bookshelf "In progress" (2026-08-26)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-26 | Bookshelf carries unfinished audits: cover, `31 of 118 chapters reviewed`, a progress bar, and a button that reads **Continue audit** or **Add to shelf** depending on whether every chapter is ticked. The draft already persisted server-side, but there was no way back to a half-audited book short of remembering its URL. An empty shelf with work in flight now points at the work rather than at the library | app/bookshelf/page.tsx | audit |
| 2026-08-26 | `Your upload` badge actually wired up. It shipped as a `BookCard` prop nobody passed — the component test set it directly, which hid that no call site ever did. `GET /books/uploads/mine` supplies the ids, since the shelf is built from localStorage and entries saved before `source` was recorded carry no marker | app/bookshelf/page.tsx, routers/uploads.py | audit |
| 2026-08-26 | Chapter navigation moves from a `<select>` to a **Contents panel** in the reader sidebar (#2745). The dropdown was capped at 160 px desktop / 110 px mobile — roughly 30 characters — so City of God's sixty-character titles and Dracula's chapter 24 heading were unreadable, and a native select holding Moby Dick's 138 options is a scroll rather than a choice. The panel joins the existing tabbed sidebar, inheriting resize, persistence, focus trap and Escape-to-close. Row is number (tabular, fixed column) · title (serif — it is book content, not chrome) · optional translation dot. Filter appears past 20 chapters and matches title or number. Current chapter takes an amber left rule and `aria-current`, scrolled into view on open. `t` toggles the panel. Both dropdowns become Contents buttons; prev/next arrows stay | components/TableOfContents.tsx, app/reader/[bookId]/page.tsx | #2745 |

## Wave 25 — Translation readiness in the review queue (2026-08-26)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-26 | The review queue reports translation progress per target language — `zh 11/42`, `zh complete`, or `not translated`. A frozen split says the chapters are right; it says nothing about whether the book is ready, and publishing a book mid-translation puts a half-translated book in the library. Counted with DISTINCT, so a re-translated chapter is still one translated chapter. Shown but not enforced — publishing an untranslated original is legitimate, so it informs rather than blocks | services/db.py, components/PendingPublishPanel.tsx | queue |

## Wave 26 — Admin can fix a split; library actions named (2026-08-27)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-27 | Finding a bad split in a queued book was a dead end. The audit panel is now mounted in the review queue — **Review split** opens it in place, edits rewrite `book_chapters` and re-stamp `content_sha256`, and **Add to library** saves and publishes in one step. Freezing is a source selector, not a lock: it stops the splitter drifting, it does not forbid deliberate correction | components/PendingPublishPanel.tsx, routers/admin.py | admin-panel |
| 2026-08-27 | Editing refuses once anything anchors to the split — annotations, vocabulary occurrences or translations — naming what would break. A queued book has none, since nobody can read an unpublished book, so the guard never fires for the case the queue exists for | routers/admin.py | admin-panel |
| 2026-08-27 | Buttons name their destination rather than the operation: **Add to library** / **Remove from library** for the public catalog, **Add to shelf** for the reader's own. "Publish" never said where; The Library and Your Bookshelf are named places in the UI since #2711 | components/PendingPublishPanel.tsx, app/admin/books/page.tsx | admin-panel |
| 2026-08-27 | **Remove from library** exists at all. The unpublish endpoint shipped with the publish gate but nothing ever called it — a book could go into the library and never come back out without SQL | app/admin/books/page.tsx | admin-panel |
| 2026-08-27 | Contents panel typography reworked after owner review: it read as a wall of undifferentiated black. Chapter titles move from `font-serif text-[13.5px]` in near-black `text-ink` to `text-xs` in `text-stone-600` — a chapter list is navigation chrome, not reading content, so the serif reading face was the wrong call and matching the Notes sidebar's own `text-xs`/`stone-600` treatment makes the sidebar read as one system. Only the current chapter now takes full-strength ink plus `font-semibold`, so contrast carries the hierarchy instead of size. Numbers drop to 10 px, rows tighten to `py-1` on desktop while keeping the 44 px mobile target | components/TableOfContents.tsx | #2745 |
| 2026-08-27 | Contents panel titles wrap instead of clipping. #2745's first acceptance line is "no chapter title is truncated in the panel", but the panel shipped with `truncate`, so City of God's sixty-character headings still ellipsized — at sidebar width rather than the old 160 px select. The `title` tooltip was a mitigation, not the criterion. Rows grow to a second line where they must; the number column stays baseline-aligned to the first | components/TableOfContents.tsx | #2745 |
| 2026-08-27 | Contents panel marks which chapters are translated (#2754). The panel could already render the dot and state coverage in the row's accessible name, but nothing passed the data, so it never appeared. `/books/{id}/translation-status` now returns `translated_indices` beside its existing count — the reader already calls that endpoint for the coverage banner, so this costs no extra request. Absent indices leave the panel silent rather than claiming nothing is translated | routers/books.py, services/db.py, app/reader/[bookId]/page.tsx | #2754 |
## Wave 28 — The collapse flag removed (2026-08-27)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-27 | Dropped the per-chapter `Shouting` flag. Measured against 805 frozen chapters it fired 10 times and was wrong every time — all-caps chapter summaries in City of God, Hamlet's signed letters, an advertisement page in Dracula, the phrase "I O U" in Crime and Punishment. Faust, the drama it was built for, never triggered it. It cannot be tuned because it has no baseline: `epub_split_audit.py` detects collapse by comparing the EPUB path's paragraph count against the plain-text path's, and a single chapter has nothing to compare against. A flag that only fires on correct chapters trains you to ignore flags, and implies coverage that is not there | lib/chapterFlags.ts, tutorials/epub-upload.md, tutorials/publishing.md | drop-shouting |
| 2026-08-27 | Chapters can carry a `role`, so front matter leaves the reading path (#2755, phase 1). The Contents panel has been able to collapse a "Front matter" group since #2745, but nothing recorded which chapters are front matter. Migration 050 adds a nullable `book_chapters.role`; the resolver, the chapters endpoint and the reader carry it through. `role` sits outside `content_sha256` — which covers only index, title and paragraphs — so labelling a chapter moves no annotation anchor and changes no hash. No book is labelled yet: this is plumbing, and the panel looks unchanged until phase 2 labels the artifacts | migrations/050_book_chapters_role.sql, services/book_chapters.py, routers/books.py, app/reader/[bookId]/page.tsx | #2755 |
## Wave 27 — A reader can reopen their own audit (2026-08-27)

| Date | Change | File(s) | PR |
|------|--------|---------|----|
| 2026-08-27 | Confirming an upload froze it and the draft endpoints then refused, so a bad split spotted on page three was permanent — while an admin could edit any frozen book. The asymmetry was backwards: a reader's own private book with nothing anchored to it is the safest case to re-split. The chapters route now reopens a confirmed book's split in place, guarded by the same dependents check | routers/uploads.py, app/upload/[bookId]/chapters/page.tsx | reader-resplit |
| 2026-08-27 | Entry point on the book itself — **Review chapter split** in the detail modal for your own uploads, since a bad split is noticed while reading, not while browsing | components/BookDetailModal.tsx, app/bookshelf/page.tsx | reader-resplit |
| 2026-08-27 | The dependents guard moved to `services/db.split_dependents` so the owner path and the admin path share one definition of what makes a re-split unsafe | services/db.py, routers/admin.py | reader-resplit |
| 2026-08-27 | When both the draft and frozen loads fail, the page reports the draft error rather than the fallback's — reporting the fallback masked the real cause | app/upload/[bookId]/chapters/page.tsx | reader-resplit |
| 2026-08-27 | Vocabulary keeps a word's capitalisation (#2748). Every save was force-lowercased, so 5 of the 12 rows in the database were misspelled — `pracht` for **Pracht**, `schalk` for **Schalk**. In German capitalisation is lexical, not styling. The canonical form now comes from the dictionary lookup, which already answered `Schalk` and had its answer discarded; matching folds case instead, so English still normalises `The` to `the` and no case-twin entry can be created. Migration 051 makes the uniqueness constraint case-insensitive | services/db.py, migrations/051_vocabulary_case_insensitive_unique.sql | #2748 |
| 2026-08-30 | Hamlet's acts name the scene they contain (#2745). Gutenberg #1524 sets `ACT II` and `SCENE I. A room in Polonius’s house.` as consecutive lines, so the splitter cut at the act heading and the chapter holding Scene I was titled only "ACT II". Because Scene I never began a chapter of its own, no act's opening scene appeared anywhere in the Contents panel — a reader scanning twenty rows saw every act jump straight to SCENE II, with five scenes unreachable by name. Retitled rather than re-cut: splitting the act heading off would manufacture five one-line chapters and shift every later index, moving the anchors of the zh translation already recorded against chapter 0. Each title takes the scene's own location line verbatim from the chapter text. Unlike `role`, `title` sits inside `content_sha256`, so the artifact was regenerated and `book_freeze` re-stamped in the same change | scripts/chapter_split_overrides.py, migrations/056_hamlet_act_scene_titles.sql, data/books/book_1524.json | #2745 |
| 2026-08-30 | The five German nouns saved before the casing fix are corrected — Gesell, Laffe, Leichnam, Pracht, Schalk (#2768). The obvious approach, re-asking the dictionary, corrects nothing: Wiktionary answers for whatever string you give it, so `pracht` resolves to `pracht` and `Pracht` to `Pracht` (measured on the live data: 14 rows checked, 0 corrected). The evidence is the book text — each word appears capitalised mid-sentence in the stored `sentence_text`, where a capital is lexical rather than positional. `verheeren` is deliberately left alone despite appearing as `Verheeren`: that is a nominalised verb, and the stored lemma is the infinitive. Five hand-checked rows, not a rule | migrations/057_vocabulary_restore_noun_capitals.sql | #2768 |
| 2026-08-30 | Contents panel groups chapters under their part or act (#2745 Phase 2, first slice). The panel rendered one hardcoded group — Front matter — and is now an ordered list of sections: front matter first and collapsed because it is apparatus, part groups after it and expanded because they are the reading path, and chapters belonging to no part at top level with no header at all. A section holding the current chapter stays open however it was left, extending the rule front matter already followed. The filter keeps a header whose rows survive and drops one whose rows all fail. Row design is unchanged — a group header is a row inserted between chapter rows. Hamlet is the first book grouped: its five acts now carry the act name, so the five leaf titles #2769 wrote as "ACT I, SCENE I. …" drop the prefix that would otherwise read twice. The audited scene locations survive; only the prefix moved into the header | components/TableOfContents.tsx, app/reader/[bookId]/page.tsx, scripts/chapter_split_overrides.py, migrations/058_book_chapters_part.sql, migrations/059_hamlet_act_groups.sql | #2745 |
| 2026-08-30 | Crime and Punishment and Madame Bovary group by part (#2745 Phase 2, slice 2). C&P is the case grouping exists for: six parts whose only signal is the numbering reset, so the panel showed `CHAPTER I` six times with nothing to tell them apart, and the parts appear in no title at all. Its epilogue and its two apparatus chapters stay ungrouped — a one-chapter group would assert a structure the work does not have. Madame Bovary carried the same defect #2769 repaired in Hamlet: `PREMIÈRE PARTIE` *is* Part 1 Chapter I, so the panel jumped from the part name straight to II and Chapter I was unreachable by name in all three parts; the numeral is restored and the part moves to the header. A Room with a View is deliberately absent — see the PR for the pre-existing translation-remap defect that blocks re-freezing it | scripts/chapter_split_overrides.py, migrations/060_cp_bovary_part_groups.sql, data/books/book_2554.json, data/books/book_14155.json | #2745 |
| 2026-08-30 | A Room with a View gets its chapter subtitles back and groups by part (#2745 Phase 2, final slice). Forster subtitles every chapter and the printed contents lists them, but the splitter kept only the numeral — twenty rows reading `Chapter I` … `Chapter XX`, saying nothing about the book. Titles now come from the contents listing's own punctuated form (`Chapter I. The Bertolini`). Restored title-only and never moved: every subtitle is also the chapter's first paragraph, and moving it out would have left chapter 19's 57-paragraph zh translation against 56 English paragraphs. Part Two's titles were composed as `PART TWO — Chapter VIII` — the lossy composition the superseded multi-level design complained about, since it could not be collapsed and the leaf never round-tripped out; the prefix now sits in the group header. Chapter VI's 200-character subtitle is carried verbatim per the owner's decision to show the work's own words, and wraps rather than clipping per #2745's no-truncation line. This completes Phase 2: all four books with part structure are grouped | scripts/chapter_split_overrides.py, migrations/061_room_with_a_view_subtitles.sql, data/books/book_2641.json | #2745 |
| 2026-08-30 | Admin books list shows and filters audit state. A frozen, published book carried no badge at all — you inferred "this is in the library" from the presence of a Remove button — so it now reads `frozen · in library`, with the freeze date and auditor in the tooltip. An **Audit state** dropdown filters the list: not audited / frozen (any) / awaiting review / in library, narrowing alongside the search box. Freeze and publish stay two separate facts, so "frozen (any)" and "awaiting review" are distinct options rather than one. The empty state now names whichever filter emptied the list instead of falling through to `No books match ""` | app/admin/books/page.tsx | #2745 |
| 2026-08-30 | Front matter labelled for every remaining book that opens on apparatus (#2755). Migration 052 covered the three declared at the time; these are the rest — City of God's T. & T. Clark title page, printed contents and editor's preface; Das Stunden-Buch's Insel-Verlag imprint; The King in Yellow's dedication page; Madame Bovary's `Table des matières` and dedications; and Crime and Punishment's translator's preface, which #2755 names as apparatus explicitly. Two are judgements rather than clear cases — King in Yellow carries Cassilda's Song and Bovary carries Flaubert's dedications — and both are marked because front matter is collapsed, never deleted: the chapter keeps its index and every paragraph, one click away. Deliberately still unmarked: Wilde's own preface, Stoker's prefatory note, Gatsby's epigraph (retitled instead) and Moby Dick's Etymology and Extracts | scripts/chapter_split_overrides.py, migrations/062_label_remaining_frontmatter.sql, data/books/*.json | #2755 |
| 2026-08-31 | Admins could not upload at all. `GET /upload/quota` returns `max: null` for them — no limit — but the page compared `used >= max`, and `3 >= null` coerces to `3 >= 0`, so the quota read as permanently full: the dropzone was disabled and "Upload limit reached" was shown to the one role with no cap. The bar compounded it (`3 / null` is Infinity, clamped to 100%) and the label rendered "3 / " with nothing after it. The TypeScript type said `max: number`, which is why it went unseen. An unlimited quota now reads `3 uploaded · No limit` and draws no bar, since a bar needs a denominator | app/(shell)/upload/page.tsx, lib/api.ts | #2789 |
