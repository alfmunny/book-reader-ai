/**
 * Tests for the admin books page.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAdminFetch = jest.fn();
const mockPush = jest.fn();

jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// SeedPopularButton calls adminFetch itself — mock it out
jest.mock("@/components/SeedPopularButton", () => {
  const Seed = () => <button>Seed popular</button>;
  Seed.displayName = "SeedPopularButton";
  return { __esModule: true, default: Seed };
});

let BooksPage: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/admin/books/page");
  BooksPage = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(window, "alert").mockImplementation(() => {});
  jest.spyOn(window, "confirm").mockReturnValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const SAMPLE_BOOKS = [
  {
    id: 1,
    title: "Moby Dick",
    authors: ["Herman Melville"],
    languages: ["en"],
    download_count: 100,
    text_length: 50000,
    word_count: 9000,
    translations: { zh: 3 },
    queue: {},
  },
  {
    id: 2,
    title: "Don Quixote",
    authors: ["Cervantes"],
    languages: ["es"],
    download_count: 80,
    text_length: 30000,
    translations: {},
    queue: {},
  },
];

const SAMPLE_TRANSLATIONS = [
  {
    book_id: 1,
    chapter_index: 0,
    target_language: "zh",
    size_chars: 5000,
    created_at: "2024-01-01",
  },
];

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

describe("AdminBooksPage — loading and basic render", () => {
  it("shows loading spinner initially", () => {
    mockAdminFetch.mockReturnValue(new Promise(() => {}));
    render(<BooksPage />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders book list after load", async () => {
    mockAdminFetch.mockResolvedValue(SAMPLE_BOOKS);
    // adminFetch called twice: books + translations
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();
    expect(await screen.findByText("Moby Dick")).toBeInTheDocument();
    expect(screen.getByText("Don Quixote")).toBeInTheDocument();
  });

  it("shows error message when fetch fails", async () => {
    mockAdminFetch.mockRejectedValue(new Error("Server down"));
    render(<BooksPage />);
    await flushPromises();
    expect(await screen.findByText("Server down")).toBeInTheDocument();
  });

  it("shows 'No books cached' when no books returned", async () => {
    mockAdminFetch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    render(<BooksPage />);
    await flushPromises();
    expect(await screen.findByText(/no books cached/i)).toBeInTheDocument();
  });

  it("renders import input and button", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();
    expect(await screen.findByPlaceholderText(/gutenberg book id/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import book/i })).toBeInTheDocument();
  });

  it("renders search filter input", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();
    expect(await screen.findByRole("searchbox")).toBeInTheDocument();
  });
});

describe("AdminBooksPage — book actions", () => {
  it("shows Open button that navigates to reader", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const openBtns = await screen.findAllByRole("button", { name: /open/i });
    await userEvent.click(openBtns[0]);
    expect(mockPush).toHaveBeenCalledWith("/reader/1");
  });

  it("shows translation language pills for books with translations", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();
    // "zh · 3" should be rendered
    expect(await screen.findByText(/zh · 3/)).toBeInTheDocument();
  });

  it("shows 'no translations' for books without translations", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();
    expect(await screen.findByText(/no translations/i)).toBeInTheDocument();
  });

  it("calls delete when Delete confirmed", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockResolvedValueOnce({}) // DELETE
      .mockResolvedValueOnce([SAMPLE_BOOKS[1]])
      .mockResolvedValueOnce([]);
    render(<BooksPage />);
    await flushPromises();

    const deleteBtns = await screen.findAllByRole("button", { name: /delete/i });
    await userEvent.click(deleteBtns[0]);

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/books/1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("does not delete when confirm is cancelled", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const deleteBtns = await screen.findAllByRole("button", { name: /delete/i });
    await userEvent.click(deleteBtns[0]);
    // Only initial 2 calls (books + translations)
    expect(mockAdminFetch).toHaveBeenCalledTimes(2);
  });

  it("enqueues translation when '+ Translate' is clicked", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockResolvedValueOnce({ enqueued: 5 }) // enqueue
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const translateBtns = await screen.findAllByRole("button", { name: /\+ translate/i });
    await userEvent.click(translateBtns[0]);

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/queue/enqueue-book",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

describe("AdminBooksPage — import", () => {
  it("Import button is disabled when input is empty", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();
    const importBtn = await screen.findByRole("button", { name: /import book/i });
    expect(importBtn).toBeDisabled();
  });

  it("calls import endpoint when valid ID is entered and button clicked", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockResolvedValueOnce({ status: "imported", title: "New Book", text_length: 12000 })
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const input = await screen.findByPlaceholderText(/gutenberg book id/i);
    await userEvent.type(input, "2229");
    const importBtn = screen.getByRole("button", { name: /import book/i });
    await userEvent.click(importBtn);

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/books/import",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ book_id: 2229 }),
        }),
      );
    });
  });
});

describe("AdminBooksPage — expand/collapse", () => {
  it("expands book row when chevron is clicked", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByRole("button", { name: /^Expand / });
    await userEvent.click(expandBtns[0]);
    expect(await screen.findByRole("button", { name: /^Collapse / })).toBeInTheDocument();
  });

  it("shows 'No translations cached yet' when expanded book has no translations", async () => {
    const booksNoTrans = [{ ...SAMPLE_BOOKS[1], translations: {} }];
    mockAdminFetch
      .mockResolvedValueOnce(booksNoTrans)
      .mockResolvedValueOnce([]);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByRole("button", { name: /^Expand / });
    await userEvent.click(expandBtns[0]);

    expect(await screen.findByText(/no translations cached yet/i)).toBeInTheDocument();
  });
});

describe("AdminBooksPage — search filter", () => {
  it("filters books when search query is entered", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const search = await screen.findByRole("searchbox");
    await userEvent.type(search, "Moby");

    await waitFor(() => {
      expect(screen.getByText("Moby Dick")).toBeInTheDocument();
    });
    // Don Quixote should still be in DOM but match count shown
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  it("shows 'No books match' message when nothing matches", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const search = await screen.findByRole("searchbox");
    await userEvent.type(search, "xyzxyzxyz");

    await waitFor(() => {
      expect(screen.getByText(/no books match/i)).toBeInTheDocument();
    });
  });
});
