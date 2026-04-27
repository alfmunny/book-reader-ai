import * as fs from "fs";
import * as path from "path";

// notes/[bookId] section-toggle chevrons used text-amber-400 (≈2.18:1
// on white) — failed WCAG 1.4.11 (3:1 for state indicators on UI
// components). Closes #1662.

const src = fs.readFileSync(
  path.join(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf8",
);

describe("notes-by-book section chevron contrast (closes #1662)", () => {
  it("ChevronRightIcon does not use text-amber-400", () => {
    const re = /<ChevronRightIcon\s+className="([^"]*)"/g;
    const matches = Array.from(src.matchAll(re));
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m[1]).not.toMatch(/text-amber-400/);
    }
  });

  it("ChevronDownIcon does not use text-amber-400", () => {
    const re = /<ChevronDownIcon\s+className="([^"]*)"/g;
    const matches = Array.from(src.matchAll(re));
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m[1]).not.toMatch(/text-amber-400/);
    }
  });
});
