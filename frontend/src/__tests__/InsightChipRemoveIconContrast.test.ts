import * as fs from "fs";
import * as path from "path";

// text-amber-400 (#fbbf24) on white measures ≈2.2:1 — fails WCAG 1.4.11
// (≥3:1 for graphical UI components). Closes #1562.

const src = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8",
);

describe("InsightChat ContextChip Remove button icon meets 1.4.11 (closes #1562)", () => {
  it("Remove context button does not use text-amber-400", () => {
    const idx = src.indexOf('aria-label="Remove context"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).not.toMatch(/text-amber-400/);
  });
});
