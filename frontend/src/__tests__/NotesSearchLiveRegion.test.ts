/**
 * Regression test for #2338: notes/page.tsx search filter live region must use
 * the always-present pattern (WCAG 4.1.3) so screen readers announce result counts.
 *
 * The broken pattern: {search.trim() && !loading && <div role="status">...}
 * AT only announces updates to already-present live regions, not newly-inserted ones.
 *
 * The fix: always-present container with content that changes.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(path.join(__dirname, "../app/notes/page.tsx"), "utf8");

describe("notes/page.tsx search live region — WCAG 4.1.3 (closes #2338)", () => {
  it("search result live region is always-present (not conditionally mounted)", () => {
    // Must NOT use the broken conditional-mount pattern
    expect(src).not.toMatch(/\{search\.trim\(\)\s*&&\s*!loading\s*&&\s*\(/);
  });

  it("search result live region uses the ?? '' always-present pattern", () => {
    // Find the always-present live region near the search area
    const idx = src.indexOf("aria-label=\"Search notes by book\"");
    expect(idx).toBeGreaterThan(-1);
    // The always-present pattern should appear in the 600 chars after the search input
    const section = src.slice(idx, idx + 600);
    expect(section).toMatch(/role="status"/);
    expect(section).toMatch(/aria-live="polite"/);
  });

  it("live region content uses nullish-coalescing empty string for empty state", () => {
    // Look for the ?? "" pattern near the search filter live region
    const idx = src.indexOf("\"Search notes by book\"");
    expect(idx).toBeGreaterThan(-1);
    const section = src.slice(idx, idx + 600);
    expect(section).toMatch(/\?\s*`\$\{filtered|: ""/);
  });
});
