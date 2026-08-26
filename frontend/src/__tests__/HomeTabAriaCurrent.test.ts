/**
 * Static assertion: home page tab buttons set aria-current=page when active.
 * Closes #1121
 */
import fs from "fs";
import path from "path";

const siteHeader = fs.readFileSync(
  path.join(process.cwd(), "src/components/SiteHeader.tsx"),
  "utf8",
);

describe("Primary nav aria-current", () => {
  it("Home link marks itself current when active", () => {
    expect(siteHeader).toMatch(/aria-current=\{current === "home" \? "page" : undefined\}/);
  });

  it("Bookshelf link marks itself current when active", () => {
    expect(siteHeader).toMatch(/aria-current=\{current === "bookshelf" \? "page" : undefined\}/);
  });
});
