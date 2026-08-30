/**
 * Regression test for #1961: admin sub-pages must each have an h2
 * section heading so screen reader users can navigate by headings.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

// The review queue is its own component with its own tests
// (PendingPublishPanel.test.tsx); these suites are about the books list, and an
// unmocked fetch from it would perturb their adminFetch call counts.
jest.mock("@/components/PendingPublishPanel", () => {
  const PendingPublishPanel = () => null;
  PendingPublishPanel.displayName = "PendingPublishPanel";
  return { __esModule: true, default: PendingPublishPanel };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockAdminFetch = jest.fn();
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

jest.mock("@/lib/api", () => ({
  getMe: () => Promise.resolve({ id: 99 }),
}));

jest.mock("@/components/SeedPopularButton", () => {
  const Seed = () => <button>Seed</button>;
  Seed.displayName = "SeedPopularButton";
  return { __esModule: true, default: Seed };
});

beforeEach(() => {
  jest.resetAllMocks();
});

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const BOOK_STATS = { total_books: 0, total_translations: 0, failed_translations: 0 };

import AudioPage from "@/app/(shell)/admin/audio/page";
import UsersPage from "@/app/(shell)/admin/users/page";
import BooksPage from "@/app/(shell)/admin/books/page";
import UploadsPage from "@/app/(shell)/admin/uploads/page";

test("audio page: has h2 heading for the section", async () => {
  mockAdminFetch.mockResolvedValueOnce([]);
  render(<AudioPage />);
  await waitFor(() => expect(mockAdminFetch).toHaveBeenCalledTimes(1));
  await flushPromises();
  expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
});

test("users page: has h2 heading for the section", async () => {
  mockAdminFetch.mockResolvedValueOnce([]);
  render(<UsersPage />);
  await waitFor(() => expect(mockAdminFetch).toHaveBeenCalledTimes(1));
  await flushPromises();
  expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
});

test("books page: has h2 heading for the section", async () => {
  mockAdminFetch
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(BOOK_STATS);
  render(<BooksPage />);
  await waitFor(() => expect(mockAdminFetch).toHaveBeenCalledTimes(2));
  await flushPromises();
  expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
});

test("uploads page: has h2 heading for the section", async () => {
  mockAdminFetch.mockResolvedValueOnce([]);
  render(<UploadsPage />);
  await waitFor(() => expect(mockAdminFetch).toHaveBeenCalledTimes(1));
  await flushPromises();
  expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
});
