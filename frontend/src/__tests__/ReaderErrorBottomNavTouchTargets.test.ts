import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("reader error-state and bottom-nav touch targets (closes #870)", () => {
  it("error-state Retry button has min-h-[44px]", () => {
    // anchor on retryChapterLoad (unique to this button's onClick)
    const idx = src.indexOf("retryChapterLoad}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("error-state Back to library button has min-h-[44px]", () => {
    // "Back to library" text appears after className
    const idx = src.indexOf("Back to library");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 20);
    expect(window).toContain("min-h-[44px]");
  });

  it("bottom Previous chapter button has min-h-[44px]", () => {
    const idx = src.indexOf('"bottom-prev-chapter"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain("min-h-[44px]");
  });

  it("bottom Next chapter button has min-h-[44px]", () => {
    const idx = src.indexOf('"bottom-next-chapter"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 350);
    expect(window).toContain("min-h-[44px]");
  });
});
