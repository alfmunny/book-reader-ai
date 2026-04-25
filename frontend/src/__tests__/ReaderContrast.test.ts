import fs from "fs";
import path from "path";

const readerSrc = fs.readFileSync(
  path.resolve(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader page contrast (closes #1356)", () => {
  it("has no text-stone-400 on non-decorative text (remaining instances are aria-hidden separators)", () => {
    // Only aria-hidden separator spans should use text-stone-400
    const nonHiddenStone400 = readerSrc
      .split("\n")
      .filter((line) => line.includes("text-stone-400") && !line.includes('aria-hidden="true"'));
    expect(nonHiddenStone400).toHaveLength(0);
  });

  it("inactive tab buttons on stone-100 bg use text-stone-600 (6.26:1, not 2.65:1)", () => {
    expect(readerSrc).not.toContain('"text-stone-400 hover:text-stone-600"');
    expect(readerSrc).toContain("text-stone-600 hover:text-stone-800");
  });

  it("keyboard shortcuts heading uses text-stone-500 not text-stone-400", () => {
    expect(readerSrc).not.toContain("tracking-widest text-stone-400");
    expect(readerSrc).toContain("tracking-widest text-stone-500");
  });

  it("cache status spans use text-stone-500 not text-stone-400", () => {
    expect(readerSrc).not.toContain('"text-stone-400">Loaded from cache');
    expect(readerSrc).toContain('"text-stone-500">Loaded from cache');
  });

  it("separator pipe spans all have aria-hidden=true", () => {
    const separatorLines = readerSrc
      .split("\n")
      .filter((line) => line.includes("text-stone-400 mx-0.5"));
    expect(separatorLines.length).toBeGreaterThan(0);
    separatorLines.forEach((line) => {
      expect(line).toContain('aria-hidden="true"');
    });
  });
});
