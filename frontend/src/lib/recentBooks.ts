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

/** Remove a book from the user's local library list.
 *
 * Only touches localStorage — the book stays cached on the backend for
 * other readers. If the user opens it again from Discover/Search it will
 * re-appear in the library automatically.
 */
export function removeRecentBook(bookId: number) {
  try {
    const existing = getRecentBooks();
    const filtered = existing.filter((b) => b.id !== bookId);
    if (filtered.length !== existing.length) {
      localStorage.setItem(KEY, JSON.stringify(filtered));
    }
  } catch {}
}
