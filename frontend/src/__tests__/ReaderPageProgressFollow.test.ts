import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);
const reader = fs.readFileSync(
  path.join(__dirname, "../components/SentenceReader.tsx"),
  "utf8",
);

describe("page-aware progress (collision 1, #2786)", () => {
  it("takes within-chapter progress from the page position while paginated", () => {
    expect(src).toContain("const chapterFraction = useMemo(");
    expect(src).toContain('if (readerMode !== "page") return scrollProgress / 100;');
    expect(src).toContain("Math.min(1, (pageIndex + perView) / pageCount)");
    // a chapter that fits in one leaf is fully read
    expect(src).toContain("if (pageCount <= perView) return 1;");
  });

  it("routes every progress readout through the one fraction", () => {
    // The bar froze in page mode because three places read scrollProgress
    // directly; none may do so again.
    expect(src).toContain("aria-valuenow={Math.round(((chapterIndex + chapterFraction) / chapters.length) * 100)}");
    expect(src).not.toContain("chapterIndex + scrollProgress / 100");
  });
});

describe("page-aware TTS follow (collision 2, #2786)", () => {
  it("turns to the column holding the element instead of scrolling", () => {
    expect(src).toContain("const revealElement = useCallback(");
    expect(src).toContain('if (readerMode !== "page") {');
    expect(src).toContain('el.scrollIntoView({ block: "nearest" });');
    // Both rects move with the transform, so their difference is already
    // untranslated — adding the page offset would double-count it.
    expect(src).toContain("const column = Math.floor(x / step);");
    expect(src).not.toContain("x + pageIndex * step");
    expect(src).toContain("perView * Math.floor(column / perView)");
  });

  it("leaves no bare scrollIntoView on the sentence-navigation paths", () => {
    expect(src).not.toContain('[data-seg="${next}"]`)?.scrollIntoView');
    expect(src).not.toContain('[data-seg="${segs[0]}"]`)?.scrollIntoView');
    expect((src.match(/revealSegment\(/g) ?? []).length).toBe(3);
  });

  it("hands audio-follow and the search jump to the reader when paginated", () => {
    expect(reader).toContain("paginated?: boolean;");
    expect(reader).toContain("onFollowSegment?: (el: HTMLElement) => void;");
    // audio follow
    expect(reader).toContain("if (paginated && onFollowSegment) {\n      onFollowSegment(el);\n      return;\n    }");
    // search jump target
    expect(reader).toContain("if (paginated && onFollowSegment) onFollowSegment(el);");
    expect(src).toContain('paginated={readerMode === "page"}');
    expect(src).toContain("onFollowSegment={revealElement}");
  });
});
