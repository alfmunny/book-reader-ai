import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader annotation edit button touch target (closes #828)", () => {
  it("Edit annotation button has min-h-[44px]", () => {
    const idx = src.indexOf("Edit annotation");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("min-h-[44px]");
  });

  it("Edit annotation button has min-w-[44px]", () => {
    const idx = src.indexOf("Edit annotation");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("min-w-[44px]");
  });
});
