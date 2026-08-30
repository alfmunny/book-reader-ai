/**
 * Regression test for #2095 — search page initial empty state must have
 * a semantic <h2> heading (not <p>) and a CTA button pointing to "/".
 * WCAG 1.3.1: info conveyed visually should be programmatically determinable.
 * CLAUDE.md: every empty state needs a headline, sub-text, and a primary CTA.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/search/page.tsx"),
  "utf8",
);

describe("Search page initial empty state (closes #2095)", () => {
  it("initial empty state uses a semantic heading element, not <p>", () => {
    // The initial empty state block starts with !q.trim()
    const idx = src.indexOf("{!q.trim() &&");
    expect(idx).toBeGreaterThan(-1);
    // Grab the block: 600 chars after the marker
    const block = src.slice(idx, idx + 600);
    // Should contain h2 for the title
    expect(block).toContain("<h2");
    // Should NOT use <p> for the visible title text
    const titleIdx = block.indexOf("Search your notes");
    expect(titleIdx).toBeGreaterThan(-1);
    const tagBefore = block.slice(Math.max(0, titleIdx - 80), titleIdx);
    expect(tagBefore).not.toMatch(/<p\b/);
  });

  it("initial empty state contains a CTA link to the home page", () => {
    const idx = src.indexOf("{!q.trim() &&");
    const block = src.slice(idx, idx + 800);
    // Should have a link/button pointing to "/"
    expect(block).toContain('href="/"');
  });
});
