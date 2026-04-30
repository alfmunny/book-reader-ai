/**
 * Regression test for #2511:
 * Scrollable display-only containers in QueueTab must have tabIndex={0} so
 * keyboard users can focus them and scroll with arrow/page keys
 * (WCAG 2.1.1 Keyboard, Level A).
 *
 * Static source-code analysis: cheaper than a full render and pinpoints
 * the exact pattern that must not regress.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../components/QueueTab.tsx"),
  "utf-8",
);

describe("QueueTab scrollable containers — WCAG 2.1.1 (closes #2511)", () => {
  it('books-to-translate table scroll wrapper has tabIndex={0}', () => {
    // The wrapper containing the <table aria-label="Books to translate">
    // must be keyboard-focusable.
    const tableWrapperRegex =
      /max-h-40[^>]*overflow-y-auto[^>]*tabIndex=\{0\}|tabIndex=\{0\}[^>]*max-h-40[^>]*overflow-y-auto/;
    expect(src).toMatch(tableWrapperRegex);
  });

  it('dry-run preview scroll wrapper has tabIndex={0}', () => {
    // The wrapper showing the translated paragraph previews.
    const previewWrapperRegex =
      /max-h-64[^>]*overflow-y-auto[^>]*tabIndex=\{0\}|tabIndex=\{0\}[^>]*max-h-64[^>]*overflow-y-auto/;
    expect(src).toMatch(previewWrapperRegex);
  });
});
