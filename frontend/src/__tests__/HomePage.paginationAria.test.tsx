/**
 * Regression test for #2039: Popular Classics pagination must announce
 * page changes to screen readers via a live region on the page counter.
 * Buttons must have descriptive aria-labels.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function makeBook(id: number) {
  return {
    id,
    title: `Book ${id}`,
    authors: [`Author ${id}`],
    subjects: [],
    languages: ["en"],
    download_count: id * 100,
    cover_url: null,
  };
}

const BOOKS_PAGE_1 = Array.from({ length: 10 }, (_, i) => makeBook(i + 1));

const mockGetPopularBooks = jest.fn();
const mockGetMe = jest.fn().mockResolvedValue({ role: "user" });
const mockSearchBooks = jest.fn();
const mockGetReadingProgress = jest.fn().mockResolvedValue([]);
const mockGetUserStats = jest.fn().mockResolvedValue(null);

jest.mock("@/lib/api", () => ({
  getPopularBooks: (...args: unknown[]) => mockGetPopularBooks(...args),
  getMe: (...args: unknown[]) => mockGetMe(...args),
  searchBooks: (...args: unknown[]) => mockSearchBooks(...args),
  getReadingProgress: (...args: unknown[]) => mockGetReadingProgress(...args),
  getUserStats: (...args: unknown[]) => mockGetUserStats(...args),
}));

jest.mock("@/lib/recentBooks", () => ({
  getRecentBooks: () => [],
  removeRecentBook: jest.fn(),
  recordRecentBook: jest.fn(),
}));

jest.mock("@/components/BookCard", () => {
  const BookCard = ({ book }: { book: { id: number; title: string } }) => (
    <div data-testid={`book-card-${book.id}`}>{book.title}</div>
  );
  BookCard.displayName = "BookCard";
  return BookCard;
});

jest.mock("@/components/BookDetailModal", () => {
  const BookDetailModal = () => null;
  BookDetailModal.displayName = "BookDetailModal";
  return BookDetailModal;
});

jest.mock("@/components/UndoToast", () => {
  const UndoToast = () => null;
  UndoToast.displayName = "UndoToast";
  return UndoToast;
});

jest.mock("@/components/ReadingStats", () => {
  const ReadingStats = () => null;
  ReadingStats.displayName = "ReadingStats";
  return ReadingStats;
});

jest.mock("@/components/SeedPopularButton", () => {
  const SeedPopularButton = () => null;
  SeedPopularButton.displayName = "SeedPopularButton";
  return SeedPopularButton;
});

import Home from "@/app/page";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  // Return total > 50 to trigger pagination controls
  mockGetPopularBooks.mockResolvedValue({ books: BOOKS_PAGE_1, total: 60 });
});

test("pagination page counter has role=status for screen reader announcements", async () => {
  render(<Home />);
  await flushPromises();

  const pageCounter = await screen.findByRole("status", { name: /page 1 of/i });
  expect(pageCounter).toBeInTheDocument();
});

test("Prev button has descriptive aria-label", async () => {
  render(<Home />);
  await flushPromises();

  await screen.findByRole("button", { name: /previous page of popular books/i });
});

test("Next button has descriptive aria-label", async () => {
  render(<Home />);
  await flushPromises();

  await screen.findByRole("button", { name: /next page of popular books/i });
});

test("clicking Next loads page 2 and page counter updates", async () => {
  const BOOKS_PAGE_2 = Array.from({ length: 10 }, (_, i) => makeBook(i + 51));
  mockGetPopularBooks
    .mockResolvedValueOnce({ books: BOOKS_PAGE_1, total: 60 })
    .mockResolvedValueOnce({ books: BOOKS_PAGE_2, total: 60 });

  render(<Home />);
  await flushPromises();

  const nextBtn = await screen.findByRole("button", { name: /next page of popular books/i });
  const user = userEvent.setup();
  await user.click(nextBtn);

  await waitFor(() => {
    expect(screen.getByRole("status", { name: /page 2 of/i })).toBeInTheDocument();
  });
});
