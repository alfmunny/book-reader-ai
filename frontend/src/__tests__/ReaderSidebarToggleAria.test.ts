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
  // Accept either a static aria-label="..." or a dynamic aria-label={...} that
  // contains the label text (e.g. when the label includes a runtime count).
  const hasStaticLabel = window.includes(`aria-label="${label}"`);
  const hasDynamicLabel = window.includes(`aria-label={`) && window.includes(label);
  expect(hasStaticLabel || hasDynamicLabel).toBe(true);
  // aria-pressed is correct for toggle buttons that open a panel;
  // aria-expanded was replaced in #1862 (it's for accordion/disclosure patterns)
  expect(window).toContain("aria-pressed");
}

describe("reader desktop header sidebar toggle buttons aria-label and aria-pressed (closes #951, #1862)", () => {
  it("Insight chat toggle has aria-label and aria-pressed", () => {
    checkButton('setSidebarTab("chat")', "Insight sidebar");
  });

  it("Translate toggle has aria-label and aria-pressed", () => {
    checkButton('setSidebarTab("translate")', "Translate");
  });


  it("Notes toggle has aria-label and aria-pressed", () => {
    checkButton('setSidebarTab("notes")', "Annotations & notes");
  });

  it("Vocabulary toggle has aria-label and aria-pressed", () => {
    checkButton('setSidebarTab("vocab")', "Vocabulary");
  });
});
