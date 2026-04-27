import * as fs from "fs";
import * as path from "path";

// reader/[bookId]/page.tsx overlays a ChevronDownIcon on the chapter
// <select> using text-amber-500 (≈2.74:1 on white) — fails WCAG 1.4.11
// (3:1 needed for non-text UI component indicators). Closes #1644.

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("reader chapter-select chevron contrast (closes #1644)", () => {
  it("ChevronDownIcon never pairs with text-amber-500 in a className", () => {
    const re = /<ChevronDownIcon\s+className="([^"]*)"/g;
    const matches = Array.from(src.matchAll(re));
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m[1]).not.toMatch(/text-amber-500/);
    }
  });
});
