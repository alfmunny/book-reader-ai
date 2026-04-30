/**
 * Regression test for issue #2396: Obsidian form marks all three fields
 * aria-invalid on a generic save error — a WCAG 1.3.1 violation.
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("ProfilePage — Obsidian form aria-invalid (issue #2396)", () => {
  const src = read("src/app/profile/page.tsx");

  it("does not scatter aria-invalid across all Obsidian fields for a generic error", () => {
    // Count how many Obsidian input elements apply aria-invalid based on obsidianMsg
    const matches = [
      ...src.matchAll(/id="obsidian-(?:token|repo|path)"[\s\S]{0,400}?aria-invalid/g),
    ];
    // At most ONE field should carry aria-invalid — a generic network error should
    // not mark every field invalid.
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it("keeps role=status region as the primary error communication channel", () => {
    // The obsidian-msg paragraph must have role=status so screen readers
    // announce save errors without requiring aria-invalid on each field.
    expect(src).toMatch(/id="obsidian-msg"[^>]*role="status"/);
  });

  it("keeps aria-describedby pointing to obsidian-msg on the repo field", () => {
    // Fields may still reference the status region via aria-describedby.
    expect(src).toMatch(/id="obsidian-repo"[\s\S]{0,300}?aria-describedby="obsidian-msg"/);
  });
});
