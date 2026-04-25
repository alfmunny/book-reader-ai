import * as fs from "fs";
import * as path from "path";

function countAmber600AtSmallSize(content: string): number {
  const matches = content.match(/className="[^"]*text-(?:xs|sm)[^"]*text-amber-600[^"]*"/g) ?? [];
  const matches2 = content.match(/className="[^"]*text-amber-600[^"]*text-(?:xs|sm)[^"]*"/g) ?? [];
  return new Set([...matches, ...matches2]).size;
}

function read(rel: string) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("WCAG 1.4.3 contrast — text-amber-600 at small sizes (wave 10) (closes #1392)", () => {
  it("ReadingStats.tsx has no text-amber-600 at xs/sm", () => {
    expect(countAmber600AtSmallSize(read("components/ReadingStats.tsx"))).toBe(0);
  });
  it("WordActionDrawer.tsx has no text-amber-600 at xs/sm", () => {
    expect(countAmber600AtSmallSize(read("components/WordActionDrawer.tsx"))).toBe(0);
  });
  it("QueueTab.tsx has no text-amber-600 at xs/sm", () => {
    expect(countAmber600AtSmallSize(read("components/QueueTab.tsx"))).toBe(0);
  });
  it("VocabWordTooltip.tsx has no text-amber-600 at xs/sm", () => {
    expect(countAmber600AtSmallSize(read("components/VocabWordTooltip.tsx"))).toBe(0);
  });
  it("SeedPopularButton.tsx has no text-amber-600 at xs/sm", () => {
    expect(countAmber600AtSmallSize(read("components/SeedPopularButton.tsx"))).toBe(0);
  });
  it("ChapterSummary.tsx has no text-amber-600 at xs/sm", () => {
    expect(countAmber600AtSmallSize(read("components/ChapterSummary.tsx"))).toBe(0);
  });
  it("BookDetailModal.tsx has no text-amber-600 at xs/sm", () => {
    expect(countAmber600AtSmallSize(read("components/BookDetailModal.tsx"))).toBe(0);
  });
  it("upload/[bookId]/chapters/page.tsx has no text-amber-600 at xs/sm", () => {
    expect(
      countAmber600AtSmallSize(read("app/upload/[bookId]/chapters/page.tsx")),
    ).toBe(0);
  });
});
