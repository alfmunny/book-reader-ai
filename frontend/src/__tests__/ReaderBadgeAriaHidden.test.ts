import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Reader toolbar count badges (WCAG 4.1.2)", () => {
  it("badge spans must have aria-hidden so screen readers ignore the visual count", () => {
    // Each badge <span> must carry aria-hidden="true". The badge spans are
    // identified by their distinctive bg-amber-800 rounded-full combo.
    // After the fix there are 3 such spans (notes desktop, vocab, notes mobile).
    const lines = src.split("\n");
    const badgeLines = lines.filter(
      (l) => l.includes("rounded-full") && l.includes("bg-amber-800")
    );
    // Every badge line must include aria-hidden="true"
    expect(badgeLines.length).toBeGreaterThanOrEqual(3);
    badgeLines.forEach((line) => {
      expect(line).toContain('aria-hidden="true"');
    });
  });

  it("Notes button aria-label must be dynamic and include annotation count", () => {
    // The Notes sidebar button's aria-label must reference annotations.length
    // so screen readers can hear "Annotations & notes (3)" instead of just the label.
    expect(src).toMatch(/aria-label=\{[^}]*Annotations & notes/);
  });

  it("Vocab button aria-label must be dynamic and include vocab count", () => {
    expect(src).toMatch(/aria-label=\{[^}]*Vocabulary/);
  });
});
