/**
 * Regression test for #2594:
 * All three keyboard shortcuts panels (focus-mode overlay, desktop dropdown,
 * mobile dropdown) must include both the N (sentence-select) and W (word-select)
 * mode entries. Uses static source analysis.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

/** Extract a shortcut list array from the source near a given anchor string. */
function extractShortcutBlock(anchor: string): string {
  const idx = src.indexOf(anchor);
  if (idx === -1) return "";
  // Grab up to 1500 chars around the anchor to capture the list array
  return src.slice(idx, idx + 1500);
}

describe("Reader keyboard shortcuts panels completeness (closes #2594)", () => {
  describe("Focus-mode overlay panel (focus-hotkeys-panel)", () => {
    const block = extractShortcutBlock('id="focus-hotkeys-panel"');

    it("lists the N key for sentence selection mode", () => {
      expect(block).toMatch(/["']N["']/);
      expect(block).toMatch(/[Ss]entence/);
    });

    it("lists the W key for word selection mode", () => {
      expect(block).toMatch(/["']W["']/);
      expect(block).toMatch(/[Ww]ord/);
    });
  });

  describe("Desktop dropdown panel (shortcuts-panel)", () => {
    const block = extractShortcutBlock('id="shortcuts-panel"');

    it("lists the N key for sentence selection mode", () => {
      expect(block).toMatch(/["']N["']/);
      expect(block).toMatch(/[Ss]entence/);
    });

    it("lists the W key for word selection mode", () => {
      expect(block).toMatch(/["']W["']/);
      expect(block).toMatch(/[Ww]ord/);
    });
  });

  describe("Mobile dropdown panel (shortcuts-panel-mobile)", () => {
    const block = extractShortcutBlock('id="shortcuts-panel-mobile"');

    it("lists the N key for sentence selection mode", () => {
      expect(block).toMatch(/["']N["']/);
      expect(block).toMatch(/[Ss]entence/);
    });

    it("lists the W key for word selection mode", () => {
      expect(block).toMatch(/["']W["']/);
      expect(block).toMatch(/[Ww]ord/);
    });
  });
});
