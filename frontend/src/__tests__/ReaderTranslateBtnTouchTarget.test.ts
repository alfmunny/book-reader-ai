import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader sidebar translate button touch target (closes #854)", () => {
  it("Translate this chapter button has min-h-[44px]", () => {
    // anchor on the onClick handler (unique to this button's JSX)
    const idx = src.indexOf("handleTranslateThisChapter}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain("min-h-[44px]");
  });
});
