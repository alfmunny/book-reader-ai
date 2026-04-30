/**
 * Regression tests for #2533:
 * Profile page <section> elements with <h2> headings must have aria-labelledby
 * so they expose as role="region" landmarks (not role="generic") in the
 * accessibility tree, enabling landmark navigation for screen reader users.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "app/profile/page.tsx"),
  "utf-8"
);

function sectionHasLabelledby(headingId: string): boolean {
  // Check that a <section> element has aria-labelledby referencing the given id
  const pattern = new RegExp(`aria-labelledby="${headingId}"`);
  return pattern.test(src);
}

function headingHasId(text: string, id: string): boolean {
  // Check that an h2 containing the text also has the given id
  const idx = src.indexOf(text);
  if (idx === -1) return false;
  const context = src.slice(Math.max(0, idx - 100), idx + 50);
  return context.includes(`id="${id}"`);
}

describe("Profile page sections have aria-labelledby for landmark navigation (closes #2533)", () => {
  it("Account section h2 has id attribute", () => {
    expect(headingHasId(">Account<", "profile-account-heading")).toBe(true);
  });

  it("Account section has aria-labelledby", () => {
    expect(sectionHasLabelledby("profile-account-heading")).toBe(true);
  });

  it("Study decks section has aria-labelledby or aria-label", () => {
    const hasLabelledby = sectionHasLabelledby("profile-decks-heading");
    const hasLabel = src.includes('aria-label="Study decks"');
    expect(hasLabelledby || hasLabel).toBe(true);
  });

  it("Gemini API Key section h2 has id attribute", () => {
    expect(headingHasId("Gemini API Key", "profile-gemini-heading")).toBe(true);
  });

  it("Gemini API Key section has aria-labelledby", () => {
    expect(sectionHasLabelledby("profile-gemini-heading")).toBe(true);
  });

  it("Preferences section h2 has id attribute", () => {
    // ">Preferences<" is unique — "Reader Preferences" has ">Reader " before it, not ">"
    expect(headingHasId(">Preferences</h2>", "profile-preferences-heading")).toBe(true);
  });

  it("Preferences section has aria-labelledby", () => {
    expect(sectionHasLabelledby("profile-preferences-heading")).toBe(true);
  });
});
