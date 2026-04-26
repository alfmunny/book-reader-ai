import * as fs from "fs";
import * as path from "path";

// text-red-500 on red-50 at text-xs fails WCAG 1.4.3 AA (≈3.9:1).
// Closes #1551.

const src = fs.readFileSync(
  path.join(__dirname, "../components/ChapterSummary.tsx"),
  "utf8",
);

describe("ChapterSummary error-detail contrast (closes #1551)", () => {
  it("does not use text-red-500 at text-xs", () => {
    expect(src).not.toMatch(/text-xs[^"]*text-red-500/);
    expect(src).not.toMatch(/text-red-500[^"]*text-xs/);
  });
});
