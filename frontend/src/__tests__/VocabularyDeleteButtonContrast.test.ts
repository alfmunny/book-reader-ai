import * as fs from "fs";
import * as path from "path";

// vocabulary/page.tsx per-form Delete button used text-xs text-red-400
// (≈3.34:1 on white) for visible "Delete" text — failed WCAG 1.4.3 AA.
// Closes #1665.

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf8",
);

describe("vocabulary Delete button contrast (closes #1665)", () => {
  it("does not pair text-xs with text-red-400 in a className", () => {
    expect(src).not.toMatch(/text-xs[^"]*text-red-400/);
    expect(src).not.toMatch(/text-red-400[^"]*text-xs/);
  });
});
