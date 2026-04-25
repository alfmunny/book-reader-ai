import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("reader display mode buttons aria-pressed (issue #1278)", () => {
  it("sets aria-pressed for inline button in settings panel", () => {
    expect(src).toMatch(/aria-pressed=\{displayMode === "inline"\}/);
  });

  it("sets aria-pressed for parallel button in settings panel", () => {
    expect(src).toMatch(/aria-pressed=\{displayMode === "parallel"\}/);
  });

  it("has aria-pressed on both occurrences of inline button", () => {
    const matches = [...src.matchAll(/aria-pressed=\{displayMode === "inline"\}/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("has aria-pressed on both occurrences of parallel button", () => {
    const matches = [...src.matchAll(/aria-pressed=\{displayMode === "parallel"\}/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
