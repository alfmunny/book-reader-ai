import * as fs from "fs";
import * as path from "path";

const importPageSrc = fs.readFileSync(
  path.join(__dirname, "../app/import/[bookId]/page.tsx"),
  "utf8"
);
const loginPageSrc = fs.readFileSync(
  path.join(__dirname, "../app/login/page.tsx"),
  "utf8"
);
const notesPageSrc = fs.readFileSync(
  path.join(__dirname, "../app/notes/page.tsx"),
  "utf8"
);

describe("Card containers use --shadow-card CSS variable instead of hardcoded shadow-sm", () => {
  it("import page main card uses var(--shadow-card) inline style", () => {
    expect(importPageSrc).toContain('var(--shadow-card)');
    expect(importPageSrc).not.toMatch(/rounded-2xl[^"]*shadow-sm/);
  });

  it("login page card uses var(--shadow-card) inline style", () => {
    expect(loginPageSrc).toContain('var(--shadow-card)');
    // The white card container should not use shadow-sm (img and buttons may still use it)
    expect(loginPageSrc).not.toMatch(/bg-white rounded-2xl[^"]*shadow-sm/);
  });

  it("notes page book list card uses var(--shadow-card) with hover handlers", () => {
    expect(notesPageSrc).toContain('var(--shadow-card)');
    expect(notesPageSrc).toContain('var(--shadow-card-hover)');
    expect(notesPageSrc).not.toContain('hover:shadow-sm');
  });
});
