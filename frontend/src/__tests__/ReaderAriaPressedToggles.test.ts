/**
 * Regression tests for #1248: Focus mode and Translation mobile buttons
 * must have aria-pressed to expose their on/off state to screen readers.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader page toggle button aria-pressed (closes #1248)", () => {
  it("Focus mode button has aria-pressed", () => {
    const idx = src.indexOf('aria-label="Focus mode"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 150);
    expect(window).toContain("aria-pressed");
  });

  it("Focus mode aria-pressed references focusMode state", () => {
    const idx = src.indexOf('aria-label="Focus mode"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 150);
    expect(window).toContain("focusMode");
  });

  it("Translation mobile button has aria-pressed", () => {
    const idx = src.indexOf('aria-label="Translation"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 100);
    expect(window).toContain("aria-pressed");
  });

  it("Translation aria-pressed references translationEnabled state", () => {
    const idx = src.indexOf('aria-label="Translation"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 100);
    expect(window).toContain("translationEnabled");
  });
});
