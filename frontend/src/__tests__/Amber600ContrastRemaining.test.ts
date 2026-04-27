/**
 * Contrast regression for issue #1780:
 * Remaining bg-amber-600 text-white instances that fail WCAG AA 4.5:1.
 * amber-600 (#d97706) yields ~3.75:1 against white — below the 4.5:1 minimum
 * for normal/small text.
 *
 * Reader floating-toolbar notes badge (text-[8px]) → must use bg-amber-800.
 * AnnotationsSidebar count badge (text-[10px]) → must use bg-amber-800.
 * InsightChat user-message bubble (prose text) → must use bg-amber-700 (5:1).
 */
import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);
const sidebarSrc = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8",
);
const chatSrc = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8",
);

describe("Remaining amber-600 contrast failures (closes #1780)", () => {
  it("reader notes floating-toolbar badge does not use bg-amber-600 on tiny text", () => {
    // The notes badge at -top-1/-right-1 (text-[8px]) must not be amber-600
    expect(readerSrc).not.toMatch(
      /absolute -top-1 -right-1.*bg-amber-600|bg-amber-600.*absolute -top-1 -right-1/,
    );
  });

  it("AnnotationsSidebar count badge does not use bg-amber-600", () => {
    expect(sidebarSrc).not.toMatch(/bg-amber-600 text-white/);
  });

  it("InsightChat user message bubble does not use bg-amber-600", () => {
    expect(chatSrc).not.toMatch(/bg-amber-600 text-white rounded-2xl/);
  });
});
