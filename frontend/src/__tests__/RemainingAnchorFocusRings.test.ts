/**
 * Regression tests for #2202: focus-visible rings on 16 remaining anchor links
 * that were missing keyboard focus indicators (WCAG 2.4.7).
 */
import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);
const notesSrc = fs.readFileSync(
  path.join(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf8"
);
const profileSrc = fs.readFileSync(
  path.join(__dirname, "../app/profile/page.tsx"),
  "utf8"
);
const importSrc = fs.readFileSync(
  path.join(__dirname, "../app/import/[bookId]/page.tsx"),
  "utf8"
);
const vocabSrc = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf8"
);
const tooltipSrc = fs.readFileSync(
  path.join(__dirname, "../components/VocabWordTooltip.tsx"),
  "utf8"
);
const sidebarSrc = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8"
);
const modalSrc = fs.readFileSync(
  path.join(__dirname, "../components/BookDetailModal.tsx"),
  "utf8"
);

describe("Reader page remaining anchor focus rings (closes #2202)", () => {
  it("Gutenberg icon link has focus ring", () => {
    const idx = readerSrc.indexOf("gutenberg.org/ebooks/");
    expect(idx).toBeGreaterThan(-1);
    const window = readerSrc.slice(idx, idx + 280);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Obsidian export URL link has focus ring", () => {
    const idx = readerSrc.indexOf("href={obsidianToast.msg}");
    expect(idx).toBeGreaterThan(-1);
    const window = readerSrc.slice(idx, idx + 280);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Notes tab footer 'Book notes' link has focus ring", () => {
    // Anchor by the ArrowRightIcon after "Book notes" text
    const idx = readerSrc.indexOf("Book notes <ArrowRightIcon");
    expect(idx).toBeGreaterThan(-1);
    const window = readerSrc.slice(Math.max(0, idx - 200), idx + 30);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Notes tab footer 'All books' link has focus ring", () => {
    // Look for the All books link in reader context (comes after 'Book notes' link)
    const booksIdx = readerSrc.indexOf("Book notes <ArrowRightIcon");
    const allBooksIdx = readerSrc.indexOf("All books\n", booksIdx);
    expect(allBooksIdx).toBeGreaterThan(-1);
    const window = readerSrc.slice(Math.max(0, allBooksIdx - 200), allBooksIdx + 30);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Notes book page anchor focus rings (closes #2202)", () => {
  it("Word (lemma) link has focus ring", () => {
    const idx = notesSrc.indexOf("vocabulary?word=");
    expect(idx).toBeGreaterThan(-1);
    const window = notesSrc.slice(idx, idx + 240);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Sentence occurrence link has focus ring", () => {
    const idx = notesSrc.indexOf("href={readerHref}");
    expect(idx).toBeGreaterThan(-1);
    const window = notesSrc.slice(idx, idx + 240);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Profile page anchor focus ring (closes #2202)", () => {
  it("Google AI Studio external link has focus ring", () => {
    const idx = profileSrc.indexOf("aistudio.google.com");
    expect(idx).toBeGreaterThan(-1);
    const window = profileSrc.slice(idx, idx + 240);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Import page anchor focus ring (closes #2202)", () => {
  it("Button-styled sign-in anchor on import page has focus ring", () => {
    // Find 'Sign in to read this book' then look for anchor ring
    const idx = importSrc.indexOf("Sign in to read this book.");
    expect(idx).toBeGreaterThan(-1);
    const window = importSrc.slice(idx, idx + 330);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Vocabulary page anchor focus rings (closes #2202)", () => {
  it("Wiktionary inline link has focus ring", () => {
    const idx = vocabSrc.indexOf("View on Wiktionary");
    expect(idx).toBeGreaterThan(-1);
    const window = vocabSrc.slice(Math.max(0, idx - 200), idx + 30);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Book title occurrence link has focus ring", () => {
    // The book title link in word occurrence panels
    const idx = vocabSrc.indexOf("{occ.book_title}");
    expect(idx).toBeGreaterThan(-1);
    const window = vocabSrc.slice(Math.max(0, idx - 200), idx + 30);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("VocabWordTooltip Wiktionary anchor focus ring (closes #2202)", () => {
  it("Wiktionary link in tooltip has focus ring", () => {
    const idx = tooltipSrc.indexOf("Wiktionary <ArrowUpRightIcon");
    expect(idx).toBeGreaterThan(-1);
    const window = tooltipSrc.slice(Math.max(0, idx - 200), idx + 30);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("AnnotationsSidebar anchor focus rings (closes #2202)", () => {
  it("Annotation icon link (to notes page) has focus ring", () => {
    const idx = sidebarSrc.indexOf("annotation-${ann.id}");
    expect(idx).toBeGreaterThan(-1);
    const window = sidebarSrc.slice(idx, idx + 360);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Footer 'Book notes' link has focus ring", () => {
    // The "Book notes" text is inside the footer link
    const idx = sidebarSrc.indexOf('"Book notes"');
    expect(idx).toBeGreaterThan(-1);
    const window = sidebarSrc.slice(Math.max(0, idx - 250), idx + 30);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Footer 'All books' link has focus ring", () => {
    // The "All books" text in the footer <a> element (plain text, no JS quotes)
    const bookNotesIdx = sidebarSrc.indexOf('"Book notes"');
    const allBooksIdx = sidebarSrc.indexOf("All books\n", bookNotesIdx);
    expect(allBooksIdx).toBeGreaterThan(-1);
    const window = sidebarSrc.slice(Math.max(0, allBooksIdx - 280), allBooksIdx + 30);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("BookDetailModal anchor focus ring (closes #2202)", () => {
  it("View on Project Gutenberg link has focus ring", () => {
    const idx = modalSrc.indexOf("Project Gutenberg");
    expect(idx).toBeGreaterThan(-1);
    const window = modalSrc.slice(Math.max(0, idx - 200), idx + 30);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});
