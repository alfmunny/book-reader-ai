import * as fs from "fs";
import * as path from "path";

// Per CLAUDE.md graphic design rules, UI icons must come from Icons.tsx (SVG),
// not Unicode arrow characters which render inconsistently across OS/browser.
// Closes #1539.

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("Unicode arrows must not be used as UI icons (closes #1539)", () => {
  it("QueueTab does not use ↑ or ↓ as button content for chain reorder", () => {
    const src = read("components/QueueTab.tsx");
    // Match Unicode arrow as direct JSX text content (between > and <).
    expect(src).not.toMatch(/>\s*↑\s*</);
    expect(src).not.toMatch(/>\s*↓\s*</);
  });

  it("SeedPopularButton does not use ↓ as a downloading indicator", () => {
    const src = read("components/SeedPopularButton.tsx");
    expect(src).not.toMatch(/↓\s*\{state\.current_book_title/);
  });

  it("InsightChat does not use ↑ as a load-earlier glyph", () => {
    const src = read("components/InsightChat.tsx");
    expect(src).not.toMatch(/↑\s*Load earlier/);
  });
});
