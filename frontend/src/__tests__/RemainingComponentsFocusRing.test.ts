import fs from "fs";
import path from "path";

const quickHighlightPanel = fs.readFileSync(
  path.resolve(__dirname, "../components/QuickHighlightPanel.tsx"), "utf8");
const searchBar = fs.readFileSync(
  path.resolve(__dirname, "../components/SearchBar.tsx"), "utf8");
const chapterSummary = fs.readFileSync(
  path.resolve(__dirname, "../components/ChapterSummary.tsx"), "utf8");
const authPromptModal = fs.readFileSync(
  path.resolve(__dirname, "../components/AuthPromptModal.tsx"), "utf8");
const bookDetailModal = fs.readFileSync(
  path.resolve(__dirname, "../components/BookDetailModal.tsx"), "utf8");
const tagEditor = fs.readFileSync(
  path.resolve(__dirname, "../components/TagEditor.tsx"), "utf8");
const sentenceReader = fs.readFileSync(
  path.resolve(__dirname, "../components/SentenceReader.tsx"), "utf8");
const seedPopularButton = fs.readFileSync(
  path.resolve(__dirname, "../components/SeedPopularButton.tsx"), "utf8");

describe("QuickHighlightPanel button focus rings (closes #2183)", () => {
  it("color picker button has focus ring", () => {
    const idx = quickHighlightPanel.indexOf("aria-pressed");
    expect(idx).toBeGreaterThan(-1);
    const window = quickHighlightPanel.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("add note button has focus ring", () => {
    const idx = quickHighlightPanel.indexOf('"Add note"');
    expect(idx).toBeGreaterThan(-1);
    const window = quickHighlightPanel.slice(idx, idx + 600);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("delete highlight button has red focus ring", () => {
    const idx = quickHighlightPanel.indexOf('"Delete highlight"');
    expect(idx).toBeGreaterThan(-1);
    const window = quickHighlightPanel.slice(idx, idx + 600);
    expect(window).toContain("focus-visible:ring-red-400");
  });
});

describe("SearchBar button focus rings (closes #2183)", () => {
  it("open search button has focus ring", () => {
    const idx = searchBar.indexOf('"Open search"');
    expect(idx).toBeGreaterThan(-1);
    const window = searchBar.slice(idx, idx + 350);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("close search button has focus ring", () => {
    const idx = searchBar.indexOf('"Close search"');
    expect(idx).toBeGreaterThan(-1);
    const window = searchBar.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("ChapterSummary button focus rings (closes #2183)", () => {
  it("generate/refresh button has focus ring", () => {
    const idx = chapterSummary.indexOf('"Regenerate summary"');
    expect(idx).toBeGreaterThan(-1);
    const window = chapterSummary.slice(idx, idx + 250);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("error retry button has red focus ring", () => {
    // JSX text content has no quotes in source
    const idx = chapterSummary.indexOf("Try again");
    expect(idx).toBeGreaterThan(-1);
    const window = chapterSummary.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-red-400");
  });

  it("generate CTA button has focus ring", () => {
    // JSX text content has no quotes in source
    const idx = chapterSummary.indexOf("Generate Summary");
    expect(idx).toBeGreaterThan(-1);
    const window = chapterSummary.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("AuthPromptModal button focus rings (closes #2183)", () => {
  it("maybe later button has focus ring", () => {
    // JSX text content has no quotes in source
    const idx = authPromptModal.indexOf("Maybe later");
    expect(idx).toBeGreaterThan(-1);
    const window = authPromptModal.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("BookDetailModal button focus rings (closes #2183)", () => {
  it("close button has focus ring", () => {
    const idx = bookDetailModal.indexOf('"Close book details"');
    expect(idx).toBeGreaterThan(-1);
    const window = bookDetailModal.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("read/start button (amber-700 bg) has focus ring with offset", () => {
    const idx = bookDetailModal.indexOf("onClick={onRead}");
    expect(idx).toBeGreaterThan(-1);
    const window = bookDetailModal.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });
});

describe("TagEditor button focus rings (closes #2183)", () => {
  it("remove tag button has focus ring", () => {
    // aria-label is a template literal: `Remove tag ${tag}` — use substring
    const idx = tagEditor.indexOf("onClick={() => handleRemove");
    expect(idx).toBeGreaterThan(-1);
    const window = tagEditor.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("add tag button has focus ring", () => {
    const idx = tagEditor.indexOf('"Add tag"');
    expect(idx).toBeGreaterThan(-1);
    const window = tagEditor.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("SentenceReader button focus rings (closes #2183)", () => {
  it("has no note dot toggle anymore (notes moved to QuickHighlightPanel)", () => {
    expect(sentenceReader.indexOf("setExpandedNoteFlatIdx")).toBe(-1);
  });
});

describe("SeedPopularButton button focus rings (closes #2183)", () => {
  it("confirm seed button has focus ring", () => {
    const idx = seedPopularButton.indexOf('"Confirm seed popular books"');
    expect(idx).toBeGreaterThan(-1);
    const window = seedPopularButton.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("cancel seed button has focus ring", () => {
    const idx = seedPopularButton.indexOf('"Cancel seed"');
    expect(idx).toBeGreaterThan(-1);
    const window = seedPopularButton.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("start seeding button has focus ring", () => {
    const idx = seedPopularButton.indexOf("setPendingStart(true)");
    expect(idx).toBeGreaterThan(-1);
    const window = seedPopularButton.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("show progress button has focus ring", () => {
    // first occurrence of aria-controls is the show-progress button
    const idx = seedPopularButton.indexOf('aria-controls="seed-progress-panel"');
    expect(idx).toBeGreaterThan(-1);
    const window = seedPopularButton.slice(idx, idx + 250);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("stop button has red focus ring", () => {
    const idx = seedPopularButton.indexOf("setPendingStop(true)");
    expect(idx).toBeGreaterThan(-1);
    const window = seedPopularButton.slice(idx, idx + 250);
    expect(window).toContain("focus-visible:ring-red-400");
  });

  it("confirm stop button has red focus ring", () => {
    const idx = seedPopularButton.indexOf('"Confirm stop seed job"');
    expect(idx).toBeGreaterThan(-1);
    const window = seedPopularButton.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-red-400");
  });

  it("cancel stop button has focus ring", () => {
    const idx = seedPopularButton.indexOf('"Cancel stop"');
    expect(idx).toBeGreaterThan(-1);
    const window = seedPopularButton.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});
