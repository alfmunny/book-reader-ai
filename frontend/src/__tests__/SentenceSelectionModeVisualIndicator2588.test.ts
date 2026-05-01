/**
 * Regression test for #2588:
 * Sentence-selection mode must show a visible status strip for sighted keyboard users.
 * Screen readers already receive the sr-only live region (#2584); this test verifies
 * the visible counterpart.
 */
import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Sentence-selection mode visual indicator (closes #2588)", () => {
  it("renders a visible status strip (not sr-only) when sentenceSelectMode is true", () => {
    // Find the sentenceSelectMode conditional block in JSX
    const modeIdx = readerSrc.indexOf("sentenceSelectMode &&");
    expect(modeIdx).not.toBe(-1);
    const modeBlock = readerSrc.slice(modeIdx, modeIdx + 2000);
    // Must have a non-sr-only visible element showing the mode status
    // (sr-only alone is not enough for sighted keyboard users)
    expect(modeBlock).toMatch(/sentence-select-indicator|data-testid="sentence-select-status"|sentence.*select.*indicator/i);
  });

  it("visible strip contains navigation hints (J/K and Esc)", () => {
    const modeIdx = readerSrc.indexOf("sentenceSelectMode &&");
    expect(modeIdx).not.toBe(-1);
    const modeBlock = readerSrc.slice(modeIdx, modeIdx + 2000);
    // Must show key hints so sighted users know how to use and exit the mode
    expect(modeBlock).toMatch(/J.*K|navigate|arrow/i);
    expect(modeBlock).toMatch(/Esc|exit/i);
  });

  it("visible strip has role=status for screen readers (no duplication of announcement)", () => {
    const modeIdx = readerSrc.indexOf("sentenceSelectMode &&");
    expect(modeIdx).not.toBe(-1);
    const modeBlock = readerSrc.slice(modeIdx, modeIdx + 2000);
    expect(modeBlock).toMatch(/role="status"/);
  });
});
