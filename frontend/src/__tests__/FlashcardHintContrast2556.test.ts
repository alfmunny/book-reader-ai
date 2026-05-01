/**
 * Regression test for #2556:
 * Keyboard shortcut hint spans in the flashcard page must not use opacity-60,
 * which dropped contrast below WCAG 1.4.3 AA (4.5:1) against the pastel grade
 * button backgrounds and the amber-700 flip button.
 *
 * Fix: remove opacity-60 from all shortcut hint spans and use explicit
 * high-contrast text colors instead.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8",
);

describe("Flashcard shortcut hint contrast (closes #2556)", () => {
  it("grade button hint span does not use opacity-60", () => {
    // Find the grade button hint (the number 1-4 shown under grade labels)
    const idx = src.indexOf('aria-hidden="true">{i + 1}');
    expect(idx).not.toBe(-1);
    // Look behind 120 chars for the opening span tag
    const block = src.slice(idx - 120, idx + 10);
    expect(block).not.toContain("opacity-60");
  });

  it("grade button hint span uses an explicit text color class", () => {
    const idx = src.indexOf('aria-hidden="true">{i + 1}');
    const block = src.slice(idx - 120, idx + 10);
    // Must specify a text color (text-stone-*, text-current, etc.) not relying on opacity
    expect(block).toMatch(/text-(stone|slate|zinc|neutral|gray|current|inherit)/);
  });

  it("flip button hint span does not use opacity-60", () => {
    const idx = src.indexOf("Space / Enter");
    expect(idx).not.toBe(-1);
    const block = src.slice(idx - 120, idx + 30);
    expect(block).not.toContain("opacity-60");
  });

  it("flip button hint span uses a visible text color (not opacity-dimmed)", () => {
    const idx = src.indexOf("Space / Enter");
    const block = src.slice(idx - 120, idx + 30);
    // text-white on amber-700 gives ~6.56:1 contrast (passes AA)
    expect(block).toMatch(/text-(white|amber-[0-9]+|stone-[0-9]+)/);
  });
});
