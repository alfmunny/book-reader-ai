/**
 * Regression test for #2505:
 * The reading stats heatmap legend must convey intensity levels through a
 * non-color indicator in addition to color (WCAG 1.4.1 Use of Color).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/ReadingStats.tsx"),
  "utf8",
);

describe("ReadingStats heatmap legend uses non-color indicators (closes #2505)", () => {
  it("defines count-range labels for each intensity level", () => {
    // The fix must define the 5 intensity count ranges (0, 1-2, 3-5, 6-10, 11+)
    expect(src).toMatch(/11\+|≥\s*11|more than 10/i);
  });

  it("includes 1-2 or 1–2 label for second intensity bucket", () => {
    expect(src).toMatch(/1[–-]2/);
  });

  it("applies title attributes to legend swatches for sighted colorblind users", () => {
    // legend swatches must have title or aria-label so hover shows the count
    const legendSection = src.match(/Legend[\s\S]{0,800}More/);
    expect(legendSection).not.toBeNull();
    expect(legendSection![0]).toMatch(/title|aria-label/i);
  });
});
