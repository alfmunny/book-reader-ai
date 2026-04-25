/**
 * Regression test for issue #805 — reader header chapter-nav and
 * keyboard-shortcut buttons are 28px without 44px touch target minimum.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Reader header touch targets (#805)", () => {
  it("Previous chapter button has min-h-[44px]", () => {
    // lastIndexOf targets the header button; focus-mode also uses this label but appears earlier
    const idx = src.lastIndexOf('aria-label="Previous chapter"');
    const snippet = src.slice(idx, idx + 300);
    expect(snippet).toMatch(/min-h-\[44px\]/);
  });

  it("Previous chapter button has min-w-[44px]", () => {
    const idx = src.lastIndexOf('aria-label="Previous chapter"');
    const snippet = src.slice(idx, idx + 300);
    expect(snippet).toMatch(/min-w-\[44px\]/);
  });

  it("Next chapter button has min-h-[44px]", () => {
    const idx = src.lastIndexOf('aria-label="Next chapter"');
    const snippet = src.slice(idx, idx + 300);
    expect(snippet).toMatch(/min-h-\[44px\]/);
  });

  it("Next chapter button has min-w-[44px]", () => {
    const idx = src.lastIndexOf('aria-label="Next chapter"');
    const snippet = src.slice(idx, idx + 300);
    expect(snippet).toMatch(/min-w-\[44px\]/);
  });

  it("Keyboard shortcuts button has min-h-[44px]", () => {
    const idx = src.indexOf('aria-label="Keyboard shortcuts"');
    const snippet = src.slice(idx, idx + 300);
    expect(snippet).toMatch(/min-h-\[44px\]/);
  });

  it("Keyboard shortcuts button has min-w-[44px]", () => {
    const idx = src.indexOf('aria-label="Keyboard shortcuts"');
    const snippet = src.slice(idx, idx + 300);
    expect(snippet).toMatch(/min-w-\[44px\]/);
  });
});
