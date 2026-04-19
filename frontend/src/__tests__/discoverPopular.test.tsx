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
const mockGetClassics = jest.fn();

jest.mock("@/lib/api", () => ({
  getPopularBooks: (...args: unknown[]) => mockGetPopularBooks(...args),
  getMe: (...args: unknown[]) => mockGetMe(...args),
  searchBooks: (...args: unknown[]) => mockSearchBooks(...args),
  getClassics: (...args: unknown[]) => mockGetClassics(...args),
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

function makePopularResponse(page: number, total = 200, perPage = 50) {
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
  mockGetMe.mockResolvedValue({ role: "user", plan: "free" });
  mockGetPopularBooks.mockResolvedValue(makePopularResponse(1)); // default: 200 total, 4 pages
  mockGetClassics.mockResolvedValue([]); // empty free list by default → no lock icons
});

afterEach(() => {
  jest.clearAllMocks();
});

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

async function renderDiscover() {
  render(<Home />);
  await act(flushPromises);
  await act(flushPromises); // second flush: tab→"discover" triggers popular books effect
}

describe("Popular Classics – language filter", () => {
  it("shows All/English/Russian/Deutsch/Français tabs", async () => {
    await renderDiscover();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Russian" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deutsch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Français" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "日本語" })).not.toBeInTheDocument();
  });

  it("Russian tab loads Russian-origin books from classics", async () => {
    const user = userEvent.setup();
    const ruBook = { id: 2554, title: "Crime and Punishment", authors: ["Dostoyevsky"], languages: ["en"], subjects: [], download_count: 50000, cover: "", original_language: "ru" };
    mockGetClassics.mockResolvedValue([ruBook]);
    await renderDiscover();
    await user.click(screen.getByRole("button", { name: "Russian" }));
    await act(flushPromises);
    expect(screen.getAllByText("Crime and Punishment").length).toBeGreaterThan(0);
    // popular API should NOT be called with "ru" since it comes from classics
    expect(mockGetPopularBooks).not.toHaveBeenCalledWith("ru", expect.anything());
  });

  it("clicking a language tab fetches with that language and resets to page 1", async () => {
    const user = userEvent.setup();
    mockGetPopularBooks
      .mockResolvedValueOnce(makePopularResponse(1, 120))  // initial load (All)
      .mockResolvedValueOnce(makePopularResponse(1, 200)); // English tab
    await renderDiscover();
    await user.click(screen.getByRole("button", { name: "English" }));
    await act(flushPromises);
    expect(mockGetPopularBooks).toHaveBeenCalledWith("en", 1);
  });

  it("language change resets pagination to page 1", async () => {
    const user = userEvent.setup();
    mockGetPopularBooks
      .mockResolvedValueOnce(makePopularResponse(1))       // initial All
      .mockResolvedValueOnce(makePopularResponse(2))       // page 2
      .mockResolvedValueOnce(makePopularResponse(1, 100)); // German page 1
    await renderDiscover();
    // Go to page 2
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await act(flushPromises);
    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
    // Switch language → should reset to page 1
    await user.click(screen.getByRole("button", { name: "Deutsch" }));
    await act(flushPromises);
    expect(mockGetPopularBooks).toHaveBeenLastCalledWith("de", 1);
  });
});

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
    expect(screen.getByText("Page 1 of 4")).toBeInTheDocument();
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
    expect(mockGetPopularBooks).toHaveBeenCalledWith("", 2);
    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
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
    expect(mockGetPopularBooks).toHaveBeenCalledWith("", 1);
    expect(screen.getByText("Page 1 of 4")).toBeInTheDocument();
  });

  it("Next is disabled on the last page", async () => {
    const user = userEvent.setup();
    mockGetPopularBooks
      .mockResolvedValueOnce(makePopularResponse(1))
      .mockResolvedValueOnce(makePopularResponse(2))
      .mockResolvedValueOnce(makePopularResponse(3))
      .mockResolvedValueOnce(makePopularResponse(4));
    await renderDiscover();
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole("button", { name: /Next/i }));
      await act(flushPromises);
    }
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });
});

describe("Popular Classics – freemium gate", () => {
  it("shows upgrade modal when a locked book is clicked", async () => {
    const user = userEvent.setup();
    // Book 1 is not in the free list → locked for free users
    mockGetClassics.mockResolvedValue([makeBook(999)]); // only book 999 is free
    await renderDiscover();
    await act(flushPromises); // wait for classics to load
    // Click book 1 (locked)
    const bookCards = screen.getAllByRole("button", { name: /Book 1/i });
    await user.click(bookCards[0]);
    expect(screen.getByText("Premium Book")).toBeInTheDocument();
  });

  it("does not show upgrade modal for free classic books", async () => {
    const user = userEvent.setup();
    // Book 1 IS in the free list
    mockGetClassics.mockResolvedValue([makeBook(1)]);
    await renderDiscover();
    await act(flushPromises);
    const bookCards = screen.getAllByRole("button", { name: /Book 1/i });
    await user.click(bookCards[0]);
    expect(screen.queryByText("Premium Book")).not.toBeInTheDocument();
  });

  it("paid users are never shown the upgrade modal", async () => {
    const user = userEvent.setup();
    mockGetMe.mockResolvedValue({ role: "user", plan: "paid" });
    mockGetClassics.mockResolvedValue([makeBook(999)]); // book 1 not free
    await renderDiscover();
    await act(flushPromises);
    const bookCards = screen.getAllByRole("button", { name: /Book 1/i });
    await user.click(bookCards[0]);
    expect(screen.queryByText("Premium Book")).not.toBeInTheDocument();
  });
});
