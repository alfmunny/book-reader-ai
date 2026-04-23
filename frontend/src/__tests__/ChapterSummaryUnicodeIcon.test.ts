/**
 * Verifies ChapterSummary Refresh button does not use raw Unicode ↻ symbol.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/ChapterSummary.tsx"),
  "utf-8"
);

describe("ChapterSummary Unicode icon replacement", () => {
  it("does not use raw ↻ Unicode in button text", () => {
    expect(src).not.toMatch(/↻\s*Refresh/);
  });

  it("imports RetryIcon from Icons", () => {
    expect(src).toMatch(/RetryIcon/);
  });

  it("Refresh button uses RetryIcon", () => {
    expect(src).toMatch(/RetryIcon[\s\S]{0,80}Refresh/);
  });
});
