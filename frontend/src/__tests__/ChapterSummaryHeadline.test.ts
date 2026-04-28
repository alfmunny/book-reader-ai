/**
 * Regression test for #1930:
 * ChapterSummary idle empty state must have a font-serif headline — not just
 * icon + sub-text + CTA.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../components/ChapterSummary.tsx"),
  "utf8",
);

/**
 * Capture the idle empty state block: from "!summary && !loading && !error"
 * through the Generate Summary button.
 */
const idleBlock =
  src.match(/!summary && !loading && !error[\s\S]{0,800}Generate Summary/)?.[0] ?? "";

describe("ChapterSummary idle empty state (closes #1930)", () => {
  it("idle empty state block is found in source", () => {
    expect(idleBlock.length).toBeGreaterThan(0);
  });

  it("idle empty state has a font-serif headline", () => {
    expect(idleBlock).toMatch(/font-serif/);
  });

  it("idle empty state has SummaryIcon", () => {
    expect(idleBlock).toMatch(/SummaryIcon/);
  });
});
