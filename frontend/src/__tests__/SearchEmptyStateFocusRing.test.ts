/**
 * Static-analysis test: the search page's no-results empty state CTA Link
 * must carry focus-visible:ring classes consistent with the design system.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/(shell)/search/page.tsx"),
  "utf-8"
);

describe("Search empty-state CTA focus ring", () => {
  it("Browse books Link has focus:outline-none", () => {
    // Find the Link near "Browse books" and assert focus styles
    const idx = src.indexOf("Browse books");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 400), idx + 50);
    expect(window).toContain("focus:outline-none");
  });

  it("Browse books Link has focus-visible:ring-2", () => {
    const idx = src.indexOf("Browse books");
    const window = src.slice(Math.max(0, idx - 400), idx + 50);
    expect(window).toContain("focus-visible:ring-2");
  });

  it("Browse books Link has focus-visible:ring-amber-400", () => {
    const idx = src.indexOf("Browse books");
    const window = src.slice(Math.max(0, idx - 400), idx + 50);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});
