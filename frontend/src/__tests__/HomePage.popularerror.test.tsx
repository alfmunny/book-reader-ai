/**
 * Regression test for #1944: home page popular-books section must show a
 * proper error state (with a retry button) when getPopularBooks() fails —
 * not the "No popular books available yet." empty-state message.
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
});

test("shows error state (not empty-state) when getPopularBooks fails", async () => {
  mockGetPopularBooks.mockRejectedValue(new Error("network error"));
  render(<Home />);
  await flushPromises();

  // Should NOT show the "no books yet" empty state
  expect(screen.queryByText(/No popular books yet/i)).not.toBeInTheDocument();

  // Should show an error state with retry
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
});

test("retry button re-fetches and shows books on success", async () => {
  const BOOKS = {
    books: [{ id: 1, title: "Moby Dick", authors: ["Melville"], subjects: [], languages: ["en"], download_count: 1000, cover_url: null }],
    total: 1,
  };
  mockGetPopularBooks
    .mockRejectedValueOnce(new Error("network error"))
    .mockResolvedValueOnce(BOOKS);

  render(<Home />);
  await flushPromises();

  const retryBtn = await screen.findByRole("button", { name: /try again/i });
  const user = userEvent.setup();
  await user.click(retryBtn);

  await waitFor(() => {
    expect(screen.getByTestId("book-card-1")).toBeInTheDocument();
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("genuine empty response shows no-books message, not error state", async () => {
  mockGetPopularBooks.mockResolvedValue({ books: [], total: 0 });
  render(<Home />);

  expect(await screen.findByText(/No popular books yet/i)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
});
