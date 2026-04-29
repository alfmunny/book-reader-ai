import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/login/page.tsx"),
  "utf8",
);

describe("login page OAuth button focus rings (closes #2162)", () => {
  it("Google button has focus-visible ring for WCAG 2.4.7", () => {
    expect(src).toMatch(/Continue with Google[\s\S]*?focus-visible:ring-2|focus-visible:ring-2[\s\S]*?Continue with Google/);
  });

  it("all OAuth buttons use focus-visible:ring-2 (checked by count ≥ 3)", () => {
    const matches = src.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});
