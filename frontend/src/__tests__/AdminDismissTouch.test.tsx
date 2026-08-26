/**
 * Regression test for #1959: dismiss error/success buttons in admin panels
 * must meet 44×44px mobile touch target requirements.
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

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

function hasMinH44(el: Element): boolean {
  return el.className.includes("min-h-[44px]");
}

function hasMinW44(el: Element): boolean {
  return el.className.includes("min-w-[44px]");
}

// --- admin/users: dismiss error button ---
import UsersPage from "@/app/admin/users/page";

const USER = {
  id: 2,
  email: "user@example.com",
  name: "Test User",
  picture: "",
  role: "user",
  approved: 1,
  created_at: "2026-01-01T00:00:00Z",
};

test("users page: dismiss error button has min-h-[44px] and min-w-[44px]", async () => {
  // Load succeeds, then approve action fails → actError banner shows dismiss button
  mockAdminFetch.mockResolvedValueOnce([USER]); // initial load
  render(<UsersPage />);
  await flushPromises();

  await screen.findByText("Test User");

  // Approve action fails → actError
  mockAdminFetch.mockRejectedValueOnce(new Error("server error")); // PUT approve
  mockAdminFetch.mockResolvedValueOnce([USER]); // reload call

  fireEvent.click(screen.getByRole("button", { name: /revoke test user/i }));

  const dismissBtn = await screen.findByRole("button", { name: /dismiss error/i });
  expect(hasMinH44(dismissBtn)).toBe(true);
  expect(hasMinW44(dismissBtn)).toBe(true);
});

// --- admin/books: dismiss error button ---
import BooksPage from "@/app/admin/books/page";

const BOOK_STATS = { total_books: 0, total_translations: 0, failed_translations: 0 };

test("books page: dismiss error button has min-h-[44px] and min-w-[44px]", async () => {
  // Load succeeds with no books, then import action fails → actError
  mockAdminFetch
    .mockResolvedValueOnce([])        // /admin/books
    .mockResolvedValueOnce(BOOK_STATS); // /admin/translations
  render(<BooksPage />);

  await waitFor(() => {
    expect(mockAdminFetch).toHaveBeenCalledTimes(2);
  });
  await flushPromises();

  // Set import ID and click Import Book
  const idInput = await screen.findByPlaceholderText(/Gutenberg Book ID/i);
  fireEvent.change(idInput, { target: { value: "123" } });

  // Import POST fails → actError; then reload on error path
  mockAdminFetch.mockRejectedValueOnce(new Error("not found")); // POST import
  // No reload needed since import catch doesn't call load()

  fireEvent.click(screen.getByRole("button", { name: /import book/i }));
  await flushPromises();

  const dismissBtn = await screen.findByRole("button", { name: /dismiss error/i });
  expect(hasMinH44(dismissBtn)).toBe(true);
  expect(hasMinW44(dismissBtn)).toBe(true);
});
