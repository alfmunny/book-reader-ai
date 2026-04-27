/**
 * Focus-visible regression for issue #1785:
 * Flashcard flip card, reader annotation card, and AnnotationsSidebar card
 * all use role="button" + tabIndex={0} but lacked focus-visible ring styles,
 * violating WCAG 2.4.7 (Focus Visible, Level AA).
 */
import * as fs from "fs";
import * as path from "path";

const flashcardSrc = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8",
);
const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);
const sidebarSrc = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8",
);

describe("focus-visible rings on interactive cards (closes #1785)", () => {
  it("flashcard flip card has focus-visible ring", () => {
    expect(flashcardSrc).toMatch(/focus-visible:ring/);
  });

  it("reader inline annotation card has focus-visible ring", () => {
    // The reader has multiple role=button divs; check the annotation renderCard pattern
    expect(readerSrc).toMatch(/colorBadge\[ann\.color\].*focus-visible:ring|focus-visible:ring.*colorBadge\[ann\.color\]/s);
  });

  it("AnnotationsSidebar annotation card has focus-visible ring", () => {
    expect(sidebarSrc).toMatch(/COLOR_BADGE\[ann\.color\].*focus-visible:ring|focus-visible:ring.*COLOR_BADGE\[ann\.color\]/s);
  });
});
