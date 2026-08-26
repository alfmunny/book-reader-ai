import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "../components/ChapterAuditPanel.tsx"), "utf8");

describe("Discard button icon meets WCAG 1.4.11 (closes #1568)", () => {
  it("shared control style does not use the too-faint text-stone-300", () => {
    const idx = src.indexOf("const tool =");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 400)).not.toContain("text-stone-300");
  });

  it("the discard control uses it", () => {
    const idx = src.indexOf("onClick={discard}");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, idx - 120), idx + 120)).toContain("className={tool}");
  });
});
