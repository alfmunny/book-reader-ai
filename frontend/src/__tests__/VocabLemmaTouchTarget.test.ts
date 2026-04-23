/**
 * Verifies vocabulary page lemma word button meets 44px minimum touch target.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf-8"
);

describe("Vocabulary page lemma word button touch target", () => {
  it("lemma button has min-h-[44px]", () => {
    expect(src).toMatch(/setActiveWord[\s\S]{0,200}min-h-\[44px\]/);
  });

  it("lemma button uses flex items-center for vertical alignment", () => {
    expect(src).toMatch(/setActiveWord[\s\S]{0,200}flex items-center/);
  });
});
