/**
 * Regression test for #1310: annotation cards in the reader notes sidebar
 * and AnnotationsSidebar drawer must be keyboard-accessible.
 */
import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

const sidebarSrc = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8"
);

describe("Reader annotation card keyboard accessibility (closes #1310)", () => {
  it("reader annotation card has role=button", () => {
    expect(readerSrc).toContain('role="button"');
  });

  it("reader annotation card has tabIndex for keyboard focus", () => {
    expect(readerSrc).toContain("tabIndex={0}");
  });

  it("reader annotation card handles Enter/Space keydown", () => {
    expect(readerSrc).toContain('e.key === "Enter" || e.key === " "');
  });

  it("reader annotation card has aria-label", () => {
    expect(readerSrc).toContain("Jump to annotation");
  });
});

describe("AnnotationsSidebar annotation card keyboard accessibility (closes #1310)", () => {
  it("sidebar annotation card has role=button", () => {
    expect(sidebarSrc).toContain('role="button"');
  });

  it("sidebar annotation card has tabIndex for keyboard focus", () => {
    expect(sidebarSrc).toContain("tabIndex={0}");
  });

  it("sidebar annotation card handles Enter/Space keydown", () => {
    expect(sidebarSrc).toContain('e.key === "Enter" || e.key === " "');
  });

  it("sidebar annotation card has aria-label", () => {
    expect(sidebarSrc).toContain("Jump to annotation");
  });
});
