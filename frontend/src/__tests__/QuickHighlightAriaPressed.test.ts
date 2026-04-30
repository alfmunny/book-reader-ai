/**
 * Regression tests for #2356: QuickHighlightPanel color buttons were missing
 * aria-pressed — screen readers could not identify which color was active.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QuickHighlightPanel.tsx"),
  "utf8",
);

describe("QuickHighlightPanel color button aria-pressed (closes #2356)", () => {
  it("color buttons have aria-pressed attribute", () => {
    // aria-pressed must be present in the color button block
    expect(src).toContain("aria-pressed=");
  });

  it("aria-pressed reflects existingAnnotation color match", () => {
    // The pressed state should be tied to whether this color matches
    // the existing annotation's color
    expect(src).toMatch(/aria-pressed=\{.*existingAnnotation.*color.*c\.key/);
  });

  it("aria-pressed is inside the COLORS.map loop near the color button", () => {
    const mapStart = src.indexOf("COLORS.map(");
    expect(mapStart).toBeGreaterThan(-1);
    const mapBody = src.slice(mapStart, mapStart + 600);
    expect(mapBody).toContain("aria-pressed=");
  });
});
