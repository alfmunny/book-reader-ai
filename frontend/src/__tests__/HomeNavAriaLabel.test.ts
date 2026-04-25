/**
 * Regression test for #1308: home page tab bar <nav> must have aria-label.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8"
);

describe("Home page nav landmark (closes #1308)", () => {
  it("tab bar nav has aria-label", () => {
    expect(src).toContain('aria-label="Main navigation"');
  });
});
