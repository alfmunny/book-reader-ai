import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/profile/page.tsx"),
  "utf8"
);

function checkBefore(anchor: string, before = 300): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, idx - before), idx + 20);
  expect(window).toContain("min-h-[44px]");
}

describe("profile page save button touch targets (closes #873)", () => {
  it("Save key button has min-h-[44px]", () => {
    checkBefore("Save key");
  });

  it("Save Obsidian settings button has min-h-[44px]", () => {
    checkBefore("Save Obsidian settings");
  });

  it("Save preferences button has min-h-[44px]", () => {
    checkBefore("Save preferences");
  });
});
