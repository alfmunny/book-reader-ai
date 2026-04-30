/**
 * Regression tests for #2529:
 * The Gemini API key reminder banner in the reader must use a semantic <a>
 * anchor (not button+window.open) and must announce "opens in new tab" to
 * screen readers (WCAG 3.2.2 On Input / G201).
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Gemini banner link — semantic anchor + new-tab notice (closes #2529)", () => {
  it("does not use window.open for the Gemini key link", () => {
    const idx = src.indexOf("Add your free Gemini API key");
    expect(idx).toBeGreaterThan(-1);
    // Look 200 chars around the text for window.open
    const context = src.slice(Math.max(0, idx - 200), idx + 200);
    expect(context).not.toContain("window.open");
  });

  it("uses an anchor element (not button) for the Gemini key link", () => {
    const idx = src.indexOf("Add your free Gemini API key");
    expect(idx).toBeGreaterThan(-1);
    const context = src.slice(Math.max(0, idx - 500), idx + 50);
    // Should find <a not <button in the vicinity
    expect(context).toMatch(/<a\b/);
    expect(context).not.toMatch(/<button\b[^>]*>\s*$|<button\b[^>]*>\s*Add/);
  });

  it("announces 'opens in new tab' for the Gemini key link", () => {
    const idx = src.indexOf("Add your free Gemini API key");
    expect(idx).toBeGreaterThan(-1);
    const context = src.slice(idx, idx + 200);
    expect(context).toContain("opens in new tab");
  });
});
