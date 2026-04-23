/**
 * Verifies homepage pagination buttons use SVG icons not Unicode arrows.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf-8"
);

describe("Homepage pagination Unicode icon replacements", () => {
  it("does not use raw ← arrow in Prev button", () => {
    expect(src).not.toMatch(/>\s*←\s*Prev/);
  });

  it("does not use raw → arrow in Next button", () => {
    expect(src).not.toMatch(/Next\s*→\s*</);
  });

  it("imports ArrowLeftIcon from Icons", () => {
    expect(src).toMatch(/ArrowLeftIcon/);
  });

  it("Prev pagination button uses ArrowLeftIcon", () => {
    const prevBtnIdx = src.indexOf("setPopularPage((p) => p - 1)");
    const arrowLeftIdx = src.indexOf("ArrowLeftIcon", prevBtnIdx);
    expect(prevBtnIdx).toBeGreaterThan(-1);
    expect(arrowLeftIdx).toBeGreaterThan(prevBtnIdx);
    expect(arrowLeftIdx - prevBtnIdx).toBeLessThan(500);
  });

  it("Next pagination button uses ArrowRightIcon", () => {
    // Check that ArrowRightIcon appears after the "Next" pagination button's onClick
    const nextBtnIdx = src.indexOf("setPopularPage((p) => p + 1)");
    const arrowRightIdx = src.indexOf("ArrowRightIcon", nextBtnIdx);
    expect(nextBtnIdx).toBeGreaterThan(-1);
    expect(arrowRightIdx).toBeGreaterThan(nextBtnIdx);
    expect(arrowRightIdx - nextBtnIdx).toBeLessThan(500);
  });
});
