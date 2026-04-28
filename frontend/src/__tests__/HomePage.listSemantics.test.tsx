/**
 * Regression test for #2041: book grids must use list semantics so
 * screen readers can announce item counts and navigation position.
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

const BOOKS = Array.from({ length: 3 }, (_, i) => makeBook(i + 1));

const mockGetPopularBooks = jest.fn().mockResolvedValue({ books: BOOKS, total: 3 });
const mockGetMe = jest.fn().mockResolvedValue({ role: "user" });
const mockSearchBooks = jest.fn().mockResolvedValue({ books: BOOKS });
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
  mockGetPopularBooks.mockResolvedValue({ books: BOOKS, total: 3 });
  mockSearchBooks.mockResolvedValue({ books: BOOKS });
});

test("Popular Classics grid renders as a list element", async () => {
  render(<Home />);
  await flushPromises();

  // After popular books load, the grid container should be a <ul> with role=list
  const list = await screen.findByRole("list", { name: /popular classics/i });
  expect(list).toBeInTheDocument();
  // All book cards should be inside list items
  const items = screen.getAllByRole("listitem");
  expect(items.length).toBeGreaterThanOrEqual(3);
});

test("search results grid renders as a list element", async () => {
  render(<Home />);
  await flushPromises();

  const searchInput = screen.getByRole("textbox", { name: /search by title or author/i });
  const user = userEvent.setup();
  await user.type(searchInput, "Pride");
  await user.keyboard("{Enter}");

  await waitFor(() => {
    expect(screen.getByRole("list", { name: /search results/i })).toBeInTheDocument();
  });
  const items = screen.getAllByRole("listitem");
  expect(items.length).toBeGreaterThanOrEqual(3);
});
