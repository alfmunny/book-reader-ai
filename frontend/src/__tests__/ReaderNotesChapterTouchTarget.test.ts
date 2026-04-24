import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader notes chapter-section collapse button touch target (closes #831)", () => {
  it("chapter-section collapse button has min-h-[44px]", () => {
    const idx = src.indexOf("Chapter {ch + 1}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 750), idx + 50);
    expect(window).toContain("min-h-[44px]");
  });

  it("chapter-section collapse button uses ChevronRightIcon (not unicode)", () => {
    const idx = src.indexOf("Chapter {ch + 1}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 100);
    expect(window).not.toContain("▶");
    expect(window).not.toContain("▼");
  });
});
