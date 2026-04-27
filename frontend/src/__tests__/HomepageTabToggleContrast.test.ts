import * as fs from "fs";
import * as path from "path";

// page.tsx tabs use text-amber-600 (3.62:1 on white) at text-sm — fails
// WCAG 1.4.3 AA. Grid/List view toggles use text-amber-500 (2.74:1) —
// fails 1.4.11. Closes #1579.

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8",
);

describe("homepage tab + view-toggle contrast (closes #1579)", () => {
  it("unselected tab does not use text-amber-600", () => {
    expect(src).not.toMatch(/border-transparent\s+text-amber-600/);
  });

  it("Grid view toggle does not use text-amber-500", () => {
    const idx = src.indexOf('aria-label="Grid view"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 400);
    expect(window).not.toMatch(/text-amber-500/);
  });

  it("List view toggle does not use text-amber-500", () => {
    const idx = src.indexOf('aria-label="List view"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 400);
    expect(window).not.toMatch(/text-amber-500/);
  });
});
