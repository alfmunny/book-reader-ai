/**
 * Non-text contrast regression for issue #1796:
 * Delete-annotation buttons in notes/[bookId]/page.tsx used text-red-400
 * (#f87171 on white ≈ 2.8:1) — fails WCAG 1.4.11 Non-text Contrast (3:1)
 * for UI component icons.
 * Fixed by bumping to text-red-500 (#ef4444 on white ≈ 3.8:1 — passes).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf8",
);

describe("Delete button non-text contrast (closes #1796)", () => {
  it("delete buttons do not use text-red-400 (fails WCAG 1.4.11 < 3:1)", () => {
    // Match the specific button patterns where text-red-400 was used
    expect(src).not.toMatch(
      /text-red-400[^"]*hover:text-red-600[^"]*transition-colors[^"]*p-1/,
    );
    expect(src).not.toMatch(
      /text-red-400[^"]*hover:text-red-600[^"]*transition-colors[^"]*min-h-\[44px\]/,
    );
  });
});
