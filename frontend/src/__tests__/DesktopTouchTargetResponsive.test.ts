import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "../../src");

function readSrc(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Desktop touch-target responsive sizing (closes #1052)", () => {
  it("reader page has md:min-h-0 on header toolbar buttons", () => {
    const src = readSrc("app/reader/[bookId]/page.tsx");
    expect(src).toMatch(/md:min-h-0/);
  });

  it("reader page has at least 8 responsive md:min-h-0 instances for toolbar buttons", () => {
    const src = readSrc("app/reader/[bookId]/page.tsx");
    const count = (src.match(/md:min-h-0/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(10);
  });

  it("reader page Library back button uses responsive min-h", () => {
    const src = readSrc("app/reader/[bookId]/page.tsx");
    expect(src).toMatch(/aria-label="Library"[^>]*min-h-\[44px\] md:min-h-0/s);
  });

  it("reader page desktop toolbar buttons (hidden md:flex) use md:min-h-0", () => {
    const src = readSrc("app/reader/[bookId]/page.tsx");
    // No hidden md:flex button should have unconditional min-h-[44px] without md:min-h-0
    const lines = src.split("\n");
    const violations = lines.filter(
      (l) => l.includes("hidden md:flex") && l.includes("min-h-[44px]") && !l.includes("md:min-h-0")
    );
    expect(violations).toHaveLength(0);
  });
});
