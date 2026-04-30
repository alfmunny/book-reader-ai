/**
 * Regression test for #2517:
 * The main reading viewport (#reader-scroll) must have tabIndex={0} so
 * keyboard users can focus it and scroll chapter text with Page Up/Down
 * and Arrow keys (WCAG 2.1.1 Keyboard, Level A).
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8",
);

describe("Reader scroll area — WCAG 2.1.1 (closes #2517)", () => {
  it('reader-scroll div has tabIndex={0}', () => {
    // id="reader-scroll" must appear on an element with tabIndex={0}
    const regex =
      /id="reader-scroll"[^>]*tabIndex=\{0\}|tabIndex=\{0\}[^>]*id="reader-scroll"/;
    expect(src).toMatch(regex);
  });
});
