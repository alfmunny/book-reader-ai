import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/upload/[bookId]/chapters/page.tsx"),
  "utf8"
);

describe("upload/chapters Remove chapter button touch target (closes #942)", () => {
  it("Remove chapter button has min-h-[44px]", () => {
    const idx = src.indexOf('aria-label={`Remove chapter');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain("min-h-[44px]");
  });

  it("Remove chapter button has min-w-[44px]", () => {
    const idx = src.indexOf('aria-label={`Remove chapter');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain("min-w-[44px]");
  });
});
