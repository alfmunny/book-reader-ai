/**
 * Regression test for #2467: flashcard session-complete ("All done for today!")
 * state must be wrapped in a live region so screen readers announce it when it
 * appears (WCAG 4.1.3 Status Messages).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf-8"
);

describe("Flashcard done-state live region (closes #2467)", () => {
  it("done-state container has role=status", () => {
    const doneIdx = src.indexOf("All done for today!");
    expect(doneIdx).toBeGreaterThan(-1);
    // Within 300 chars before the text, the containing element must have role=status
    const before = src.slice(Math.max(0, doneIdx - 300), doneIdx);
    expect(before).toMatch(/role="status"/);
  });

  it("done-state container has aria-live=polite or role=status (not just visual heading)", () => {
    const doneIdx = src.indexOf("All done for today!");
    expect(doneIdx).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, doneIdx - 300), doneIdx);
    expect(before).toMatch(/role="status"|aria-live="polite"/);
  });
});
