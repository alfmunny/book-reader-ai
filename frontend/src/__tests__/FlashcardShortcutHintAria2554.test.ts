/**
 * Regression tests for #2554:
 * Flashcard keyboard shortcut hint text (grade number keys + "Space / Enter")
 * uses opacity-60 at 10px, giving ~2.5:1 contrast — below WCAG 1.4.3 AA (4.5:1).
 * Fix: mark these spans aria-hidden="true" so they are decorative (button
 * aria-label already includes the shortcut info).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8",
);

describe("Flashcard shortcut hint spans are aria-hidden (closes #2554)", () => {
  it("grade number key hint span has aria-hidden", () => {
    // The span showing the grade key number (1–4) must be aria-hidden
    // since the button aria-label already says "(key N)".
    expect(src).toMatch(/aria-hidden="true"[\s\S]{0,20}text-\[10px\]|text-\[10px\][\s\S]{0,40}aria-hidden="true"/);
  });

  it("flip button shortcut hint has aria-hidden", () => {
    // "Space / Enter" visual hint inside the flip button must be aria-hidden
    // since the button aria-label already includes "(Space or Enter)".
    const flipIdx = src.indexOf("Space / Enter");
    expect(flipIdx).not.toBe(-1);
    const context = src.slice(Math.max(0, flipIdx - 100), flipIdx + 60);
    expect(context).toContain('aria-hidden="true"');
  });
});
