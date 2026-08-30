import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/(shell)/profile/page.tsx"),
  "utf8",
);

describe("profile page button focus rings (closes #2170)", () => {
  it("back-to-Library button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    // Library back button is now a <Link href="/"> — match on href="/" near focus-visible:ring-2
    expect(src).toMatch(/href="\/"\s*[\s\S]{0,200}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,200}?href="\//);
  });

  it("Sign out button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(src).toMatch(/Sign out[\s\S]{0,400}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,400}?Sign out/);
  });

  it("Save Gemini key button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(src).toMatch(/Save key[\s\S]{0,400}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,400}?Save key/);
  });

  it("Save preferences button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(src).toMatch(/savePreferences[\s\S]{0,400}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,400}?savePreferences/);
  });

  it("profile page has at least 5 focus-visible:ring-2 instances covering all buttons", () => {
    const matches = src.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});
