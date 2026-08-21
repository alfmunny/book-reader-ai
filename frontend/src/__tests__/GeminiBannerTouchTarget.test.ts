/**
 * Regression test for #2087 — the "Add a key in your profile" inline button
 * in the reader Gemini reminder banner must have a 44px touch target on mobile
 * (WCAG 2.5.5 / CLAUDE.md graphic-design rules).
 */
import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Gemini reminder banner touch target (closes #2087)", () => {
  it("reader page contains Gemini reminder button text", () => {
    expect(readerSrc).toContain("Add a key in your profile");
  });

  it("Gemini reminder button has min-h-[44px] for mobile touch target", () => {
    const idx = readerSrc.indexOf("Add a key in your profile");
    expect(idx).toBeGreaterThan(-1);
    // Look backward from the text to find the opening <button tag (within 300 chars)
    const window = readerSrc.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("min-h-[44px]");
  });
});
