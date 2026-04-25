/**
 * Regression tests for #1241: reader page status/loading spans must have
 * role="status" so screen readers announce them as live regions.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader page status live regions (closes #1241)", () => {
  it("chapter loading span has role=status", () => {
    const idx = src.indexOf("Loading…");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 100), idx + 50);
    expect(window).toContain('role="status"');
  });

  it("translation status container has role=status", () => {
    const idx = src.indexOf("Checking for translation…");
    expect(idx).toBeGreaterThan(-1);
    // The role="status" wrapper should be within 250 chars before the first span
    const window = src.slice(Math.max(0, idx - 250), idx + 50);
    expect(window).toContain('role="status"');
  });

  it("translating-now span is inside the role=status container", () => {
    const idx = src.indexOf("Translating now…");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 600), idx + 50);
    expect(window).toContain('role="status"');
  });
});
