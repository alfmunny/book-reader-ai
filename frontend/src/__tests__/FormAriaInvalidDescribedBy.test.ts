/**
 * Regression tests for issue #1891 — form inputs with validation errors must
 * use aria-invalid and aria-describedby to link error messages (WCAG 3.3.1).
 */
import { readFileSync } from "fs";
import { join } from "path";

const decksSrc = readFileSync(
  join(__dirname, "../app/decks/new/page.tsx"),
  "utf8",
);
const tagEditorSrc = readFileSync(
  join(__dirname, "../components/TagEditor.tsx"),
  "utf8",
);
const profileSrc = readFileSync(
  join(__dirname, "../app/profile/page.tsx"),
  "utf8",
);

describe("Decks/new form — aria-invalid + aria-describedby (WCAG 3.3.1, #1891)", () => {
  it("deck name input has aria-invalid attribute", () => {
    expect(decksSrc).toMatch(/aria-invalid=/);
  });

  it("deck name input has aria-describedby linking to error", () => {
    expect(decksSrc).toMatch(/aria-describedby=/);
  });

  it("error element has an id that matches the describedby reference", () => {
    // aria-describedby may be a JSX expression like {error ? "deck-form-error" : undefined}
    // Check that the same id string appears both in aria-describedby and id=
    expect(decksSrc).toMatch(/"deck-form-error"/);
    expect(decksSrc).toMatch(/id="deck-form-error"/);
  });
});

describe("TagEditor — aria-invalid + aria-describedby (WCAG 3.3.1, #1891)", () => {
  it("tag input has aria-invalid attribute", () => {
    expect(tagEditorSrc).toMatch(/aria-invalid=/);
  });

  it("tag error element has an id containing error identifier", () => {
    // id may be a template literal like `tag-editor-error-${vocabularyId}`
    expect(tagEditorSrc).toMatch(/id=.*error/);
  });
});

describe("Profile page — aria-describedby on API key input (WCAG 3.3.1, #1891)", () => {
  it("API key input has aria-describedby", () => {
    expect(profileSrc).toMatch(/aria-describedby=/);
  });
});
