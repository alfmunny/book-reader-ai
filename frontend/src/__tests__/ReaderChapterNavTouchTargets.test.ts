import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("reader chapter nav touch targets (closes #869)", () => {
  it("Previous chapter button has min-h-[44px]", () => {
    const idx = src.indexOf('"Previous chapter"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("Next chapter button has min-h-[44px]", () => {
    const idx = src.indexOf('"Next chapter"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });
});
