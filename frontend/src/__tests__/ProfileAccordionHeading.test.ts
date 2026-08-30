import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/profile/page.tsx"),
  "utf-8"
);

describe("Profile accordion WAI-ARIA heading nesting", () => {
  it("should not have <h2> or <h3> as a descendant of <button>", () => {
    // Find all button blocks and ensure no heading tags are nested inside
    // The WAI-ARIA accordion pattern requires <h2><button>...</button></h2>
    // NOT <button><h2>...</h2></button>
    const buttonHeadingNesting = /<button[^>]*>(?:[^<]|<(?!\/button)[^>]*>)*<h[1-6]/s.test(src);
    expect(buttonHeadingNesting).toBe(false);
  });

  it("accordion button should be wrapped in a heading element", () => {
    // The Obsidian Export section should have the heading wrap the button
    // Look for <h2 or similar before the obsidian button
    const obsidianIdx = src.indexOf("obsidian-export-panel");
    expect(obsidianIdx).toBeGreaterThan(-1);
    // The aria-controls button should be preceded by a heading tag (within ~200 chars)
    const vicinity = src.slice(Math.max(0, obsidianIdx - 400), obsidianIdx);
    const hasHeadingWrapButton = /<h[1-6][^>]*>\s*<button/.test(vicinity);
    expect(hasHeadingWrapButton).toBe(true);
  });
});
