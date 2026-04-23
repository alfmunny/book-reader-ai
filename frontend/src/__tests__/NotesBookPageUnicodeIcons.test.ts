/**
 * Verifies notes/[bookId]/page.tsx uses SVG icons not raw Unicode symbols.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf-8"
);

const icons = fs.readFileSync(
  path.join(__dirname, "../components/Icons.tsx"),
  "utf-8"
);

describe("Notes book page Unicode icon replacements", () => {
  it("Export button does not use raw ↗ Unicode", () => {
    expect(src).not.toMatch(/↗\s*Export/);
  });

  it("Open reader button does not use raw → Unicode", () => {
    expect(src).not.toMatch(/Open reader\s*→/);
  });

  it("imports ArrowUpRightIcon", () => {
    expect(src).toMatch(/ArrowUpRightIcon/);
  });

  it("ArrowUpRightIcon is defined in Icons.tsx", () => {
    expect(icons).toMatch(/ArrowUpRightIcon/);
  });

  it("Export button uses ArrowUpRightIcon", () => {
    expect(src).toMatch(/ArrowUpRightIcon.*Export|Export.*ArrowUpRightIcon/s);
  });

  it("Open reader button uses ArrowRightIcon", () => {
    expect(src).toMatch(/Open reader.*ArrowRightIcon/s);
  });
});
