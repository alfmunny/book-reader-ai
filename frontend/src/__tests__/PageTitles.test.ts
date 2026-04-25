/**
 * Static assertions: top-level pages set document.title for browser tabs.
 * Closes #1173
 */
import fs from "fs";
import path from "path";

function readPage(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Per-page document.title", () => {
  it("notes overview sets a Notes title", () => {
    const src = readPage("src/app/notes/page.tsx");
    expect(src).toMatch(/document\.title\s*=\s*["'`]Notes.*Book Reader AI/);
  });

  it("vocabulary page sets a Vocabulary title", () => {
    const src = readPage("src/app/vocabulary/page.tsx");
    expect(src).toMatch(/document\.title\s*=\s*["'`]Vocabulary.*Book Reader AI/);
  });

  it("profile page sets a Profile title", () => {
    const src = readPage("src/app/profile/page.tsx");
    expect(src).toMatch(/document\.title\s*=\s*["'`]Profile.*Book Reader AI/);
  });

  it("decks page sets a Decks title", () => {
    const src = readPage("src/app/decks/page.tsx");
    expect(src).toMatch(/document\.title\s*=\s*["'`]Decks.*Book Reader AI/);
  });

  it("search page sets a Search title", () => {
    const src = readPage("src/app/search/page.tsx");
    // Search uses a conditional title to include the query — match either branch
    expect(src).toMatch(/document\.title/);
    expect(src).toMatch(/Search.*Book Reader AI/);
  });
});
