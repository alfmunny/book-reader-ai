import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("reader annotation toggle aria-pressed (issue #1281)", () => {
  it("adds aria-pressed to the community-notes toggle", () => {
    // The toggle now governs community notes only (own marks always show)
    expect(src).toMatch(/aria-pressed=\{showShares\}/);
  });
});

describe("reader typography button aria-label and aria-expanded (issue #1283)", () => {
  it("has aria-label on typography button", () => {
    expect(src).toMatch(/aria-label="Typography settings"/);
  });

  it("has aria-expanded on typography button", () => {
    expect(src).toMatch(/aria-expanded=\{showTypographyPanel\}/);
  });
});
