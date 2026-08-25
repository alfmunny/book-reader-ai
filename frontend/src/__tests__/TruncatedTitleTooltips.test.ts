/**
 * Regression tests for #2212, #2235, #2237, #2239: truncated book/deck title elements must
 * have title attributes so sighted mouse users can hover to read the full text.
 */
import * as fs from "fs";
import * as path from "path";

const pageSrc = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8"
);
const cardSrc = fs.readFileSync(
  path.join(__dirname, "../components/BookCard.tsx"),
  "utf8"
);
const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);
const profileSrc = fs.readFileSync(
  path.join(__dirname, "../app/profile/page.tsx"),
  "utf8"
);
const seedSrc = fs.readFileSync(
  path.join(__dirname, "../components/SeedPopularButton.tsx"),
  "utf8"
);
const queueTabSrc = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8"
);
const notesSrc = fs.readFileSync(
  path.join(__dirname, "../app/notes/page.tsx"),
  "utf8"
);
const deckDetailSrc = fs.readFileSync(
  path.join(__dirname, "../app/decks/[deckId]/page.tsx"),
  "utf8"
);
const deckCardSrc = fs.readFileSync(
  path.join(__dirname, "../components/DeckCard.tsx"),
  "utf8"
);

describe("Truncated title tooltip coverage (closes #2212)", () => {
  it("Popular Classics list-view book title has title attribute", () => {
    const idx = pageSrc.indexOf('text-ink truncate" title={book.title}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("Popular Classics list-view author has title attribute", () => {
    const idx = pageSrc.indexOf('text-amber-700 truncate" title={book.authors.join(", ")}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("Continue Reading banner book title has title attribute", () => {
    const idx = pageSrc.indexOf('line-clamp-1" title={recentBooks[0].title}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("BookCard title paragraph has title attribute", () => {
    const idx = cardSrc.indexOf('line-clamp-2 min-h-[2.5rem] flex-1" title={book.title}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("BookCard author paragraph has title attribute", () => {
    const idx = cardSrc.indexOf('line-clamp-1" title={book.authors.join(", ")}');
    expect(idx).toBeGreaterThan(-1);
  });
});

describe("Truncated title tooltip coverage — reader header (closes #2237)", () => {
  it("reader header h1 book title has title attribute", () => {
    const idx = readerSrc.indexOf('truncate text-sm" title={meta.title}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("reader header authors paragraph has title attribute", () => {
    const idx = readerSrc.indexOf('text-amber-700 truncate" title={meta.authors.join(", ")}');
    expect(idx).toBeGreaterThan(-1);
  });
});

describe("Truncated title tooltip coverage — notes page (closes #2235)", () => {
  it("book title in notes list has title attribute", () => {
    const idx = notesSrc.indexOf("book.title");
    expect(idx).toBeGreaterThan(-1);
    const window = notesSrc.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain("title=");
  });
});

describe("Truncated title tooltip coverage — deck detail page (closes #2235)", () => {
  it("deck name h1 has title attribute", () => {
    const idx = deckDetailSrc.indexOf("deck?.name");
    expect(idx).toBeGreaterThan(-1);
    const window = deckDetailSrc.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain("title=");
  });
});

describe("Truncated title tooltip coverage — DeckCard (closes #2235)", () => {
  it("deck name in card heading has title attribute", () => {
    const idx = deckCardSrc.indexOf("deck.name");
    expect(idx).toBeGreaterThan(-1);
    const window = deckCardSrc.slice(Math.max(0, idx - 150), idx + 50);
    expect(window).toContain("title=");
  });
});

describe("Truncated title tooltip coverage — profile/SeedPopularButton/QueueTab (closes #2239)", () => {
  it("profile Study Today deck button has title attribute for deck name", () => {
    const idx = profileSrc.indexOf("title={d.name}");
    expect(idx).toBeGreaterThan(-1);
    const window = profileSrc.slice(Math.max(0, idx - 200), idx + 60);
    expect(window).toContain("gotoFlashcardsForDeck");
  });

  it("SeedPopularButton current book title paragraph has title attribute", () => {
    const idx = seedSrc.indexOf("title={state.current_book_title}");
    expect(idx).toBeGreaterThan(-1);
    const window = seedSrc.slice(Math.max(0, idx - 150), idx + 50);
    expect(window).toContain("truncate");
  });

  it("QueueTab retry reason div has title attribute", () => {
    const idx = queueTabSrc.indexOf('title={s.retry_reason}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("QueueTab last error div has title attribute", () => {
    const idx = queueTabSrc.indexOf('title={s.last_error}');
    expect(idx).toBeGreaterThan(-1);
  });
});
