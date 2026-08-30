/**
 * Regression tests for #2541:
 * profile/page.tsx Obsidian Export <section> must have aria-label so it
 * exposes as role="region" for screen reader landmark navigation.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "app/(shell)/profile/page.tsx"),
  "utf-8"
);

describe("Profile Obsidian Export section has aria-label for landmark navigation (closes #2541)", () => {
  it('Obsidian Export section carries aria-label="Obsidian Export"', () => {
    expect(src).toContain('aria-label="Obsidian Export"');
  });

  it("aria-label is on a <section> element (not an inner element)", () => {
    const idx = src.indexOf('aria-label="Obsidian Export"');
    expect(idx).not.toBe(-1);
    // Look back up to 50 chars — the <section tag should appear immediately before the label
    const context = src.slice(Math.max(0, idx - 50), idx);
    expect(context).toMatch(/<section/);
  });

  it("Obsidian Export h2 button still has aria-controls pointing to the panel", () => {
    expect(src).toContain('aria-controls="obsidian-export-panel"');
  });
});
