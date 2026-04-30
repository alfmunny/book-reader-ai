/**
 * Regression test for #2362: QueueTab section-header spinners (loadingCost,
 * loadingItems) were missing role="status" — screen readers got no
 * announcement when those sections were fetching data.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8",
);

describe("QueueTab header spinner role=status (closes #2362)", () => {
  it('loadingCost spinner is wrapped in role="status"', () => {
    const idx = src.indexOf("loadingCost && (");
    expect(idx).toBeGreaterThan(-1);
    const vicinity = src.slice(idx, idx + 200);
    expect(vicinity).toMatch(/role="status"/);
  });

  it('loadingItems header spinner is wrapped in role="status"', () => {
    // The items-header spinner uses the fixed-width slot comment as anchor
    const idx = src.indexOf("Spinner slot has fixed width");
    expect(idx).toBeGreaterThan(-1);
    const vicinity = src.slice(idx, idx + 400);
    expect(vicinity).toMatch(/role="status"/);
  });
});
