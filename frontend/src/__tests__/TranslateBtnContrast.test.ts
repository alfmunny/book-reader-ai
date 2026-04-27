/**
 * Contrast regression for issue #1788:
 * "Translate this chapter" button used bg-amber-600 text-white text-sm —
 * amber-600 (#d97706) on white ≈ 3.75:1, failing WCAG AA 4.5:1.
 * Fixed by bumping to bg-amber-700 (#b45309 on white ≈ 5:1).
 */
import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Translate button contrast (closes #1788)", () => {
  it("translate chapter button does not use bg-amber-600 with white text", () => {
    // className appears before the button text in JSX source order
    expect(readerSrc).not.toMatch(
      /bg-amber-600[^"]*text-white[^"]*"[\s\S]{0,200}Translate this chapter/,
    );
  });
});
