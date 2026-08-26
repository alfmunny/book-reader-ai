import * as fs from "fs";
import * as path from "path";

// page.tsx Continue-reading card used text-amber-400 on the trailing
// ArrowRightIcon (≈2.18:1 on white) — failed WCAG 1.4.11. Closes #1646.

const src = fs.readFileSync(
  path.join(__dirname, "../app/bookshelf/page.tsx"),
  "utf8",
);

describe("homepage continue-reading arrow contrast (closes #1646)", () => {
  it("ArrowRightIcon never pairs with text-amber-400 in a className", () => {
    const re = /<ArrowRightIcon\s+className="([^"]*)"/g;
    const matches = Array.from(src.matchAll(re));
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m[1]).not.toMatch(/text-amber-400/);
    }
  });
});
