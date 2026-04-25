/**
 * Static assertion: keyboard shortcuts popover has role=region + aria-label
 * and the toggle button has aria-expanded.
 * Closes #1131
 */
import fs from "fs";
import path from "path";

const readerPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Keyboard shortcuts popover ARIA", () => {
  it("toggle button has aria-expanded bound to showShortcuts", () => {
    // Locate the Keyboard shortcuts toggle button and verify aria-expanded
    const idx = readerPage.indexOf('aria-label="Keyboard shortcuts"');
    expect(idx).toBeGreaterThan(0);
    const block = readerPage.slice(Math.max(0, idx - 400), idx + 200);
    expect(block).toContain("aria-expanded={showShortcuts}");
  });

  it("popover div has role=region", () => {
    // The popover contains "Keyboard Shortcuts" heading text
    const idx = readerPage.indexOf("Keyboard Shortcuts");
    expect(idx).toBeGreaterThan(0);
    const block = readerPage.slice(Math.max(0, idx - 400), idx + 100);
    expect(block).toContain('role="region"');
  });

  it("popover div has aria-label Keyboard shortcuts", () => {
    const idx = readerPage.indexOf("Keyboard Shortcuts");
    const block = readerPage.slice(Math.max(0, idx - 400), idx + 100);
    expect(block).toContain('aria-label="Keyboard shortcuts"');
  });
});
