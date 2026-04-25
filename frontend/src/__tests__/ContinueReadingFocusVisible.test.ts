/**
 * Static assertion: home page Continue Reading button has focus-visible ring + lift.
 * Closes #1145
 */
import fs from "fs";
import path from "path";

const homePage = fs.readFileSync(
  path.join(process.cwd(), "src/app/page.tsx"),
  "utf8",
);

describe("Home page Continue Reading focus-visible", () => {
  it("Continue Reading button has focus-visible ring + lift", () => {
    const idx = homePage.indexOf('aria-label="Continue reading"');
    expect(idx).toBeGreaterThan(0);
    const block = homePage.slice(idx, idx + 800);
    expect(block).toContain("focus-visible:-translate-y-0.5");
    expect(block).toContain("focus-visible:ring-2");
    expect(block).toContain("focus-visible:outline-none");
  });

  it("Continue Reading button has onFocus/onBlur handlers", () => {
    const idx = homePage.indexOf('aria-label="Continue reading"');
    const block = homePage.slice(idx, idx + 1500);
    expect(block).toMatch(/onFocus=/);
    expect(block).toMatch(/onBlur=/);
  });
});
