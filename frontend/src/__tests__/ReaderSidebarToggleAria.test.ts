import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

function checkButton(anchorText: string, label: string) {
  const idx = src.indexOf(anchorText);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(idx, idx + 600);
  expect(window).toContain(`aria-label="${label}"`);
  expect(window).toContain("aria-expanded");
}

describe("reader desktop header sidebar toggle buttons aria-label and aria-expanded (closes #951)", () => {
  it("Insight chat toggle has aria-label and aria-expanded", () => {
    checkButton('setSidebarTab("chat")', "Insight chat");
  });

  it("Translate toggle has aria-label and aria-expanded", () => {
    checkButton('setSidebarTab("translate")', "Translation");
  });

  it("Chapter summary toggle has aria-label and aria-expanded", () => {
    checkButton('setSidebarTab("summary")', "Chapter summary");
  });

  it("Notes toggle has aria-label and aria-expanded", () => {
    checkButton('setSidebarTab("notes")', "Notes");
  });

  it("Vocabulary toggle has aria-label and aria-expanded", () => {
    checkButton('setSidebarTab("vocab")', "Vocabulary");
  });
});
