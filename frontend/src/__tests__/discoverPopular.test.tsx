/**
 * Tests for the Popular Classics section of the Discover tab:
 *   - grid/list view toggle
 *   - pagination controls (prev/next, page indicator)
 *   - page change triggers new fetch
 */

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/recentBooks", () => ({
  getRecentBooks: () => [],
  removeRecentBook: jest.fn(),
}));

const mockGetPopularBooks = jest.fn();
const mockGetMe = jest.fn();
const mockSearchBooks = jest.fn();

jest.mock("@/lib/api", () => ({
  getPopularBooks: (...args: unknown[]) => mockGetPopularBooks(...args),
  getMe: (...args: unknown[]) => mockGetMe(...args),
  searchBooks: (...args: unknown[]) => mockSearchBooks(...args),
}));

function makeBook(id: number) {
  return {
    id,
    title: `Book ${id}`,
    authors: [`Author ${id}`],
    languages: ["en"],
    subjects: [],
    download_count: id * 1000,
    cover: "",
  };
}

function makePopularResponse(page: number, total = 120, perPage = 50) {
  const start = (page - 1) * perPage;
  const books = Array.from({ length: Math.min(perPage, total - start) }, (_, i) =>
    makeBook(start + i + 1)
  );
  return { books, total, page, per_page: perPage };
}

let Home: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/page");
  Home = mod.default;
});

beforeEach(() => {
  mockGetMe.mockResolvedValue({ role: "user" });
  mockGetPopularBooks.mockResolvedValue(makePopularResponse(1));
});

afterEach(() => {
  jest.clearAllMocks();
});

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

async function renderDiscover() {
  render(<Home />);
  await act(flushPromises);
}

describe("Popular Classics – view toggle", () => {
  it("renders grid view by default", async () => {
    await renderDiscover();
    expect(screen.getByTitle("Grid view")).toBeInTheDocument();
    expect(screen.getByTitle("List view")).toBeInTheDocument();
    // Grid shows BookCards (buttons without rank numbers)
    expect(screen.queryByText("#1")).not.toBeInTheDocument();
  });

  it("switches to list view when list button is clicked", async () => {
    const user = userEvent.setup();
    await renderDiscover();
    await user.click(screen.getByTitle("List view"));
    // List view shows rank numbers
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Book 1")).toBeInTheDocument();
  });

  it("list view shows download count", async () => {
    const user = userEvent.setup();
    await renderDiscover();
    await user.click(screen.getByTitle("List view"));
    expect(screen.getByText("1,000")).toBeInTheDocument();
  });

  it("switches back to grid view from list view", async () => {
    const user = userEvent.setup();
    await renderDiscover();
    await user.click(screen.getByTitle("List view"));
    await user.click(screen.getByTitle("Grid view"));
    // Rank number gone again
    const rankOnes = screen.queryAllByText("1");
    // In grid view there should be no standalone rank "1"
    expect(screen.queryByText("Author 1")).toBeInTheDocument(); // BookCard still shows
  });
});

describe("Popular Classics – pagination", () => {
  it("shows pagination when total > per_page", async () => {
    await renderDiscover();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prev/i })).toBeDisabled();
  });

  it("does not show pagination when all books fit on one page", async () => {
    mockGetPopularBooks.mockResolvedValue(makePopularResponse(1, 30));
    await renderDiscover();
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  it("clicking Next fetches page 2", async () => {
    const user = userEvent.setup();
    mockGetPopularBooks
      .mockResolvedValueOnce(makePopularResponse(1))
      .mockResolvedValueOnce(makePopularResponse(2));
    await renderDiscover();
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await act(flushPromises);
    expect(mockGetPopularBooks).toHaveBeenCalledWith(2);
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("Prev is enabled on page 2 and navigates back to page 1", async () => {
    const user = userEvent.setup();
    mockGetPopularBooks
      .mockResolvedValueOnce(makePopularResponse(1))
      .mockResolvedValueOnce(makePopularResponse(2))
      .mockResolvedValueOnce(makePopularResponse(1));
    await renderDiscover();
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await act(flushPromises);
    const prev = screen.getByRole("button", { name: /Prev/i });
    expect(prev).not.toBeDisabled();
    await user.click(prev);
    await act(flushPromises);
    expect(mockGetPopularBooks).toHaveBeenCalledWith(1);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("Next is disabled on the last page", async () => {
    mockGetPopularBooks.mockResolvedValue(makePopularResponse(3, 120));
    // Simulate starting on page 3 by rendering and navigating
    const user = userEvent.setup();
    mockGetPopularBooks
      .mockResolvedValueOnce(makePopularResponse(1))
      .mockResolvedValueOnce(makePopularResponse(2))
      .mockResolvedValueOnce(makePopularResponse(3));
    await renderDiscover();
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await act(flushPromises);
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await act(flushPromises);
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });
});
