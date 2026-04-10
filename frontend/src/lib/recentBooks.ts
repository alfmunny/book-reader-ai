import { BookMeta } from "./api";

const KEY = "recent_books";
const MAX = 8;

export interface RecentBook extends BookMeta {
  lastRead: number; // unix ms
}

export function getRecentBooks(): RecentBook[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function recordRecentBook(book: BookMeta) {
  try {
    const existing = getRecentBooks().filter((b) => b.id !== book.id);
    const updated: RecentBook[] = [
      { ...book, lastRead: Date.now() },
      ...existing,
    ].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {}
}
