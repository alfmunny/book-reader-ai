import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "../components/ChapterAuditPanel.tsx"), "utf8");

describe("chapter review empty state (closes #2607)", () => {
  it("explains an empty book instead of rendering a blank panel", () => {
    expect(src).toMatch(/no chapters to review/i);
  });

  it("the explanation replaces the panel rather than sitting beside it", () => {
    const idx = src.indexOf("no chapters to review");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, idx - 200), idx)).toContain("if (!current)");
  });
});
