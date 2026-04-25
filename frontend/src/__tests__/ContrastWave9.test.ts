import fs from "fs";
import path from "path";

const src = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", rel), "utf-8");

const mainPage = src("app/page.tsx");
const adminLayout = src("app/admin/layout.tsx");
const adminUploads = src("app/admin/uploads/page.tsx");
const adminBooks = src("app/admin/books/page.tsx");
const adminAudio = src("app/admin/audio/page.tsx");
const readerPage = src("app/reader/[bookId]/page.tsx");
const notesBookPage = src("app/notes/[bookId]/page.tsx");
const importPage = src("app/import/[bookId]/page.tsx");
const vocabPage = src("app/vocabulary/page.tsx");
const uploadPage = src("app/upload/page.tsx");

// text-amber-600 (#d97706) on white = 3.19:1 — fails WCAG 1.4.3 for normal text
// text-amber-700 (#b45309) on white = 5.02:1 — passes WCAG 1.4.3
// Fix: replace text-amber-600 with text-amber-700 for body/label text at xs/sm sizes

function countAmber600AtSmallSize(content: string): number {
  // Match text-amber-600 combined with text-xs or text-sm in the same className string
  const matches = content.match(/className="[^"]*text-(?:xs|sm)[^"]*text-amber-600[^"]*"/g) ?? [];
  const matches2 = content.match(/className="[^"]*text-amber-600[^"]*text-(?:xs|sm)[^"]*"/g) ?? [];
  return new Set([...matches, ...matches2]).size;
}

describe("WCAG 1.4.3 contrast — text-amber-600 at small sizes (wave 9) (closes #1384)", () => {
  it("page.tsx has no text-amber-600 at text-xs/text-sm on body text", () => {
    expect(countAmber600AtSmallSize(mainPage)).toBe(0);
  });

  it("admin/layout.tsx has no text-amber-600 at text-xs/text-sm", () => {
    expect(countAmber600AtSmallSize(adminLayout)).toBe(0);
  });

  it("admin/uploads/page.tsx has no text-amber-600 at text-xs/text-sm", () => {
    expect(countAmber600AtSmallSize(adminUploads)).toBe(0);
  });

  it("admin/books/page.tsx has no text-amber-600 at text-xs/text-sm", () => {
    expect(countAmber600AtSmallSize(adminBooks)).toBe(0);
  });

  it("admin/audio/page.tsx has no text-amber-600 at text-xs/text-sm", () => {
    expect(countAmber600AtSmallSize(adminAudio)).toBe(0);
  });

  it("reader/[bookId]/page.tsx has no text-amber-600 at text-xs/text-sm", () => {
    expect(countAmber600AtSmallSize(readerPage)).toBe(0);
  });

  it("notes/[bookId]/page.tsx has no text-amber-600 at text-xs/text-sm", () => {
    expect(countAmber600AtSmallSize(notesBookPage)).toBe(0);
  });

  it("import/[bookId]/page.tsx has no text-amber-600 at text-xs/text-sm", () => {
    expect(countAmber600AtSmallSize(importPage)).toBe(0);
  });

  it("vocabulary/page.tsx has no text-amber-600 at text-xs/text-sm", () => {
    expect(countAmber600AtSmallSize(vocabPage)).toBe(0);
  });

  it("upload/page.tsx has no text-amber-600 at text-xs/text-sm", () => {
    expect(countAmber600AtSmallSize(uploadPage)).toBe(0);
  });
});
