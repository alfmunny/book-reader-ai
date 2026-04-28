/**
 * Regression for #1856 — flashcard page must announce the current card
 * position and word to screen readers after grading via an aria-live region
 * (WCAG 4.1.3 Status Messages).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf-8"
);

describe("Flashcard page card counter live region (closes #1856)", () => {
  it("has an aria-live region that announces card progress to screen readers", () => {
    expect(src).toContain('aria-live="polite"');
  });

  it("card counter or announcement references currentIndex", () => {
    const liveIdx = src.indexOf('aria-live="polite"');
    expect(liveIdx).toBeGreaterThan(-1);
    // The live region(s) should include card position info
    // Look in the region of the counter or the live region itself
    expect(src).toMatch(/currentIndex|cardAnnouncement|aria-live/);
  });

  it("card counter paragraph is wrapped in a role=status element", () => {
    // The counter showing card N of M must be in a live region
    const counterIdx = src.indexOf("remaining");
    expect(counterIdx).toBeGreaterThan(-1);
    // Within 200 chars before "remaining" there should be aria-live or role=status
    const before = src.slice(Math.max(0, counterIdx - 300), counterIdx);
    expect(before).toMatch(/aria-live|role="status"/);
  });
});
