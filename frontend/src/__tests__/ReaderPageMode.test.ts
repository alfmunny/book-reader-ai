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
    expect(src).toContain("flow.style.columnWidth");
    expect(src).toContain("translateX(");
    expect(src).not.toMatch(/paragraphs\.slice\(\s*pageIndex/);
  });

  it("derives the page count from the laid-out flow width", () => {
    expect(src).toContain("flow.scrollWidth / step");
    expect(src).toContain("Math.max(1,");
    // and never lets a stale index outlive a reflow
    expect(src).toContain("setPageIndex((i) => Math.min(i, count - 1))");
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
    expect(src).toContain("setPageIndex(wantLastPage.current ? count - 1 : 0)");
    expect(src).not.toContain("}, [chapterIndex, readerMode]);");
  });

  it("continues into the neighbouring chapter instead of dead-ending", () => {
    const turn = src.slice(src.indexOf("const turnPage ="), src.indexOf("// Track scroll progress"));
    expect(turn).toContain("wantLastPage.current = true");
    expect(turn).toContain("goToChapter(chapterIndex - 1)");
    expect(turn).toContain("goToChapter(chapterIndex + 1)");
    // the controls only stop at the two ends of the book
    expect(src).toContain("disabled={pageIndex === 0 && chapterIndex === 0}");
    expect(src).toContain("disabled={pageIndex >= pageCount - 1 && chapterIndex >= chapters.length - 1}");
  });

  it("clips at the page edge, not the reader's edge", () => {
    expect(src).toContain('data-testid="reader-page-clip"');
    expect(src).toContain('clip.style.overflow = "hidden"');
    expect(src).toContain("clip.style.width = `${width}px`");
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
