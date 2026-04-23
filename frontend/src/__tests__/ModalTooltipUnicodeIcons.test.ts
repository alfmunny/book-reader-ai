/**
 * Verifies BookDetailModal and VocabWordTooltip use SVG icons not raw Unicode.
 */
import fs from "fs";
import path from "path";

const modal = fs.readFileSync(
  path.join(__dirname, "../components/BookDetailModal.tsx"),
  "utf-8"
);

const tooltip = fs.readFileSync(
  path.join(__dirname, "../components/VocabWordTooltip.tsx"),
  "utf-8"
);

const icons = fs.readFileSync(
  path.join(__dirname, "../components/Icons.tsx"),
  "utf-8"
);

describe("BookDetailModal Unicode icon replacement", () => {
  it("Gutenberg link does not use raw ↗ Unicode", () => {
    expect(modal).not.toMatch(/Gutenberg\s*↗/);
  });

  it("imports ArrowUpRightIcon", () => {
    expect(modal).toMatch(/ArrowUpRightIcon/);
  });

  it("Gutenberg link uses ArrowUpRightIcon", () => {
    expect(modal).toMatch(/Gutenberg.*ArrowUpRightIcon/s);
  });
});

describe("VocabWordTooltip Unicode icon replacement", () => {
  it("Wiktionary link does not use raw ↗ Unicode", () => {
    expect(tooltip).not.toMatch(/Wiktionary\s*↗/);
  });

  it("imports ArrowUpRightIcon", () => {
    expect(tooltip).toMatch(/ArrowUpRightIcon/);
  });

  it("Wiktionary link uses ArrowUpRightIcon", () => {
    expect(tooltip).toMatch(/Wiktionary.*ArrowUpRightIcon/s);
  });
});

describe("Icons.tsx exports ArrowUpRightIcon", () => {
  it("ArrowUpRightIcon is defined in Icons.tsx", () => {
    expect(icons).toMatch(/ArrowUpRightIcon/);
  });
});
