/**
 * Regression tests for #2241: target=_blank links must announce
 * "(opens in new tab)" to screen-reader users via sr-only text or aria-label.
 */
import * as fs from "fs";
import * as path from "path";

function read(rel: string) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

function assertNewTabAnnouncement(src: string, linkText: string, contextSearch: string) {
  const idx = src.indexOf(contextSearch);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, idx - 100), idx + 300);
  const hasNewTabText = window.includes("opens in new tab") || window.includes("(opens in new tab)");
  expect(hasNewTabText).toBe(true);
}

describe("target=_blank new-tab announcement for screen readers (closes #2241)", () => {
  it("reader header Gutenberg link announces new tab", () => {
    const src = read("../app/reader/[bookId]/page.tsx");
    const idx = src.indexOf("gutenberg.org/ebooks/");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 600);
    expect(window).toMatch(/opens in new tab/);
  });

  it("vocabulary page Wiktionary link announces new tab", () => {
    const src = read("../app/(shell)/vocabulary/page.tsx");
    const idx = src.indexOf("View on Wiktionary");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 200);
    expect(window).toMatch(/opens in new tab/);
  });

  it("profile page Google AI Studio link announces new tab", () => {
    const src = read("../app/(shell)/profile/page.tsx");
    const idx = src.indexOf("Google AI Studio");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 200);
    expect(window).toMatch(/opens in new tab/);
  });

  it("VocabWordTooltip Wiktionary link announces new tab", () => {
    const src = read("../components/VocabWordTooltip.tsx");
    const idx = src.indexOf("Wiktionary");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 200);
    expect(window).toMatch(/opens in new tab/);
  });

  it("BookDetailModal Gutenberg link announces new tab", () => {
    const src = read("../components/BookDetailModal.tsx");
    const idx = src.indexOf("Project Gutenberg");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 200);
    expect(window).toMatch(/opens in new tab/);
  });

  it("InsightChat profile links announce new tab", () => {
    const src = read("../components/InsightChat.tsx");
    const idx = src.indexOf('target="_blank"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 100), idx + 300);
    expect(window).toMatch(/opens in new tab/);
  });
});
