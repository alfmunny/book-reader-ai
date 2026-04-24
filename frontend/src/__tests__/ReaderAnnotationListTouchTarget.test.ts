import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("reader annotation list button touch target (closes #946)", () => {
  it("annotation list button has min-h-[44px]", () => {
    // The annotation list button navigates to a sentence on click.
    // Find the button containing the annotation sentence display.
    const idx = src.indexOf("ann.sentence_text}</div>");
    expect(idx).toBeGreaterThan(-1);
    // The className is within 400 chars before the content
    const window = src.slice(Math.max(0, idx - 400), idx + 50);
    expect(window).toContain("min-h-[44px]");
  });
});
