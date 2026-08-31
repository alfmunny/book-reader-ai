import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);
const css = fs.readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
const settings = fs.readFileSync(path.join(__dirname, "../lib/settings.ts"), "utf8");

describe("reader page mode — slice 1 (design: reading-modes.md, #2784)", () => {
  it("persists readerMode per profile like every other reading preference", () => {
    expect(settings).toContain('export type ReaderMode = "scroll" | "page"');
    expect(settings).toContain("readerMode: ReaderMode;");
    expect(settings).toContain('readerMode: "scroll",');
    // restored in the same effect that restores theme / fontSize / contentWidth
    expect(src).toContain('setReaderMode(s.readerMode ?? "scroll")');
    expect(src).toContain("saveSettings({ readerMode: next })");
  });

  it("paginates with CSS columns, not by re-rendering a slice of the chapter", () => {
    // The mechanism's whole justification: one DOM, only a transform changes,
    // so note anchors and data-seg spans survive a mode switch as the same
    // nodes. A JS-chunking implementation would slice the paragraph list here.
    expect(css).toContain(".reader-paged");
    expect(css).toContain("column-fill: auto");
    expect(src).toContain("flow.style.columnCount");
    expect(src).toContain("translateX(");
    expect(src).not.toMatch(/paragraphs\.slice\(\s*pageIndex/);
  });

  it("derives the page count from the laid-out flow width", () => {
    expect(src).toContain("flow.scrollWidth / step");
    expect(src).toContain("Math.max(1,");
    // and never lets a stale index outlive a reflow — snapping to a leaf
    // start, since count - 1 is an odd column when count is even
    expect(src).toContain("setPageIndex((i) => columns * Math.floor(Math.min(i, lastLeaf) / columns));");
  });

  it("re-measures whenever anything that reflows the text changes", () => {
    const effect = src.slice(src.indexOf("useLayoutEffect(() => {\n    measurePages();"));
    const deps = effect.slice(0, effect.indexOf("]"));
    for (const dep of ["chapterIndex", "fontSize", "lineHeight", "contentWidth", "fontFamily", "translationEnabled", "displayMode"]) {
      expect(deps).toContain(dep);
    }
  });

  it("gives arrows to pages while paginated and chapters to the brackets", () => {
    expect(src).toContain('e.key === "ArrowLeft" && readerMode === "page"');
    expect(src).toContain('e.key === "ArrowRight" && readerMode === "page"');
    // the scroll-mode chapter bindings survive untouched
    expect(src).toContain('e.key === "ArrowLeft" && chapterIndex > 0');
    expect(src).toContain('e.key === "["');
    expect(src).toContain('e.key === "]"');
  });

  it("closes rect-positioned overlays on a turn (collision 5)", () => {
    const turn = src.slice(src.indexOf("const turnPage ="), src.indexOf("// Track scroll progress"));
    expect(turn).toContain("setPostsDialog(null)");
    expect(turn).toContain("removeAllRanges");
  });

  it("lets measurement decide where a new chapter opens, so nothing races it", () => {
    // A separate chapter effect would fight measurePages: the layout effect
    // lands on the last page, then the later effect resets it to zero.
    expect(src).toContain("measuredChapter.current !== chapterIndex");
    expect(src).toContain("wantLastPage.current ? columns * Math.floor((count - 1) / columns) : 0");
    expect(src).not.toContain("}, [chapterIndex, readerMode]);");
  });

  it("continues into the neighbouring chapter instead of dead-ending", () => {
    const turn = src.slice(src.indexOf("const turnPage ="), src.indexOf("// Track scroll progress"));
    expect(turn).toContain("wantLastPage.current = true");
    expect(turn).toContain("goToChapter(chapterIndex - 1)");
    expect(turn).toContain("goToChapter(chapterIndex + 1)");
    // the controls only stop at the two ends of the book
    expect(src).toContain("disabled={pageIndex === 0 && chapterIndex === 0}");
  });

  it("clips at the page edge, not the reader's edge", () => {
    expect(src).toContain('data-testid="reader-page-clip"');
    expect(src).toContain('clip.style.overflow = "hidden"');
    expect(src).toContain("clip.style.width = `${viewWidth}px`");
  });

  it("clips columns instead of scrolling them", () => {
    expect(src).toContain('readerMode === "page" ? "overflow-hidden" : "overflow-y-auto"');
  });

  it("keeps the toggle out of parallel translation and off small screens", () => {
    const btn = src.slice(src.indexOf('data-testid="reader-mode-toggle"') - 900);
    expect(btn).toContain("disabled={parallelOn}");
    expect(btn).toContain("hidden lg:flex");
    expect(btn).toContain("Page mode needs inline translation");
  });
});

describe("two-page spread (owner, 2026-08-31)", () => {
  it("shows two equal halves once each one is still a readable measure", () => {
    expect(src).toContain("const half = (avail - PAGE_GUTTER) / 2");
    expect(src).toContain("const spread = half >= MIN_PAGE");
    // Halves narrow to fit rather than demanding two FULL measures, which
    // would need ~1600px before chrome — no ordinary laptop would qualify.
    expect(src).toContain("Math.min(measure, half)");
    expect(src).toContain("colWidth * 2 + PAGE_GUTTER");
  });

  it("turns by the leaf, not by a single page", () => {
    expect(src).toContain("pageIndex + delta * perView");
    expect(src).toContain("disabled={pageIndex + perView > pageCount - 1 && chapterIndex >= chapters.length - 1}");
  });

  it("names both pages of a spread in the readout", () => {
    expect(src).toContain("`Pages ${pageIndex + 1}\u2013${Math.min(pageIndex + perView, pageCount)} of ${pageCount}`");
  });
});

describe("chapter entry is a cut, not a turn (owner, 2026-08-31)", () => {
  it("suppresses the transition when a new chapter lands on its page", () => {
    expect(src).toContain("skipTurnAnim");
    // set on chapter change and on a mode switch — both replace the content
    const measure = src.slice(src.indexOf("const chapterChanged ="));
    expect(measure.slice(0, 300)).toContain("skipTurnAnim.current = true");
    expect(src).toContain("useEffect(() => { skipTurnAnim.current = true; setPageIndex(0); }, [readerMode]);");
  });

  it("commits the jump before restoring the transition", () => {
    // Without the forced reflow the browser can coalesce the two style writes
    // and animate anyway — the bug this guards against.
    expect(src).toContain('flow.style.transition = "none"');
    expect(src).toContain("void flow.offsetHeight");
    expect(src).toContain('flow.style.transition = ""');
  });
});

describe("chapter nav does not linger behind the turn controls", () => {
  it("is scroll-mode only — page turns already cross chapters", () => {
    // It sat behind the turn-control row with its edges still clickable
    // (owner, 2026-08-31).
    expect(src).toContain('{readerMode !== "page" && (');
    const nav = src.slice(src.indexOf('{readerMode !== "page" && ('));
    expect(nav.slice(0, 1400)).toContain('data-testid="bottom-prev-chapter"');
  });
});
