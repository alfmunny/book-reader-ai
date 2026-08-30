import * as fs from "fs";
import * as path from "path";

// text-red-500 (#ef4444) on white at text-xs measures ≈4.05:1 — fails
// WCAG 1.4.3 AA. Closes #1575.

const FILES = [
  "app/(shell)/admin/books/page.tsx",
  "app/(shell)/admin/audio/page.tsx",
  "app/(shell)/admin/users/page.tsx",
  "app/(shell)/profile/page.tsx",
  "components/QueueTab.tsx",
];

describe("text-xs text-red-500 buttons removed (closes #1575)", () => {
  for (const rel of FILES) {
    it(`${rel} does not pair text-xs with text-red-500 in className`, () => {
      const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
      // Check both orderings inside a single className (no intervening quote)
      expect(src).not.toMatch(/text-xs[^"]*text-red-500/);
      expect(src).not.toMatch(/text-red-500[^"]*text-xs/);
    });
  }
});
