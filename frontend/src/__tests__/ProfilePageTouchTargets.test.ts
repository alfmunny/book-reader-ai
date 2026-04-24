import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/profile/page.tsx"),
  "utf8"
);

function windowAround(anchor: string, before = 300, after = 50): string {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  return src.slice(Math.max(0, idx - before), idx + after);
}

describe("Profile page touch targets (closes #816)", () => {
  it("Library/back button has min-h-[44px]", () => {
    expect(windowAround("Library")).toContain("min-h-[44px]");
  });

  it("Sign out button has min-h-[44px]", () => {
    expect(windowAround("Sign out")).toContain("min-h-[44px]");
  });

  it("Admin Panel button has min-h-[44px]", () => {
    expect(windowAround("Admin Panel")).toContain("min-h-[44px]");
  });

  it("Remove key button has min-h-[44px]", () => {
    expect(windowAround("Remove key")).toContain("min-h-[44px]");
  });

  it("Obsidian Remove token button has min-h-[44px]", () => {
    expect(windowAround("Token configured", 0, 400)).toContain("min-h-[44px]");
  });
});
