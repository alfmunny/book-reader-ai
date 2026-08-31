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
    expect(src).not.toContain("x + pageIndex * step");
    // A wrapped sentence has fragments in two columns; the union rect starts
    // in the earlier one, which landed the reader a page behind the line.
    expect(src).toContain("const rects = Array.from(el.getClientRects());");
    // Columns are identified from each fragment's CENTRE. Text begins a pixel
    // or two before the column box (column k starts at k*step - 2), so
    // flooring the left edge yields k - 1 for every column past the first.
    expect(src).toContain("const c = Math.floor((r.left + r.width / 2 - origin) / step);");
    expect(src).not.toContain("Math.floor((r.left - origin) / step)");
    expect(src).toContain("widthByColumn.set(c, (widthByColumn.get(c) ?? 0) + r.width);");
    expect(src).toContain("if (w > widest) { widest = w; column = c; }");
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
    // audio follow — delegated in BOTH modes now, so the follow toggle
    // governs scrolling as well as turning (2026-08-31)
    expect(reader).toContain("if (followRef.current) {");
    // search jump target
    expect(reader).toContain("if (paginated && followRef.current) followRef.current(el);");
    expect(src).toContain('paginated={readerMode === "page"}');
    // handleFollowSegment wraps revealElement so the follow can be paused
    expect(src).toContain("onFollowSegment={handleFollowSegment}");
  });
});

describe("following must not fight the reader (owner, 2026-08-31)", () => {
  it("keeps the follow callback out of the effects' dependency lists", () => {
    // With it in, every turn gave the effects a new function, re-fired the
    // follow and snapped the page back — pages could not be turned at all.
    expect(reader).toContain("const followRef = useRef(onFollowSegment);");
    expect(reader).toContain("}, [currentIdx, isPlaying, paginated]);");
    expect(reader).toContain("}, [scrollTargetSentence, paginated]);");
    expect(reader).not.toContain("onFollowSegment]);");
  });

  it("does not churn revealElement's identity on every turn", () => {
    expect(src).toContain("setPageIndex((prev) => (prev === target ? prev : target));");
    expect(src).toContain("}, [readerMode, perView, pageCount]);");
  });
});
