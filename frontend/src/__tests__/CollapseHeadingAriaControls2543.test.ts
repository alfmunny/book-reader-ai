/**
 * Regression tests for #2543:
 * CollapseHeading disclosure buttons in notes/[bookId]/page.tsx must have
 * aria-controls referencing the id of the controlled content region.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "app/notes/[bookId]/page.tsx"),
  "utf-8"
);

describe("CollapseHeading disclosure buttons have aria-controls (closes #2543)", () => {
  it("CollapseHeading component button has aria-controls attribute", () => {
    // The button inside CollapseHeading must reference its controlled region
    expect(src).toContain("aria-controls=");
  });

  it("CollapseHeading component accepts and passes a controlsId prop", () => {
    // The component definition should include controlsId in its props
    expect(src).toMatch(/controlsId[?]?\s*:/);
  });

  it("Top-level Annotations disclosure has aria-controls", () => {
    // The CollapseHeading for "Annotations" should pass a controlsId
    const annIdx = src.indexOf('"Annotations"');
    expect(annIdx).not.toBe(-1);
    // Look ahead for controlsId prop in the nearby CollapseHeading
    const context = src.slice(annIdx, annIdx + 300);
    expect(context).toContain("controlsId=");
  });

  it("Controlled content divs/uls have matching id attributes", () => {
    // Content regions controlled by CollapseHeading must have id attributes
    // Look for id="collapse- pattern or similar
    expect(src).toMatch(/id="collapse-/);
  });
});
