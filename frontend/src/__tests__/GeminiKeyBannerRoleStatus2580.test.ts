/**
 * Regression test for #2580:
 * The "Gemini key required" translation banner in the reader must carry
 * role="status" so screen readers announce it (WCAG 4.1.3 / 4.1.2).
 * The two sibling banners ("Translation queued", "Login required") already
 * have role="status" — this test guards parity for the third one.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader Gemini-key-required banner has role=status (closes #2580)", () => {
  it('banner div has role="status"', () => {
    // Anchor on the unique banner text — not the condition string which appears
    // earlier in the file as a setTranslationUsedProvider() argument.
    const idx = src.indexOf("Gemini API key in Settings");
    expect(idx).not.toBe(-1);
    // Look behind 450 chars to find the opening div (div is ~416 chars before link text)
    const block = src.slice(idx - 450, idx + 50);
    expect(block).toMatch(/role="status"/);
  });

  it("banner text is present for context", () => {
    expect(src).toContain("Gemini API key in Settings");
  });
});
