import * as fs from "fs";
import * as path from "path";

// text-stone-300 on white = 1.5:1 — fails WCAG 1.4.11 Non-text Contrast
// (3:1 minimum for graphical UI components). Closes #1568.

const src = fs.readFileSync(
  path.join(__dirname, "../app/upload/[bookId]/chapters/page.tsx"),
  "utf8",
);

describe("Chapter editor Remove button icon meets WCAG 1.4.11 (closes #1568)", () => {
  it("Remove chapter button does not use text-stone-300", () => {
    const idx = src.indexOf("aria-label={`Remove chapter");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 100), idx + 300);
    expect(window).not.toMatch(/text-stone-300/);
  });
});
