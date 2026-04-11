import { BookMeta } from "./api";

const KEY = "recent_books";
const MAX = 8;

export interface RecentBook extends BookMeta {
  lastRead: number;    // unix ms
  lastChapter: number; // 0-based chapter index
}

export function getRecentBooks(): RecentBook[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function recordRecentBook(book: BookMeta, chapterIndex?: number) {
  try {
    const existing = getRecentBooks();
    const prev = existing.find((b) => b.id === book.id);
    const updated: RecentBook[] = [
      {
        ...book,
        lastRead: Date.now(),
        lastChapter: chapterIndex ?? prev?.lastChapter ?? 0,
      },
      ...existing.filter((b) => b.id !== book.id),
    ].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {}
}

export function saveLastChapter(bookId: number, chapterIndex: number) {
  try {
    const existing = getRecentBooks();
    const updated = existing.map((b) =>
      b.id === bookId ? { ...b, lastChapter: chapterIndex, lastRead: Date.now() } : b
    );
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {}
}

export function getLastChapter(bookId: number): number {
  try {
    const book = getRecentBooks().find((b) => b.id === bookId);
    return book?.lastChapter ?? 0;
  } catch {
    return 0;
  }
}
