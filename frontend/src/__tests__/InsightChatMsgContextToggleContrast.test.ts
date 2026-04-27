import * as fs from "fs";
import * as path from "path";

// MsgContextChip more/less toggle (InsightChat.tsx) still used
// text-amber-500 (≈2.6:1 on amber-50/80) — fails WCAG 1.4.3 AA. The outer
// ContextChip was fixed in PR #1565; this inner sibling was missed.
// Closes #1641.

const src = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8",
);

describe("InsightChat MsgContextChip toggle contrast (closes #1641)", () => {
  it("Toggle context button does not use text-amber-500", () => {
    // Find every Toggle context button in the file and assert none use
    // text-amber-500 in its className.
    const re = /className="([^"]*)"\s+aria-label="Toggle context"/g;
    const matches = Array.from(src.matchAll(re));
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m[1]).not.toMatch(/text-amber-500/);
    }
  });
});
