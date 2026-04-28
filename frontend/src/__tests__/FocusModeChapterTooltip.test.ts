import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Focus mode HUD chapter title tooltip", () => {
  it("truncated chapter title span has a title attribute for tooltip", () => {
    // The truncated chapter title in the focus-mode HUD must have a title attribute
    // so users can hover to see the full title when it's truncated
    const hasTitleOnTruncatedSpan = /max-w-\[180px\] truncate font-medium"[^>]*title=/.test(src) ||
      /truncate font-medium"[\s\S]{0,100}title=\{chapters/.test(src);
    expect(hasTitleOnTruncatedSpan).toBe(true);
  });
});
