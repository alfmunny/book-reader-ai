/**
 * Regression test for #2577:
 * "Continue reading" home card must include the book title in its aria-label
 * so screen readers convey which book the link opens (WCAG 2.4.4).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8",
);

describe("Continue reading link includes book title in aria-label (closes #2577)", () => {
  it("aria-label on continue-reading link includes book title interpolation", () => {
    const idx = src.indexOf("Continue Reading");
    expect(idx).not.toBe(-1);
    // Look within 800 chars for the Link's aria-label
    const block = src.slice(idx, idx + 800);
    // Must interpolate the book title, not just be a static string
    expect(block).toMatch(/aria-label=\{`Continue reading \$\{/);
  });

  it("aria-label references recentBooks[0].title", () => {
    const idx = src.indexOf("Continue Reading");
    expect(idx).not.toBe(-1);
    const block = src.slice(idx, idx + 800);
    expect(block).toContain("recentBooks[0].title");
  });
});
