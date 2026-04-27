import * as fs from "fs";
import * as path from "path";

// reader/[bookId]/page.tsx Gemini-reminder Dismiss button used
// text-amber-500 on amber-50 (≈2.5:1) — failed WCAG 1.4.11. Closes #1648.

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Gemini reminder Dismiss button contrast (closes #1648)", () => {
  it("Dismiss button does not use text-amber-500", () => {
    // Match the className on a button whose aria-label="Dismiss".
    const re = /className="([^"]*)"\s+aria-label="Dismiss"/g;
    const matches = Array.from(src.matchAll(re));
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m[1]).not.toMatch(/text-amber-500/);
    }
  });
});
