/**
 * Static assertion: home page tab buttons set aria-current=page when active.
 * Closes #1121
 */
import fs from "fs";
import path from "path";

const homePage = fs.readFileSync(
  path.join(process.cwd(), "src/app/page.tsx"),
  "utf8",
);

describe("Home page tab aria-current", () => {
  it("tab buttons include aria-current bound to active tab", () => {
    expect(homePage).toMatch(/aria-current=\{tab === key \? "page" : undefined\}/);
  });
});
