/**
 * Regression test for #1334: ReadingStats heatmap must have role="img"
 * and a descriptive aria-label so screen readers announce the visualization.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/ReadingStats.tsx"),
  "utf8",
);

describe("ReadingStats heatmap accessible text alternative (closes #1334)", () => {
  it('heatmap container has role="img"', () => {
    const idx = src.indexOf("Activity — last year");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 500), idx + 50);
    expect(window).toContain('role="img"');
  });

  it("heatmap container has aria-label referencing activeDays", () => {
    const idx = src.indexOf("Activity — last year");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 500), idx + 50);
    expect(window).toContain("aria-label");
    expect(window).toContain("activeDays");
  });
});
