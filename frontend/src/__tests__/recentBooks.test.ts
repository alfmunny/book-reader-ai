/**
 * Tests for lib/recentBooks.ts — continue reading feature.
 */

import {
  getRecentBooks,
  recordRecentBook,
  removeRecentBook,
  saveLastChapter,
  getLastChapter,
  RecentBook,
} from "@/lib/recentBooks";

const BOOK = {
  id: 1342,
  title: "Pride and Prejudice",
  authors: ["Jane Austen"],
  languages: ["en"],
  subjects: ["Fiction"],
  download_count: 50000,
  cover: "",
};

beforeEach(() => localStorage.clear());

// ── recordRecentBook ──────────────────────────────────────────────────────────

test("records a book with chapter 0 by default", () => {
  recordRecentBook(BOOK);
  const books = getRecentBooks();
  expect(books).toHaveLength(1);
  expect(books[0].id).toBe(1342);
  expect(books[0].lastChapter).toBe(0);
});

test("records the current chapter index", () => {
  recordRecentBook(BOOK, 7);
  expect(getRecentBooks()[0].lastChapter).toBe(7);
});

test("moves book to front when re-recorded", () => {
  recordRecentBook({ ...BOOK, id: 1 }, 0);
  recordRecentBook({ ...BOOK, id: 2 }, 0);
  recordRecentBook({ ...BOOK, id: 1 }, 3); // re-record book 1
  const books = getRecentBooks();
  expect(books[0].id).toBe(1);
  expect(books[0].lastChapter).toBe(3);
});

test("preserves chapter index from previous record if not provided", () => {
  recordRecentBook(BOOK, 5);
  recordRecentBook(BOOK); // no chapterIndex argument
  expect(getRecentBooks()[0].lastChapter).toBe(5);
});

test("caps recent books list at 8", () => {
  for (let i = 0; i < 10; i++) {
    recordRecentBook({ ...BOOK, id: i });
  }
  expect(getRecentBooks()).toHaveLength(8);
});

test("sets lastRead to recent timestamp", () => {
  const before = Date.now();
  recordRecentBook(BOOK);
  const after = Date.now();
  const { lastRead } = getRecentBooks()[0];
  expect(lastRead).toBeGreaterThanOrEqual(before);
  expect(lastRead).toBeLessThanOrEqual(after);
});

// ── saveLastChapter ───────────────────────────────────────────────────────────

test("saveLastChapter updates chapter for an existing record", () => {
  recordRecentBook(BOOK, 0);
  saveLastChapter(1342, 9);
  expect(getRecentBooks()[0].lastChapter).toBe(9);
});

test("saveLastChapter does nothing if book not in recent list", () => {
  saveLastChapter(9999, 5); // book not recorded yet — should not throw
  expect(getRecentBooks()).toHaveLength(0);
});

test("saveLastChapter updates lastRead timestamp", () => {
  recordRecentBook(BOOK, 0);
  const before = getRecentBooks()[0].lastRead;
  saveLastChapter(1342, 3);
  expect(getRecentBooks()[0].lastRead).toBeGreaterThanOrEqual(before);
});

// ── getLastChapter ────────────────────────────────────────────────────────────

test("getLastChapter returns 0 for unknown book", () => {
  expect(getLastChapter(9999)).toBe(0);
});

test("getLastChapter returns saved chapter", () => {
  recordRecentBook(BOOK, 4);
  expect(getLastChapter(1342)).toBe(4);
});

test("getLastChapter reflects saveLastChapter update", () => {
  recordRecentBook(BOOK, 1);
  saveLastChapter(1342, 11);
  expect(getLastChapter(1342)).toBe(11);
});

// ── edge cases ────────────────────────────────────────────────────────────────

test("getRecentBooks returns empty array when localStorage is empty", () => {
  expect(getRecentBooks()).toEqual([]);
});

test("getRecentBooks returns empty array when localStorage contains invalid JSON", () => {
  localStorage.setItem("recent_books", "not-json");
  expect(getRecentBooks()).toEqual([]);
});

// ── removeRecentBook ─────────────────────────────────────────────────────────

test("removeRecentBook drops the matching book from the list", () => {
  recordRecentBook({ ...BOOK, id: 1, title: "A" });
  recordRecentBook({ ...BOOK, id: 2, title: "B" });
  recordRecentBook({ ...BOOK, id: 3, title: "C" });
  removeRecentBook(2);
  const books = getRecentBooks();
  expect(books.map((b: RecentBook) => b.id).sort()).toEqual([1, 3]);
});

test("removeRecentBook is a no-op for an unknown book id", () => {
  recordRecentBook({ ...BOOK, id: 1 });
  removeRecentBook(9999);
  expect(getRecentBooks()).toHaveLength(1);
});

test("removeRecentBook does not throw on empty library", () => {
  expect(() => removeRecentBook(1)).not.toThrow();
  expect(getRecentBooks()).toEqual([]);
});
