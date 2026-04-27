/**
 * Contrast regression for issue #1754:
 * InsightChat chapter-divider, save-button, and keyboard-hint must not use
 * text-gray-400 on white/light backgrounds (~2.8:1, fails WCAG AA 4.5:1).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8",
);

describe("InsightChat secondary contrast fixes (closes #1754)", () => {
  it("chapter-divider span does not use text-gray-400", () => {
    // text-[11px] text-gray-400 on the chapter header divider label
    expect(src).not.toMatch(/text-\[11px\] text-gray-400 font-medium px-1 shrink-0/);
  });

  it("save-to-notes button active state does not use text-gray-400", () => {
    // The active (unsaved) branch of the save button
    expect(src).not.toMatch(/"text-gray-400 hover:text-amber-700"/);
  });

  it("keyboard hint text does not use text-gray-400", () => {
    // "Enter to send · Shift+Enter for newline" helper text
    expect(src).not.toMatch(/text-\[11px\] text-gray-400 mt-1/);
  });
});
