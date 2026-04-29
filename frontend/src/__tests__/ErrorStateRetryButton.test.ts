/**
 * Static-source assertions: error states on vocabulary, notes, and notes/[bookId]
 * pages must have a retry CTA button so users can re-fetch without a full page reload.
 * Closes #1939.
 */
import fs from "fs";
import path from "path";

const vocabSrc = fs.readFileSync(
  path.resolve(__dirname, "../app/vocabulary/page.tsx"),
  "utf8",
);
const notesSrc = fs.readFileSync(
  path.resolve(__dirname, "../app/notes/page.tsx"),
  "utf8",
);
const notesBookSrcPath = path.resolve(
  __dirname,
  "../app/notes/[bookId]/page.tsx",
);
const notesBookSrc = fs.readFileSync(notesBookSrcPath, "utf8");

// ── Vocabulary page ────────────────────────────────────────────────────────
const vocabErrorBlock =
  vocabSrc.match(/fetchError \?[\s\S]{0,1000}Try again/)?.[0] ?? "";

describe("vocabulary page error state", () => {
  it("error block contains 'Try again' button", () => {
    expect(vocabErrorBlock).toMatch(/Try again/);
  });
  it("error block includes an icon (AlertCircleIcon)", () => {
    expect(vocabErrorBlock).toMatch(/AlertCircleIcon/);
  });
  it("error block includes font-serif headline", () => {
    expect(vocabErrorBlock).toMatch(/font-serif/);
  });
});

// ── Notes index page ───────────────────────────────────────────────────────
const notesErrorBlock =
  notesSrc.match(/fetchError \?[\s\S]{0,1000}Try again/)?.[0] ?? "";

describe("notes index page error state", () => {
  it("error block contains 'Try again' button", () => {
    expect(notesErrorBlock).toMatch(/Try again/);
  });
  it("error block includes an icon (AlertCircleIcon)", () => {
    expect(notesErrorBlock).toMatch(/AlertCircleIcon/);
  });
  it("error block includes font-serif headline", () => {
    expect(notesErrorBlock).toMatch(/font-serif/);
  });
});

// ── Notes book page ────────────────────────────────────────────────────────
const notesBookErrorBlock =
  notesBookSrc.match(/fetchError \?[\s\S]{0,1000}Try again/)?.[0] ?? "";

describe("notes book page error state", () => {
  it("error block contains 'Try again' button", () => {
    expect(notesBookErrorBlock).toMatch(/Try again/);
  });
  it("error block includes an icon (AlertCircleIcon)", () => {
    expect(notesBookErrorBlock).toMatch(/AlertCircleIcon/);
  });
  it("error block includes font-serif headline", () => {
    expect(notesBookErrorBlock).toMatch(/font-serif/);
  });
});
