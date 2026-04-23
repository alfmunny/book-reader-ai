/**
 * Regression tests for issue #618 — homepage filter pills and view toggle
 * buttons below 44px touch target and missing aria-labels.
 */
import React from "react";
import { render, act } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getPopularBooks: jest.fn().mockResolvedValue({ books: [], total: 0 }),
  getMe: jest.fn().mockRejectedValue(new Error("not authed")),
  searchBooks: jest.fn().mockResolvedValue([]),
  getReadingProgress: jest.fn().mockResolvedValue([]),
  getUserStats: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/recentBooks", () => ({
  getRecentBooks: jest.fn().mockReturnValue([]),
  removeRecentBook: jest.fn(),
}));

jest.mock("@/components/BookCard", () => ({
  __esModule: true,
  default: ({ book }: { book: { title: string } }) => <div>{book.title}</div>,
}));

jest.mock("@/components/BookDetailModal", () => ({
  __esModule: true,
  default: () => null,
}));

import HomePage from "@/app/page";

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => jest.clearAllMocks());

async function renderHomePage() {
  render(<HomePage />);
  await act(async () => await flushPromises());
}

test("Quick search pill buttons have min-h-[44px]", async () => {
  await renderHomePage();

  // Quick search pills: rounded-full border border-amber-300 px-3 — they trigger searches
  const pillButtons = Array.from(document.querySelectorAll("button")).filter(
    (b) => b.className.includes("rounded-full") && b.className.includes("px-3") && b.className.includes("border-amber-300")
  );
  expect(pillButtons.length).toBeGreaterThan(0);
  for (const btn of pillButtons) {
    expect(btn.className).toContain("min-h-[44px]");
  }
});

test("Grid view toggle button has aria-label", async () => {
  await renderHomePage();

  const gridBtn = document.querySelector('[title="Grid view"]') as HTMLElement | null;
  expect(gridBtn).not.toBeNull();
  expect(gridBtn!.getAttribute("aria-label")).toBe("Grid view");
});

test("List view toggle button has aria-label", async () => {
  await renderHomePage();

  const listBtn = document.querySelector('[title="List view"]') as HTMLElement | null;
  expect(listBtn).not.toBeNull();
  expect(listBtn!.getAttribute("aria-label")).toBe("List view");
});

test("Grid view toggle button has min-h-[44px]", async () => {
  await renderHomePage();

  const gridBtn = document.querySelector('[title="Grid view"]') as HTMLElement | null;
  expect(gridBtn).not.toBeNull();
  expect(gridBtn!.className).toContain("min-h-[44px]");
});

test("List view toggle button has min-h-[44px]", async () => {
  await renderHomePage();

  const listBtn = document.querySelector('[title="List view"]') as HTMLElement | null;
  expect(listBtn).not.toBeNull();
  expect(listBtn!.className).toContain("min-h-[44px]");
});
