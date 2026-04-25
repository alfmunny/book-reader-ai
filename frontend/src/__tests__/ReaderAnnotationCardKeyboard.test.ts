/**
 * Regression test for #1310: annotation cards in the reader notes sidebar
 * must be keyboard-accessible (role=button, tabIndex, onKeyDown).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader annotation card keyboard accessibility (closes #1310)", () => {
  it("annotation card has role=button", () => {
    expect(src).toContain('role="button"');
  });

  it("annotation card has tabIndex for keyboard focus", () => {
    expect(src).toContain("tabIndex={0}");
  });

  it("annotation card handles Enter/Space keydown", () => {
    expect(src).toContain('e.key === "Enter" || e.key === " "');
  });

  it("annotation card has aria-label", () => {
    expect(src).toContain("Jump to annotation");
  });
});
