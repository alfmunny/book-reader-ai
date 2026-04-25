/**
 * Static assertion: profile page section group labels use <h2>.
 * Closes #1162
 */
import fs from "fs";
import path from "path";

const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/profile/page.tsx"),
  "utf8",
);

describe("Profile page section group labels", () => {
  it('uses <h2> for "AI & Integrations" group label', () => {
    expect(page).toMatch(/<h2[^>]*>AI &amp; Integrations<\/h2>/);
  });

  it('uses <h2> for "Reader Preferences" group label', () => {
    expect(page).toMatch(/<h2[^>]*>Reader Preferences<\/h2>/);
  });

  it("does not use <p> for these group labels", () => {
    expect(page).not.toMatch(/<p[^>]*>AI &amp; Integrations<\/p>/);
    expect(page).not.toMatch(/<p[^>]*>Reader Preferences<\/p>/);
  });
});
