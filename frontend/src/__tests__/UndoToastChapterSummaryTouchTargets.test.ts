import * as fs from "fs";
import * as path from "path";

const undo = fs.readFileSync(
  path.join(__dirname, "../components/UndoToast.tsx"),
  "utf8"
);
const summary = fs.readFileSync(
  path.join(__dirname, "../components/ChapterSummary.tsx"),
  "utf8"
);

describe("UndoToast and ChapterSummary touch targets (closes #833)", () => {
  it("UndoToast Undo button has min-h-[44px]", () => {
    const idx = undo.indexOf("onClick={handleUndo}");
    expect(idx).toBeGreaterThan(-1);
    const window = undo.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("ChapterSummary Refresh/Generate inline button has min-h-[44px]", () => {
    const idx = summary.indexOf("Regenerate summary");
    expect(idx).toBeGreaterThan(-1);
    const window = summary.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("ChapterSummary Try-again error button has min-h-[44px]", () => {
    const idx = summary.indexOf("Try again");
    expect(idx).toBeGreaterThan(-1);
    const window = summary.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain("min-h-[44px]");
  });

  it("ChapterSummary Generate Summary CTA has min-h-[44px]", () => {
    const idx = summary.indexOf("Generate Summary");
    expect(idx).toBeGreaterThan(-1);
    const window = summary.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain("min-h-[44px]");
  });
});
