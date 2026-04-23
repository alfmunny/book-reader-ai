/**
 * Verifies notes page empty state uses SVG icon not emoji.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf-8"
);

describe("Notes page empty state", () => {
  it("does not use 📒 emoji", () => {
    expect(src).not.toContain("📒");
  });

  it("imports EmptyNotesIcon from Icons", () => {
    expect(src).toMatch(/EmptyNotesIcon/);
  });

  it("uses EmptyNotesIcon in empty state", () => {
    expect(src).toMatch(/<EmptyNotesIcon/);
  });

  it("uses ArrowRightIcon instead of raw → arrow in CTA button", () => {
    expect(src).toMatch(/Open reader[\s\S]{0,50}<ArrowRightIcon/);
  });
});
