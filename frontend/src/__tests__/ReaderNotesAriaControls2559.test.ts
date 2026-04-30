/**
 * Regression tests for #2559:
 * Reader mobile Notes button uses aria-expanded without aria-controls.
 * The revealed panel has no id, so AT cannot programmatically navigate
 * to the revealed content after activating the button.
 * Fix: add id="reader-mobile-notes-panel" to the panel and
 * aria-controls="reader-mobile-notes-panel" to the Notes button.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader mobile Notes button has aria-controls (closes #2559)", () => {
  it("notes expand panel has id=reader-mobile-notes-panel", () => {
    expect(src).toContain('id="reader-mobile-notes-panel"');
  });

  it("Notes button has aria-controls referencing the panel id", () => {
    expect(src).toContain('aria-controls="reader-mobile-notes-panel"');
  });

  it("aria-controls appears on the same button as aria-expanded={notesExpanded}", () => {
    // Find the Notes button (has aria-expanded={notesExpanded})
    const idx = src.indexOf("aria-expanded={notesExpanded}");
    expect(idx).not.toBe(-1);
    // Check within 300 chars around it for aria-controls
    const context = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(context).toContain('aria-controls="reader-mobile-notes-panel"');
  });
});
