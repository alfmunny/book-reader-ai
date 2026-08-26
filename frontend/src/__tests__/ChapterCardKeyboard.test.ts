import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "../components/ChapterAuditPanel.tsx"), "utf-8");

describe("Chapter rail — keyboard accessibility (WCAG 2.1.1)", () => {
  it("chapter rows are real buttons, not divs pretending to be", () => {
    // The old editor used a div with role="button" + onKeyDown to fake it. A
    // <button> is focusable and Enter/Space-activated for free.
    expect(src).toMatch(/<button\s+onClick=\{\(\) => setCur\(i\)\}/);
    expect(src).not.toMatch(/role="button"/);
  });

  it("each row names its chapter, flags and review state", () => {
    const idx = src.indexOf("aria-label={`Chapter ${i + 1}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 260);
    expect(window).toContain("untitled");
    expect(window).toContain("flag");
    expect(window).toContain("reviewed");
  });

  it("the scrollable chapter text is keyboard-reachable (#2519)", () => {
    const idx = src.indexOf('aria-label="Chapter text"');
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, idx - 120), idx)).toContain("tabIndex={0}");
  });
});
