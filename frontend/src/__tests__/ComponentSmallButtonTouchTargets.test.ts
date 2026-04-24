import * as fs from "fs";
import * as path from "path";

const chapterSummary = fs.readFileSync(
  path.join(__dirname, "../components/ChapterSummary.tsx"),
  "utf8"
);
const tagEditor = fs.readFileSync(
  path.join(__dirname, "../components/TagEditor.tsx"),
  "utf8"
);
const searchBar = fs.readFileSync(
  path.join(__dirname, "../components/SearchBar.tsx"),
  "utf8"
);

function checkForward(src: string, anchor: string, radius = 250): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(idx, idx + radius);
  expect(window).toContain("min-h-[44px]");
}

describe("small component button touch targets (closes #874)", () => {
  it("ChapterSummary Refresh/Generate button has min-h-[44px]", () => {
    checkForward(chapterSummary, 'title="Regenerate summary"');
  });

  it("TagEditor Add tag button has min-h-[44px]", () => {
    checkForward(tagEditor, '"Add tag"');
  });

  it("SearchBar Esc close button has min-h-[44px]", () => {
    checkForward(searchBar, '"Close search"');
  });
});
