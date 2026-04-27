import * as fs from "fs";
import * as path from "path";

// admin/layout.tsx unselected tab used text-amber-600 (≈3.62:1 on white)
// at text-sm — fails WCAG 1.4.3 AA. Closes #1637.

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/layout.tsx"),
  "utf8",
);

describe("admin nav unselected tab contrast (closes #1637)", () => {
  it("does not pair border-transparent with text-amber-600", () => {
    expect(src).not.toMatch(/border-transparent\s+text-amber-600/);
  });
});
