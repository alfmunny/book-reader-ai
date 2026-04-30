/**
 * Regression test for #2350: search page "Library" back link was missing
 * focus-visible ring (WCAG 2.4.7).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/search/page.tsx"),
  "utf8",
);

describe("Search page back link focus ring (closes #2350)", () => {
  it("Library back link (ArrowLeftIcon + Library text) has focus-visible:ring-amber-400", () => {
    // Anchor on the ArrowLeftIcon inside the back link — unique to the header nav link
    const idx = src.indexOf('ArrowLeftIcon className="w-3.5 h-3.5 mr-1 inline"');
    expect(idx).toBeGreaterThan(-1);
    // Look backward into the containing <Link> element for focus ring
    const window = src.slice(Math.max(0, idx - 250), idx + 30);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Library back link has focus:outline-none", () => {
    const idx = src.indexOf('ArrowLeftIcon className="w-3.5 h-3.5 mr-1 inline"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 250), idx + 30);
    expect(window).toContain("focus:outline-none");
  });
});
