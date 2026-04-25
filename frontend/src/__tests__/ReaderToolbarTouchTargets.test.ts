import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

// All toolbar buttons have className after the identifier — use forward window.
function checkForward(anchor: string, radius = 250): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(idx, idx + radius);
  expect(window).toContain("min-h-[44px]");
}

describe("reader desktop toolbar touch targets (closes #871)", () => {
  it("Theme cycle button has min-h-[44px]", () => {
    checkForward("onClick={cycleTheme}");
  });

  it("Insight chat toggle has min-h-[44px]", () => {
    checkForward('"Toggle insight chat"');
  });

  it("Translate toggle has min-h-[44px]", () => {
    checkForward('title="Translation"');
  });

  it("Chapter summary toggle has min-h-[44px]", () => {
    checkForward('"Chapter summary"');
  });

  it("Notes toggle has min-h-[44px]", () => {
    checkForward('"Annotations & notes"');
  });

  it("Show/hide annotation marks button has min-h-[44px]", () => {
    // setItem anchor is inside the button's onClick (only 1 occurrence)
    checkForward('setItem("reader-show-annotations"', 400);
  });

  it("Vocabulary toggle has min-h-[44px]", () => {
    checkForward('title="Vocabulary"');
  });

  it("Obsidian export button has min-h-[44px]", () => {
    checkForward("onClick={handleObsidianExport}");
  });

  it("Focus mode toggle has min-h-[44px]", () => {
    checkForward('"Focus mode (F)"');
  });
});
