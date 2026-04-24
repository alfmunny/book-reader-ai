/**
 * Regression test for issue #795 — reader sidebar chapter collapse uses
 * ▶/▼ Unicode instead of ChevronRightIcon/ChevronDownIcon from Icons.tsx.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Reader chapter collapse icon (#795)", () => {
  it("does not use ▶ Unicode character as collapse icon", () => {
    expect(src).not.toMatch(/[▶]/);
  });

  it("does not use ▼ Unicode character as expand icon", () => {
    expect(src).not.toMatch(/[▼]/);
  });

  it("imports ChevronRightIcon from Icons", () => {
    expect(src).toMatch(/ChevronRightIcon/);
  });

  it("ChevronRightIcon has aria-hidden", () => {
    expect(src).toMatch(/ChevronRightIcon[\s\S]{0,50}aria-hidden/);
  });

  it("ChevronDownIcon has aria-hidden on collapse toggle", () => {
    expect(src).toMatch(/ChevronDownIcon[\s\S]{0,50}aria-hidden/);
  });
});
