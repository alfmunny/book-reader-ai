/**
 * Regression test for #1345: homepage WCAG 1.4.3 contrast failures.
 * text-stone-400 on white = 2.65:1 — fails AA. text-stone-500 = 4.86:1 — passes.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8",
);

describe("Homepage contrast (closes #1345)", () => {
  it("section headers do not use text-stone-400 (2.65:1 contrast fail)", () => {
    // h2 section labels "Continue Reading", "Your Progress", "Your Library"
    expect(src).not.toMatch(/text-xs[^"]*text-stone-400/);
  });

  it("stat card labels do not use text-stone-400 (2.65:1 contrast fail)", () => {
    // "day streak", "books started", "words saved", "annotations" at text-[10px]
    expect(src).not.toMatch(/text-\[10px\][^"]*text-stone-400|text-stone-400[^"]*text-\[10px\]/);
  });

  it("book metadata does not use text-xs text-stone-400 (2.65:1 contrast fail)", () => {
    // "Chapter N · 2h ago" metadata line
    expect(src).not.toContain("text-xs text-stone-400");
  });
});
