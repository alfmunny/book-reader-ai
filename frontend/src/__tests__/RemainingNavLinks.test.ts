/**
 * Source-level tests verifying that pure-navigation buttons have been replaced
 * with semantic Link elements across the remaining pages (closes #2451).
 */
import * as fs from "fs";
import * as path from "path";

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "../app", rel), "utf8");
}

const profileSrc = readSrc("(shell)/profile/page.tsx");
const vocabSrc = readSrc("(shell)/vocabulary/page.tsx");
const notesListSrc = readSrc("(shell)/notes/page.tsx");
const notesBookSrc = readSrc("(shell)/notes/[bookId]/page.tsx");
const decksSrc = readSrc("(shell)/decks/page.tsx");
const decksNewSrc = readSrc("(shell)/decks/new/page.tsx");
const deckDetailSrc = readSrc("(shell)/decks/[deckId]/page.tsx");
const adminBooksSrc = readSrc("admin/books/page.tsx");
const adminUploadsSrc = readSrc("admin/uploads/page.tsx");
const homeSrc = ["(shell)/page.tsx", "(shell)/bookshelf/page.tsx"].map(readSrc).join("\n")
  + fs.readFileSync(path.join(__dirname, "../components/SiteHeader.tsx"), "utf8");
const readerSrc = readSrc("reader/[bookId]/page.tsx");

describe("profile page nav links (closes #2451)", () => {
  it("Library back button uses href=/ not router.push", () => {
    expect(profileSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/["']\)/);
    expect(profileSrc).toMatch(/href=["']\/["']/);
  });

  it("Admin Panel uses href=/admin not router.push", () => {
    expect(profileSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/admin["']\)/);
    expect(profileSrc).toMatch(/href=["']\/admin["']/);
  });
});

describe("vocabulary page nav links (closes #2451)", () => {
  it("Library back button uses href=/ not router.push", () => {
    expect(vocabSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/["']\)/);
    expect(vocabSrc).toMatch(/href=["']\/["']/);
  });

  it("Flashcards button uses href not router.push", () => {
    expect(vocabSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/vocabulary\/flashcards["']\)/);
    expect(vocabSrc).toMatch(/href=["']\/vocabulary\/flashcards["']/);
  });
});

describe("notes list page nav links (closes #2451)", () => {
  it("Library back button uses href=/ not router.push", () => {
    expect(notesListSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/["']\)/);
    expect(notesListSrc).toMatch(/href=["']\/["']/);
  });

  it("book card uses href not router.push", () => {
    expect(notesListSrc).not.toMatch(/onClick.*router\.push.*notes\//);
    expect(notesListSrc).toMatch(/href=.*\/notes\//);
  });
});

describe("notes book page nav links (closes #2451)", () => {
  it("Notes back button uses href=/notes not router.push", () => {
    expect(notesBookSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/notes["']\)/);
    expect(notesBookSrc).toMatch(/href=["']\/notes["']/);
  });

  it("Open reader button uses href not router.push", () => {
    expect(notesBookSrc).not.toMatch(/<button[^>]*onClick.*router\.push.*\/reader\//);
    expect(notesBookSrc).toMatch(/href=.*\/reader\//);
  });
});

describe("decks page nav links (closes #2451)", () => {
  it("Library back button uses href=/ not router.push", () => {
    expect(decksSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/["']\)/);
    expect(decksSrc).toMatch(/href=["']\/["']/);
  });

  it("New deck header button uses href=/decks/new not router.push", () => {
    expect(decksSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/decks\/new["']\)/);
    expect(decksSrc).toMatch(/href=["']\/decks\/new["']/);
  });

  it("DeckCard uses href prop not onClick with router.push", () => {
    expect(decksSrc).not.toMatch(/onClick.*router\.push.*\/decks\//);
    expect(decksSrc).toMatch(/href=.*\/decks\//);
  });
});

describe("decks new page nav links (closes #2451)", () => {
  it("Decks back button uses href=/decks not router.push", () => {
    expect(decksNewSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/decks["']\)/);
    expect(decksNewSrc).toMatch(/href=["']\/decks["']/);
  });
});

describe("deck detail page nav links (closes #2451)", () => {
  it("Decks back button in header uses href=/decks not router.push", () => {
    const idx = decksNewSrc.indexOf('href="/decks"');
    expect(idx).toBeGreaterThan(-1);
  });

  it("empty state Start reading uses href=/ (Link element)", () => {
    // The empty-state "Start reading" CTA should be a Link (href="/"), not a button
    // (The header button with conditional logic intentionally keeps router.push)
    expect(deckDetailSrc).toMatch(/href=["']\/["'][\s\S]{0,400}Start reading/);
  });
});

describe("admin books page nav links (closes #2451)", () => {
  it("Open reader button uses href not router.push", () => {
    expect(adminBooksSrc).not.toMatch(/<button[^>]*onClick.*router\.push.*\/reader\//);
    expect(adminBooksSrc).toMatch(/href=.*\/reader\//);
  });
});

describe("admin uploads page nav links (closes #2451)", () => {
  it("Open button uses href not router.push", () => {
    expect(adminUploadsSrc).not.toMatch(/<button[^>]*onClick.*router\.push.*\/reader\//);
    expect(adminUploadsSrc).toMatch(/href=.*\/reader\//);
  });
});

describe("home page nav links (closes #2451)", () => {
  it("Sign in header button uses href=/login not router.push", () => {
    const idx = homeSrc.indexOf('href="/login"');
    expect(idx).toBeGreaterThan(-1);
  });

  it("Profile avatar uses href=/profile not router.push onClick", () => {
    expect(homeSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/profile["']\)/);
    expect(homeSrc).toMatch(/href=["']\/profile["']/);
  });

  it("Continue reading card uses href not router.push", () => {
    expect(homeSrc).not.toMatch(/<button[^>]*Continue reading[\s\S]{0,100}router\.push/);
    expect(homeSrc).toMatch(/href=.*\/reader\//);
  });
});

describe("reader page profile avatar links (closes #2451)", () => {
  it("Profile avatar in header uses href=/profile not router.push onClick", () => {
    expect(readerSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/profile["']\)[\s\S]{0,300}rounded-full/);
    expect(readerSrc).toMatch(/href=["']\/profile["']/);
  });

  it("Gemini key settings uses href=/profile not router.push", () => {
    const idx = readerSrc.indexOf("Add your Gemini API key in Settings");
    expect(idx).toBeGreaterThan(-1);
    const context = readerSrc.slice(Math.max(0, idx - 200), idx + 50);
    expect(context).not.toMatch(/onClick.*router\.push/);
    expect(context).toMatch(/href=["']\/profile["']/);
  });
});
