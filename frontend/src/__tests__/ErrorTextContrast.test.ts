import { readFileSync } from "fs";
import { join } from "path";

const notesListSrc = readFileSync(join(__dirname, "../app/notes/page.tsx"), "utf-8");
const notesDetailSrc = readFileSync(join(__dirname, "../app/notes/[bookId]/page.tsx"), "utf-8");
const vocabSrc = readFileSync(join(__dirname, "../app/vocabulary/page.tsx"), "utf-8");

describe("Error message text contrast — WCAG 1.4.3", () => {
  it("notes/page.tsx error paragraph should not use text-red-500 (3.36:1 on parchment, fails 4.5:1)", () => {
    // text-red-500 (#ef4444) on parchment (#f5f0e8) = ~3.36:1, fails for 18px normal text
    const hasBadContrast = /text-red-500[^"]*"[^>]*>Failed to load/.test(notesListSrc) ||
      /"[^"]*text-red-500[^"]*"[^>]*>Failed to load/.test(notesListSrc);
    expect(hasBadContrast).toBe(false);
  });

  it("notes/[bookId]/page.tsx error paragraph should not use text-red-500", () => {
    const hasBadContrast = /"[^"]*text-red-500[^"]*"[^>]*>Failed to load/.test(notesDetailSrc);
    expect(hasBadContrast).toBe(false);
  });

  it("vocabulary/page.tsx error paragraph should not use text-red-500", () => {
    const hasBadContrast = /"[^"]*text-red-500[^"]*"[^>]*>Failed to load/.test(vocabSrc);
    expect(hasBadContrast).toBe(false);
  });
});
