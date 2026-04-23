/**
 * Verifies notes overview page book-list button uses ArrowRightIcon not raw → Unicode.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/notes/page.tsx"),
  "utf-8"
);

describe("Notes overview page Unicode arrow replacement", () => {
  it("does not use raw → Unicode in book-list button", () => {
    expect(src).not.toMatch(/>\s*→\s*<\/p>/);
  });

  it("imports ArrowRightIcon from Icons", () => {
    expect(src).toMatch(/ArrowRightIcon/);
  });

  it("book-list button chevron uses ArrowRightIcon", () => {
    expect(src).toMatch(/ArrowRightIcon[\s\S]{0,80}aria-hidden/);
  });
});
