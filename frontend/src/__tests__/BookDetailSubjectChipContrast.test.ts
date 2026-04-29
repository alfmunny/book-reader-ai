import * as fs from "fs";
import * as path from "path";

// BookDetailModal subject chips used text-xs text-stone-500 on
// bg-stone-100 (≈3.5:1) — failed WCAG 1.4.3 AA (4.5:1 needed for normal
// text under 18pt). Closes #1667.

const src = fs.readFileSync(
  path.join(__dirname, "../components/BookDetailModal.tsx"),
  "utf8",
);

describe("BookDetailModal subject chip contrast (closes #1667)", () => {
  it("no className combines base bg-stone-100 with base text-stone-500 (4.23:1, fails AA)", () => {
    // Walk every className=\"…\" string and check whether it has both
    // bg-stone-100 AND text-stone-500 as space-separated *base* tokens.
    // text-stone-500 on bg-stone-100 is ~4.23:1 — fails WCAG AA.
    // The correct token is text-stone-600 (6.72:1 on stone-100).
    const re = /className="([^"]*)"/g;
    for (const m of src.matchAll(re)) {
      const tokens = m[1].split(/\s+/);
      if (tokens.includes("bg-stone-100") && tokens.includes("text-stone-500")) {
        throw new Error(`Forbidden class combo on chip: "${m[1]}"`);
      }
    }
  });
});
