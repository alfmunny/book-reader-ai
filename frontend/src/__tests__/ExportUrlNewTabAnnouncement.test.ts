/**
 * Regression tests for #2334: export URL links (vocabulary + reader Obsidian toast)
 * must announce "(opens in new tab)" to screen-reader users.
 */
import * as fs from "fs";
import * as path from "path";

function read(rel: string) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("export URL links announce new-tab to screen readers (closes #2334)", () => {
  it("vocabulary page export URL link has sr-only new-tab announcement", () => {
    const src = read("../app/(shell)/vocabulary/page.tsx");
    // The export result link renders a URL as visible text inside an <a target="_blank">
    const idx = src.indexOf('target="_blank" rel="noopener noreferrer" className="text-amber-700 underline break-all');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toMatch(/opens in new tab/);
  });

  it("reader page Obsidian export toast link has sr-only new-tab announcement", () => {
    const src = read("../app/reader/[bookId]/page.tsx");
    // The obsidian visual toast export link renders the URL inside <a target="_blank">
    // Anchor on the visual toast comment (after the always-present mirror)
    const idx = src.indexOf("Obsidian export toast — visual only");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 1100);
    expect(window).toMatch(/opens in new tab/);
  });
});
