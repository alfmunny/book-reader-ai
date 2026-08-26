import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "../components/ChapterAuditPanel.tsx"), "utf8");

describe("audit panel control touch targets (closes #942)", () => {
  it("shared control style meets the 44px minimum on mobile", () => {
    const idx = src.indexOf("const tool =");
    expect(idx).toBeGreaterThan(-1);
    const style = src.slice(idx, idx + 400);
    expect(style).toContain("min-h-[44px]");
    expect(style).toContain("md:min-h-0");
  });

  it("discard and merge both go through it", () => {
    for (const handler of ["onClick={discard}", "onClick={mergeIntoPrevious}"]) {
      const idx = src.indexOf(handler);
      expect(idx).toBeGreaterThan(-1);
      expect(src.slice(Math.max(0, idx - 120), idx + 120)).toContain("className={tool}");
    }
  });
});
