/**
 * Regression test for #2049: homepage tablist must implement the WAI-ARIA
 * tab pattern — roving tabIndex and arrow-key keyboard navigation.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockGetPopularBooks = jest.fn().mockResolvedValue({ books: [], total: 0 });
const mockGetMe = jest.fn().mockResolvedValue({ role: "user" });
const mockSearchBooks = jest.fn().mockResolvedValue({ books: [] });
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
  const BookCard = () => null;
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

test("selected tab has tabIndex 0, unselected tabs have tabIndex -1", async () => {
  render(<Home />);
  await flushPromises();

  const tabs = screen.getAllByRole("tab");
  const selectedTab = tabs.find((t) => t.getAttribute("aria-selected") === "true");
  const unselectedTabs = tabs.filter((t) => t.getAttribute("aria-selected") !== "true");

  expect(selectedTab).toHaveAttribute("tabindex", "0");
  for (const t of unselectedTabs) {
    expect(t).toHaveAttribute("tabindex", "-1");
  }
});

test("ArrowRight on Discover tab wraps focus back to Home tab", async () => {
  render(<Home />);
  await flushPromises();

  const homeTab = screen.getByRole("tab", { name: /home/i });
  const discoverTab = screen.getByRole("tab", { name: /discover/i });

  const user = userEvent.setup();
  await user.click(discoverTab);
  await user.keyboard("{ArrowRight}");

  expect(document.activeElement).toBe(homeTab);
});

test("ArrowLeft on Home tab wraps focus back to Discover tab", async () => {
  render(<Home />);
  await flushPromises();

  const homeTab = screen.getByRole("tab", { name: /home/i });
  const discoverTab = screen.getByRole("tab", { name: /discover/i });

  const user = userEvent.setup();
  await user.click(homeTab);
  await user.keyboard("{ArrowLeft}");

  expect(document.activeElement).toBe(discoverTab);
});
