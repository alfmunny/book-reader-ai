/**
 * Verifies homepage pagination buttons use SVG icons not raw Unicode arrows.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf-8"
);

describe("Homepage pagination Unicode icon replacements", () => {
  it("Prev button does not use raw ← Unicode", () => {
    expect(src).not.toMatch(/>\s*←\s*Prev/);
  });

  it("Next button does not use raw → Unicode", () => {
    expect(src).not.toMatch(/Next\s*→\s*</);
  });

  it("imports ArrowLeftIcon", () => {
    expect(src).toMatch(/ArrowLeftIcon/);
  });

  it("Prev button uses ArrowLeftIcon", () => {
    const prevIdx = src.indexOf("Prev");
    const snippet = src.slice(Math.max(0, prevIdx - 100), prevIdx + 10);
    expect(snippet).toMatch(/ArrowLeftIcon/);
  });

  it("Next button uses ArrowRightIcon", () => {
    const nextIdx = src.indexOf("Next <ArrowRightIcon");
    expect(nextIdx).toBeGreaterThan(-1);
  });
});
