import * as fs from "fs";
import * as path from "path";

// page.tsx tabs use text-amber-600 (3.62:1 on white) at text-sm — fails
// WCAG 1.4.3 AA. Grid/List view toggles use text-amber-500 (2.74:1) —
// fails 1.4.11. Closes #1579.

const src = ["../components/SiteHeader.tsx", "../app/(shell)/page.tsx", "../app/(shell)/bookshelf/page.tsx"]
  .map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");

describe("homepage tab + view-toggle contrast (closes #1579)", () => {
  it("unselected tab does not use text-amber-600", () => {
    expect(src).not.toMatch(/border-transparent\s+text-amber-600/);
  });


});
