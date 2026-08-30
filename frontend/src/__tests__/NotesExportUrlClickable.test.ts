/**
 * Regression tests for #2336: notes/[bookId] export URL must be rendered as
 * a clickable anchor, consistent with vocabulary/page.tsx and reader page.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(path.join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"), "utf8");

describe("notes/[bookId] export URL is clickable (closes #2336)", () => {
  // Anchor from the aria-live status region that shows the export result
  it("export status area renders an anchor element", () => {
    const idx = src.indexOf('aria-live="polite"');
    expect(idx).toBeGreaterThan(-1);
    const exportSection = src.slice(idx, idx + 900);
    expect(exportSection).toMatch(/<a[\s\n]/);
  });

  it("export URL anchor opens in new tab", () => {
    const idx = src.indexOf('aria-live="polite"');
    const exportSection = src.slice(idx, idx + 900);
    expect(exportSection).toMatch(/target="_blank"/);
  });

  it("export URL anchor has sr-only new-tab announcement", () => {
    const idx = src.indexOf('aria-live="polite"');
    const exportSection = src.slice(idx, idx + 900);
    expect(exportSection).toMatch(/opens in new tab/);
  });

  it("export URL anchor has rel=noopener noreferrer", () => {
    const idx = src.indexOf('aria-live="polite"');
    const exportSection = src.slice(idx, idx + 900);
    expect(exportSection).toMatch(/rel="noopener noreferrer"/);
  });
});
