import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader theme-cycle button aria-label (closes #1012)", () => {
  it("theme button has aria-label attribute", () => {
    // Find the cycleTheme button
    const idx = src.indexOf("onClick={cycleTheme}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain("aria-label");
  });

  it("theme button aria-label references the theme", () => {
    const idx = src.indexOf("onClick={cycleTheme}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    // aria-label should include the theme variable or the word "Theme"
    expect(window).toMatch(/aria-label=.*[Tt]heme/);
  });
});
