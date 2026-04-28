/**
 * Regression test for #1912:
 * The Obsidian vocabulary-export button must have aria-label="Export vocabulary to Obsidian"
 * so screen readers announce a complete action instead of just "Obsidian".
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader page Obsidian export button accessibility (closes #1912)", () => {
  it("Obsidian export button has aria-label describing the export action", () => {
    expect(src).toMatch(/aria-label="Export vocabulary to Obsidian"/);
  });

  it("Obsidian export button does not rely solely on title= for its accessible name", () => {
    // Verify aria-label appears near the onClick={handleObsidianExport} button attribute
    const exportBtnSection =
      src.match(/onClick=\{handleObsidianExport\}[\s\S]{0,400}Obsidian/)?.[0] ?? "";
    expect(exportBtnSection).toMatch(/aria-label=/);
  });
});
