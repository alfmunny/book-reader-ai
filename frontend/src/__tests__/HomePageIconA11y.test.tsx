/**
 * Regression tests for #585: homepage icon-only buttons must have aria-label.
 * - Profile/avatar button: icon-only, needs explicit aria-label (not just title)
 * - Grid/List view toggles: icon-only SVG buttons, need explicit aria-label
 * - Profile button touch target: must be ≥44px on mobile (not w-10 h-10)
 */
import React from "react";
import { render, act, waitFor } from "@testing-library/react";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getPopularBooks: jest.fn().mockResolvedValue({ books: [], total: 0 }),
  getMe: jest.fn().mockRejectedValue(new Error("Not authed")),
  searchBooks: jest.fn().mockResolvedValue({ books: [], total: 0 }),
  getReadingProgress: jest.fn().mockResolvedValue([]),
  getUserStats: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/recentBooks", () => ({
  getRecentBooks: jest.fn().mockReturnValue([]),
  removeRecentBook: jest.fn(),
}));

jest.mock("@/components/BookCard", () => ({
  __esModule: true,
  default: ({ book }: { book: { id: number; title: string } }) => (
    <div data-testid={`book-card-${book.id}`}>{book.title}</div>
  ),
}));

jest.mock("@/components/BookDetailModal", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/ReadingStats", () => ({
  __esModule: true,
  default: () => null,
}));

import HomePage from "@/app/page";

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

describe("HomePage — icon a11y (#585)", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: {
        backendToken: "tok",
        backendUser: { id: 1, name: "Alice", email: "a@b.com", picture: null, is_admin: false },
      },
      status: "authenticated",
    });
  });

  it("profile button has an explicit aria-label attribute (not just title)", async () => {
    render(<HomePage />);
    await act(async () => await flushPromises());

    // Find the profile button by its rounded-full class (avatar button)
    const profileBtn = document.querySelector("button.rounded-full");
    expect(profileBtn).not.toBeNull();
    expect(profileBtn).toHaveAttribute("aria-label");
  });

  it("profile button is at least 44px wide on mobile (not w-10)", async () => {
    render(<HomePage />);
    await act(async () => await flushPromises());

    const profileBtn = document.querySelector("button.rounded-full");
    expect(profileBtn).not.toBeNull();
    // Must not have the 40px classes without a 44px override
    expect(profileBtn!.className).not.toMatch(/\bw-10\b/);
  });

  it("Grid view button has an explicit aria-label", async () => {
    render(<HomePage />);
    await act(async () => await flushPromises());

    const gridBtn = document.querySelector('[title="Grid view"]');
    expect(gridBtn).not.toBeNull();
    expect(gridBtn).toHaveAttribute("aria-label", "Grid view");
  });

  it("List view button has an explicit aria-label", async () => {
    render(<HomePage />);
    await act(async () => await flushPromises());

    const listBtn = document.querySelector('[title="List view"]');
    expect(listBtn).not.toBeNull();
    expect(listBtn).toHaveAttribute("aria-label", "List view");
  });
});
