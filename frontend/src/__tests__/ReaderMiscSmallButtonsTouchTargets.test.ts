import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

function checkForward(anchor: string, radius = 200): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(idx, idx + radius);
  expect(window).toContain("min-h-[44px]");
}

describe("reader miscellaneous small button touch targets (closes #882)", () => {
  it("Gemini reminder Dismiss button has min-h-[44px]", () => {
    // Unique: setGeminiReminderVisible(false) is only in this button's onClick
    checkForward("setGeminiReminderVisible(false)");
  });

  it("Typography Aa panel toggle has min-h-[44px]", () => {
    checkForward('"Typography settings"');
  });

  it("Notes sidebar chapter-section collapse button has min-h-[44px]", () => {
    // Unique text in the button body; className appears before it
    const anchor = "Chapter {ch + 1}";
    const idx = src.indexOf(anchor);
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 620), idx + 20);
    expect(window).toContain("min-h-[44px]");
  });

  it("Vocab sidebar View all button has min-h-[44px]", () => {
    checkForward('router.push("/vocabulary")');
  });
});
