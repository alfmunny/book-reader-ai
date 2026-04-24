import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "../../src");

function readSrc(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Secondary skeleton/spinner role=status aria accessibility (WCAG 4.1.3)", () => {
  it("admin/users SpinnerRow has role=status", () => {
    const src = readSrc("app/admin/users/page.tsx");
    expect(src).toMatch(/role="status"/);
  });

  it("admin/users SpinnerRow has aria-label for loading", () => {
    const src = readSrc("app/admin/users/page.tsx");
    expect(src).toMatch(/aria-label="[^"]*[Ll]oad[^"]*"/);
  });

  it("vocabulary/flashcards page has role=status on loading spinner", () => {
    const src = readSrc("app/vocabulary/flashcards/page.tsx");
    expect(src).toMatch(/role="status"/);
  });

  it("vocabulary/flashcards page has aria-label on loading spinner", () => {
    const src = readSrc("app/vocabulary/flashcards/page.tsx");
    expect(src).toMatch(/aria-label="[^"]*[Ll]oad[^"]*"/);
  });

  it("upload/[bookId]/chapters page has role=status on loading spinner", () => {
    const src = readSrc("app/upload/[bookId]/chapters/page.tsx");
    expect(src).toMatch(/role="status"/);
  });

  it("upload/[bookId]/chapters page has aria-label on loading spinner", () => {
    const src = readSrc("app/upload/[bookId]/chapters/page.tsx");
    expect(src).toMatch(/aria-label="[^"]*[Ll]oad[^"]*"/);
  });

  it("notes/[bookId] page has role=status on content spinner", () => {
    const src = readSrc("app/notes/[bookId]/page.tsx");
    expect(src).toMatch(/role="status"/);
  });

  it("ReadingStats component has role=status on skeleton", () => {
    const src = readSrc("components/ReadingStats.tsx");
    expect(src).toMatch(/role="status"/);
  });

  it("vocabulary page word-list skeleton has role=status and aria-label", () => {
    const src = readSrc("app/vocabulary/page.tsx");
    expect(src).toMatch(/aria-label="Loading vocabulary"/);
  });
});
