import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

function checkBefore(anchor: string, before = 300): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, idx - before), idx + 20);
  expect(window).toContain("min-h-[44px]");
}

describe("reader admin retranslate and retry-failed button touch targets (closes #881)", () => {
  it("Retranslate chapter button has min-h-[44px]", () => {
    checkBefore("Retranslate chapter");
  });

  it("Retry failed translation button has min-h-[44px]", () => {
    checkBefore("Retry failed translation");
  });
});
