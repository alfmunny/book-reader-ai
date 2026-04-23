/**
 * Verifies vocabulary page uses SVG icons not raw Unicode arrows,
 * and sort mode buttons meet 44px minimum touch target.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf-8"
);

const iconsSrc = fs.readFileSync(
  path.join(__dirname, "../components/Icons.tsx"),
  "utf-8"
);

describe("Vocabulary page Unicode icon replacements", () => {
  it("export button does not use raw ↗ Unicode", () => {
    expect(src).not.toMatch(/↗\s*(Export|Obsidian)/);
  });

  it("Wiktionary link does not use raw ↗ Unicode", () => {
    expect(src).not.toMatch(/Wiktionary\s*↗/);
  });

  it("imports ArrowUpRightIcon", () => {
    expect(src).toMatch(/ArrowUpRightIcon/);
  });

  it("export button uses ArrowUpRightIcon", () => {
    const exportIdx = src.indexOf("export-all-btn");
    const snippet = src.slice(exportIdx, exportIdx + 300);
    expect(snippet).toMatch(/ArrowUpRightIcon/);
  });

  it("ArrowUpRightIcon is defined in Icons.tsx", () => {
    expect(iconsSrc).toMatch(/export function ArrowUpRightIcon/);
  });
});

describe("Vocabulary page sort button touch targets", () => {
  it("sort mode buttons have min-h-[44px]", () => {
    expect(src).toMatch(/sort-\$\{value\}[\s\S]{0,200}min-h-\[44px\]/);
  });
});
