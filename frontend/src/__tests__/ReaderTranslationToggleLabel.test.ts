/**
 * Regression test for #2358: translation toggle checkbox in the reader sidebar
 * was missing an accessible name — screen readers announced "Disabled, checkbox"
 * with no indication of which feature was being toggled.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader sidebar translation toggle accessible name (closes #2358)", () => {
  it("translation toggle checkbox has aria-label", () => {
    const idx = src.indexOf("translationEnabled");
    expect(idx).toBeGreaterThan(-1);
    // Find the checkbox in the translate tab toggle area
    const toggleArea = src.indexOf("Enable/disable toggle");
    expect(toggleArea).toBeGreaterThan(-1);
    const window = src.slice(toggleArea, toggleArea + 900);
    expect(window).toContain('aria-label="Enable translation"');
  });

  it("aria-label is on the sr-only checkbox, not just the outer label", () => {
    // Find the translation toggle section and look for the sr-only checkbox there
    const toggleIdx = src.indexOf("Enable/disable toggle");
    expect(toggleIdx).toBeGreaterThan(-1);
    // Within the toggle section (600 chars), find the sr-only checkbox
    const toggleSection = src.slice(toggleIdx, toggleIdx + 900);
    const srOnlyIdx = toggleSection.indexOf('className="sr-only"');
    expect(srOnlyIdx).toBeGreaterThan(-1);
    // Look for aria-label within 200 chars of the sr-only class in this section
    const vicinity = toggleSection.slice(Math.max(0, srOnlyIdx - 50), srOnlyIdx + 200);
    expect(vicinity).toContain('aria-label="Enable translation"');
  });
});
