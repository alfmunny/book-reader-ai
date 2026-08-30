/**
 * Regression tests for issue #1888 — reader, notes, and flashcards pages must
 * update document.title with a descriptive label (WCAG 2.4.2 Page Titled).
 */
import { readFileSync } from "fs";
import { join } from "path";

const readerSrc = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);
const notesSrc = readFileSync(
  join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader page — document.title (WCAG 2.4.2, #1888)", () => {
  it("sets document.title when book meta loads", () => {
    expect(readerSrc).toMatch(/document\.title\s*=/);
  });

  it("includes the book title in document.title", () => {
    const idx = readerSrc.indexOf("document.title");
    const region = readerSrc.slice(idx, idx + 200);
    expect(region).toMatch(/meta[.\?!]title/);
  });

  it("resets document.title on unmount", () => {
    const idx = readerSrc.indexOf("document.title");
    const region = readerSrc.slice(idx, idx + 400);
    expect(region).toMatch(/return\s*\(\s*\)\s*=>/);
  });
});

describe("Notes page — document.title (WCAG 2.4.2, #1888)", () => {
  it("sets document.title when book meta loads", () => {
    expect(notesSrc).toMatch(/document\.title\s*=/);
  });

  it("includes the book title and Notes label", () => {
    const idx = notesSrc.indexOf("document.title");
    const region = notesSrc.slice(idx, idx + 200);
    expect(region).toMatch(/meta[.\?!]title/);
    expect(region.toLowerCase()).toMatch(/note/);
  });
});

describe("Flashcards page — document.title (WCAG 2.4.2, #1888)", () => {
  const flashSrc = readFileSync(
    join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
    "utf8",
  );

  it("sets a descriptive document.title", () => {
    expect(flashSrc).toMatch(/document\.title\s*=/);
  });

  it("includes Flashcards in document.title", () => {
    const idx = flashSrc.indexOf("document.title");
    const region = flashSrc.slice(idx, idx + 100);
    expect(region.toLowerCase()).toMatch(/flashcard/);
  });
});
