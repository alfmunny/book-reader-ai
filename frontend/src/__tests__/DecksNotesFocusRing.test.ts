import fs from "fs";
import path from "path";

const decksPage = fs.readFileSync(
  path.resolve(__dirname, "../app/decks/page.tsx"),
  "utf8",
);
const decksNew = fs.readFileSync(
  path.resolve(__dirname, "../app/decks/new/page.tsx"),
  "utf8",
);
const notesPage = fs.readFileSync(
  path.resolve(__dirname, "../app/notes/page.tsx"),
  "utf8",
);
const flashcardsPage = fs.readFileSync(
  path.resolve(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8",
);

describe("decks page button focus rings (closes #2172)", () => {
  it("Library back button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(decksPage).toMatch(/Library[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?Library/);
  });

  it("New Deck button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(decksPage).toMatch(/New deck[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?New deck/);
  });

  it("decks page has at least 3 focus-visible:ring-2 instances", () => {
    const matches = decksPage.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

describe("decks/new page button focus rings (closes #2172)", () => {
  it("Decks back button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(decksNew).toMatch(/Decks[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?Decks/);
  });

  it("Create deck submit button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(decksNew).toMatch(/handleSubmit[\s\S]{0,400}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,400}?handleSubmit/);
  });

  it("decks/new page has at least 2 focus-visible:ring-2 instances", () => {
    const matches = decksNew.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("notes page button focus rings (closes #2172)", () => {
  it("Library back button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(notesPage).toMatch(/router\.push\("\/"\)[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?router\.push\("\/"\)/);
  });

  it("notes page has at least 3 focus-visible:ring-2 instances", () => {
    const matches = notesPage.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

describe("flashcards page button focus rings (closes #2172)", () => {
  it("Back button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(flashcardsPage).toMatch(/Back to vocabulary[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?Back to vocabulary/);
  });

  it("Show answer button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(flashcardsPage).toMatch(/Show answer[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?Show answer/);
  });

  it("grade buttons have focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(flashcardsPage).toMatch(/handleGrade[\s\S]{0,450}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,450}?handleGrade/);
  });

  it("flashcards page has at least 4 focus-visible:ring-2 instances", () => {
    const matches = flashcardsPage.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});
