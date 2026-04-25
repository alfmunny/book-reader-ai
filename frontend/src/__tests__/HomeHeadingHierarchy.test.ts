/**
 * Static assertion: home page section labels use <h2> instead of <p>.
 * Closes #1158
 */
import fs from "fs";
import path from "path";

const homePage = fs.readFileSync(
  path.join(process.cwd(), "src/app/page.tsx"),
  "utf8",
);

describe("Home page heading hierarchy", () => {
  it('uses <h2> for "Continue Reading" section label', () => {
    expect(homePage).toMatch(/<h2[^>]*>\s*Continue Reading/);
  });

  it('uses <h2> for "Your Progress" section label', () => {
    expect(homePage).toMatch(/<h2[^>]*>\s*Your Progress/);
  });

  it('uses <h2> for "Your Library" section label', () => {
    expect(homePage).toMatch(/<h2[^>]*>\s*Your Library/);
  });

  it("does not use <p> for any of the three section labels", () => {
    expect(homePage).not.toMatch(/<p[^>]*>\s*Continue Reading/);
    expect(homePage).not.toMatch(/<p[^>]*>\s*Your Progress/);
    expect(homePage).not.toMatch(/<p[^>]*>\s*Your Library/);
  });
});
