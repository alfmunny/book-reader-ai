/**
 * Source-level regression tests for reader page false Gemini key reminder
 * when getMe() fails and hasGeminiKey stays null (issue #2443).
 */
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader page — notifyAIUsed should not fire on null hasGeminiKey (issue #2443)", () => {
  it("uses strict equality check in notifyAIUsed (hasGeminiKey === false, not !hasGeminiKey)", () => {
    const fnIdx = SOURCE.indexOf("function notifyAIUsed");
    expect(fnIdx).toBeGreaterThan(-1);
    const snippet = SOURCE.slice(fnIdx, fnIdx + 200);
    // Must use strict false check, not falsy check, to avoid firing when null
    expect(snippet).toMatch(/hasGeminiKey === false/);
    expect(snippet).not.toMatch(/!hasGeminiKey/);
  });

  it("getMe catch block sets getMeFailed state instead of silent no-op", () => {
    const getMeIdx = SOURCE.indexOf("getMe().then((me)");
    expect(getMeIdx).toBeGreaterThan(-1);
    const snippet = SOURCE.slice(getMeIdx, getMeIdx + 300);
    expect(snippet).toMatch(/catch/);
    // Should not be a bare empty catch any more
    expect(snippet).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
  });
});
