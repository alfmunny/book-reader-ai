/**
 * Regression test for #1886: notes export confirmation must be announced via
 * an accessible live region (WCAG 4.1.3 — Status Messages).
 *
 * The conditional {exportMsg && <p>...} pattern is silent to AT because
 * dynamic DOM insertion without aria-live is not announced. Fix: always-present
 * container using the role="status" + aria-live="polite" pattern.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf8"
);

describe("Notes export confirmation live region (closes #1886)", () => {
  it("export message uses always-present live region (not conditional mount)", () => {
    // The broken pattern: {exportMsg && <element>}
    // After the fix, exportMsg should be used as content, not as a render gate
    // Look for the always-present pattern: exportMsg ?? "" or exportMsg?.
    expect(src).toMatch(/exportMsg\s*\?\?|\bexportMsg\?\.text/);
  });

  it("export status container has role=status or role=alert", () => {
    // Find the always-present live region (near exportMsg ?? "")
    const idx = src.indexOf("exportMsg ?? ");
    expect(idx).toBeGreaterThan(-1);
    const region = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(region).toMatch(/role="status"|role="alert"/);
  });

  it("export status container has aria-live", () => {
    const idx = src.indexOf("exportMsg ?? ");
    expect(idx).toBeGreaterThan(-1);
    const region = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(region).toContain("aria-live");
  });
});
