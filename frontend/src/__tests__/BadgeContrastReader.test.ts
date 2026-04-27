/**
 * Regression for issue #1773:
 * Annotation and vocabulary count badges in the reader toolbar used
 * bg-amber-600 text-white — contrast ~3.2:1, fails WCAG AA 4.5:1.
 * Must not use bg-amber-600 with text-white in badge context.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("reader toolbar badge contrast (closes #1773)", () => {
  it("does not use bg-amber-600 text-white on 9px badge spans", () => {
    // Match the specific pattern: rounded-full bg-amber-600 text-white text-[9px]
    expect(src).not.toMatch(/rounded-full bg-amber-600 text-white text-\[9px\]/);
  });
});
