/**
 * Static assertion: decorative AI-circle SVG in InsightChat has aria-hidden=true.
 * Closes #1211
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("InsightChat AI icon a11y", () => {
  it("decorative AI-circle SVG sets aria-hidden=true", () => {
    const src = read("src/components/InsightChat.tsx");
    // Look for the specific SVG by its viewBox 0 0 20 20 (info-style circle icon)
    const idx = src.indexOf('viewBox="0 0 20 20"');
    expect(idx).toBeGreaterThan(0);
    // Within the surrounding 200 chars, aria-hidden=true must be present on the svg
    const window = src.slice(Math.max(0, idx - 200), idx + 200);
    expect(window).toMatch(/<svg[^>]*aria-hidden=["']?true["']?/);
  });
});
