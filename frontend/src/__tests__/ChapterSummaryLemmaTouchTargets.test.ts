import * as fs from "fs";
import * as path from "path";

const chapterSummary = fs.readFileSync(
  path.join(__dirname, "../components/ChapterSummary.tsx"),
  "utf8"
);
const readerPage = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

function checkBefore(src: string, anchor: string, before = 300): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, idx - before), idx + 20);
  expect(window).toContain("min-h-[44px]");
}

function checkForward(src: string, anchor: string, radius = 200): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(idx, idx + radius);
  expect(window).toContain("min-h-[44px]");
}

describe("ChapterSummary error/empty state and vocab lemma button touch targets (closes #879, #880)", () => {
  it("ChapterSummary Try again button has min-h-[44px]", () => {
    checkBefore(chapterSummary, "Try again");
  });

  it("ChapterSummary Generate Summary CTA has min-h-[44px]", () => {
    checkBefore(chapterSummary, "Generate Summary");
  });

  it("reader vocab lemma header button has min-h-[44px]", () => {
    // The lemma header links to vocabulary detail — unique onClick containing encodeURIComponent(w.word)
    checkForward(readerPage, "encodeURIComponent(w.word)");
  });
});
