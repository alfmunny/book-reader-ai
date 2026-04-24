import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8"
);

describe("Homepage stats toggle touch target (closes #815)", () => {
  it("Show activity button has min-h-[44px]", () => {
    // Find the stats toggle button by its unique text content
    const idx = src.indexOf("Hide activity");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("min-h-[44px]");
  });

  it("Show activity button has px-2 for horizontal padding", () => {
    const idx = src.indexOf("Hide activity");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("px-2");
  });

  it("Show activity button has flex items-center", () => {
    const idx = src.indexOf("Hide activity");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("flex items-center");
  });
});
