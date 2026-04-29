/**
 * Regression test for #2071: close buttons in dialogs must have descriptive
 * aria-labels so screen reader users can identify what will be closed.
 */
import * as fs from "fs";
import * as path from "path";

const toolbar = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationToolbar.tsx"),
  "utf8"
);
const tooltip = fs.readFileSync(
  path.join(__dirname, "../components/VocabWordTooltip.tsx"),
  "utf8"
);
const sidebar = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8"
);
const modal = fs.readFileSync(
  path.join(__dirname, "../components/BookDetailModal.tsx"),
  "utf8"
);

describe("Dialog close buttons have descriptive aria-labels (closes #2071)", () => {
  it("AnnotationToolbar close button is not generic 'Close'", () => {
    expect(toolbar).not.toMatch(/aria-label="Close"(?![\s\S]*annotation)/);
    expect(toolbar).toMatch(/aria-label="Close note editor"/);
  });

  it("VocabWordTooltip close button is not generic 'Close'", () => {
    expect(tooltip).not.toMatch(/aria-label="Close"(?![\s\S]*word)/);
    expect(tooltip).toMatch(/aria-label="Close word definition"/);
  });

  it("AnnotationsSidebar close button is not generic 'Close'", () => {
    expect(sidebar).not.toMatch(/aria-label="Close"(?![\s\S]*sidebar)/);
    expect(sidebar).toMatch(/aria-label="Close annotations sidebar"/);
  });

  it("BookDetailModal close button is not generic 'Close'", () => {
    expect(modal).not.toMatch(/aria-label="Close"(?![\s\S]*book)/);
    expect(modal).toMatch(/aria-label="Close book details"/);
  });
});
