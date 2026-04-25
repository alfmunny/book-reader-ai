/**
 * AdminBooksPage — branch coverage for lines not yet covered:
 *   134:  handleRetranslate error path — alerts error.message or fallback
 *   177:  handleMove confirm cancelled → early return
 *
 * Note: line 134 is the catch block in handleRetranslate, and line 177 is
 * the confirm-cancelled early return in handleMove.
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

jest.mock("@/components/SeedPopularButton", () => {
  const Seed = ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete}>Seed popular</button>
  );
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

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

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
    active: false,
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
  {
    book_id: 1,
    chapter_index: 1,
    target_language: "zh",
    size_chars: 3000,
    created_at: "2024-01-02",
  },
];

async function renderWithLangExpanded() {
  mockAdminFetch
    .mockResolvedValueOnce(SAMPLE_BOOKS)
    .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
  render(<BooksPage />);
  await flushPromises();

  // Expand book row
  const expandBtns = await screen.findAllByRole("button", { name: /^Expand / });
  await userEvent.click(expandBtns[0]);

  // Expand the zh language row
  await waitFor(() => screen.getByText("zh"));
  const allBtns = screen.getAllByRole("button");
  const langArrow = allBtns.find(
    (b) => (b.getAttribute("aria-label")?.startsWith("Expand") || b.getAttribute("aria-label")?.startsWith("Collapse")) && !b.title,
  );
  if (langArrow) await userEvent.click(langArrow);

  // Wait for chapter rows
  await waitFor(() => screen.getByText("Ch. 1"));
}

// ── Line 134: handleRetranslate error path ────────────────────────────────────

describe("AdminBooksPage — handleRetranslate error path (line 134)", () => {
  it("alerts error message from Error when retranslate API throws", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    await renderWithLangExpanded();

    // Mock the retranslate endpoint to fail
    mockAdminFetch.mockRejectedValueOnce(new Error("Retranslation API error"));

    const retranslateBtns = await screen.findAllByRole("button", {
      name: /^Retranslate$/i,
    });
    await userEvent.click(retranslateBtns[0]);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Retranslation API error"),
    );
  });

  it("alerts fallback message when retranslate API throws non-Error", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    await renderWithLangExpanded();

    // Mock the retranslate endpoint to fail with a non-Error
    mockAdminFetch.mockRejectedValueOnce("something went wrong");

    const retranslateBtns = await screen.findAllByRole("button", {
      name: /^Retranslate$/i,
    });
    await userEvent.click(retranslateBtns[0]);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Retranslation failed"),
    );
  });
});

// ── Line 177: handleMove confirm cancelled → early return ───────────────────

describe("AdminBooksPage — handleMove confirm cancelled (line 177)", () => {
  it("does not call move API when user cancels confirm dialog", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    await renderWithLangExpanded();

    const moveInputs = screen.getAllByPlaceholderText("→Ch");
    await userEvent.clear(moveInputs[0]);
    await userEvent.type(moveInputs[0], "3");

    const moveBtns = screen.getAllByRole("button", { name: /^Move$/i });
    await userEvent.click(moveBtns[0]);

    // No additional calls beyond initial load (2 calls)
    expect(mockAdminFetch).toHaveBeenCalledTimes(2);
  });
});

// ── Additional: fuzzy search — no books match ──────────────────────────────

describe("AdminBooksPage — fuzzy search with no matches", () => {
  it("shows 'No books match' message when search has no results", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    const searchInput = await screen.findByRole("searchbox");
    await userEvent.type(searchInput, "zzzznonexistent");

    await waitFor(() =>
      expect(screen.getByText(/No books match/i)).toBeInTheDocument(),
    );
  });

  it("shows book count when search matches some books", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    const searchInput = await screen.findByRole("searchbox");
    await userEvent.type(searchInput, "Moby");

    await waitFor(() =>
      expect(screen.getByText("Moby Dick")).toBeInTheDocument(),
    );
    // Counter shows "1 / 1"
    expect(screen.getByText(/1\s*\/\s*1/)).toBeInTheDocument();
  });
});

// ── Additional: book with no translations shows "no translations" badge ───────

describe("AdminBooksPage — book with no translations", () => {
  it("shows 'no translations' badge for book with empty translations", async () => {
    const booksNoTranslations = [
      {
        id: 5,
        title: "Empty Book",
        authors: ["Author"],
        languages: ["en"],
        download_count: 10,
        text_length: 1000,
        translations: {},
        queue: {},
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(booksNoTranslations)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    await waitFor(() =>
      expect(screen.getByText(/no translations/i)).toBeInTheDocument(),
    );
  });
});

// ── Additional: queue stats with running/pending/failed shown in badge ────────

describe("AdminBooksPage — queue status badges", () => {
  it("shows running badge when queue has running items", async () => {
    const booksWithRunning = [
      {
        id: 7,
        title: "Running Book",
        authors: ["Author"],
        languages: ["en"],
        download_count: 10,
        text_length: 1000,
        translations: { de: 2 },
        queue: { de: { running: 1, pending: 0, failed: 0 } },
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(booksWithRunning)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    await waitFor(() =>
      expect(screen.getByText(/▸1/)).toBeInTheDocument(),
    );
  });

  it("shows pending badge when queue has pending items", async () => {
    const booksWithPending = [
      {
        id: 8,
        title: "Pending Book",
        authors: ["Author"],
        languages: ["en"],
        download_count: 10,
        text_length: 1000,
        translations: { fr: 1 },
        queue: { fr: { running: 0, pending: 3, failed: 0 } },
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(booksWithPending)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    await waitFor(() =>
      expect(screen.getByText(/·3/)).toBeInTheDocument(),
    );
  });
});

// ── Additional: "No books cached" message when books list is empty ────────────

describe("AdminBooksPage — empty books list", () => {
  it("shows 'No books cached' when API returns empty array", async () => {
    mockAdminFetch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    await waitFor(() =>
      expect(screen.getByText(/No books cached/i)).toBeInTheDocument(),
    );
  });
});

// ── Additional: expanded book with no translations shows message ──────────────

describe("AdminBooksPage — expanded book with no translations cached", () => {
  it("shows 'No translations cached yet' message", async () => {
    const booksNoTranslations = [
      {
        id: 9,
        title: "No Translations Book",
        authors: ["Author"],
        languages: ["en"],
        download_count: 10,
        text_length: 1000,
        translations: {},
        queue: {},
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(booksNoTranslations)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    // Expand book row
    const expandBtns = await screen.findAllByRole("button", { name: /^Expand / });
    await userEvent.click(expandBtns[0]);

    await waitFor(() =>
      expect(screen.getByText(/No translations cached yet/i)).toBeInTheDocument(),
    );
  });
});

// ── Additional: "Open" button navigates to reader ─────────────────────────────

describe("AdminBooksPage — Open button navigates to reader", () => {
  it("navigates to /reader/:id when Open is clicked", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    const openBtn = await screen.findByRole("button", { name: /^Open reader for/i });
    await userEvent.click(openBtn);

    expect(mockPush).toHaveBeenCalledWith("/reader/1");
  });
});
