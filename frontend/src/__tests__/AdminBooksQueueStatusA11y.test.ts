/**
 * Regression test for #2093 — admin books page queue status symbols (▸·×)
 * must have a screen-reader-accessible aria-label; the raw typographic
 * characters should be wrapped in aria-hidden="true".
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/books/page.tsx"),
  "utf8",
);

describe("Admin books queue status accessibility (closes #2093)", () => {
  it("queue status span has aria-label attribute", () => {
    // Find the section containing the ▸ symbol (running indicator)
    const idx = src.indexOf("▸${running}");
    expect(idx).toBeGreaterThan(-1);
    // Look back 600 chars for the opening span with aria-label
    const window = src.slice(Math.max(0, idx - 600), idx + 10);
    expect(window).toContain("aria-label");
  });

  it("symbol characters are wrapped in aria-hidden span", () => {
    const idx = src.indexOf("▸${running}");
    expect(idx).toBeGreaterThan(-1);
    // Symbols should be inside an aria-hidden span
    const window = src.slice(Math.max(0, idx - 200), idx + 10);
    expect(window).toContain('aria-hidden="true"');
  });
});
