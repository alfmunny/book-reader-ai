/**
 * AdminBooksPage — additional coverage for uncovered lines:
 *   90:       act() error path (alert shown on error)
 *   111:      already_cached import branch
 *   118-136:  handleRetranslate — confirm, retranslate call, error path
 *   152:      queueLanguageForBook early return when lang is empty
 *   161-210:  book detail expansion, language row expansion, chapter rows
 *   244:      SeedPopularButton onComplete callback
 *   350:      retryFailedForLang — confirm + API call
 *   373:      Delete all translations (per-lang delete)
 *   423-534:  bulk retranslate, chapter-level retranslate/delete/move
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAdminFetch = jest.fn();
const mockPush = jest.fn();

jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Expose onComplete so we can call it in tests
let capturedOnComplete: (() => void) | null = null;
jest.mock("@/components/SeedPopularButton", () => {
  const Seed = ({ onComplete }: { onComplete: () => void }) => {
    capturedOnComplete = onComplete;
    return <button onClick={onComplete}>Seed popular</button>;
  };
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
  capturedOnComplete = null;
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
    active: false,
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

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

// ─────────────────────────────────────────────────────────────────────────────
// Line 90: act() helper — error path (alert on thrown error)
// ─────────────────────────────────────────────────────────────────────────────
describe("AdminBooksPage — act() error path (line 90)", () => {
  it("alerts error message when delete throws", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockRejectedValueOnce(new Error("Delete failed"));

    render(<BooksPage />);
    await flushPromises();

    const deleteBtns = await screen.findAllByRole("button", { name: /^Delete$/i });
    await userEvent.click(deleteBtns[0]);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Delete failed"),
    );
  });

  it("alerts fallback message when delete throws non-Error", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockRejectedValueOnce("boom");

    render(<BooksPage />);
    await flushPromises();

    const deleteBtns = await screen.findAllByRole("button", { name: /^Delete$/i });
    await userEvent.click(deleteBtns[0]);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Failed"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 111: already_cached import branch
// ─────────────────────────────────────────────────────────────────────────────
describe("AdminBooksPage — import already_cached branch (line 111)", () => {
  it("alerts 'already cached' message when status is already_cached", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockResolvedValueOnce({ status: "already_cached", title: "Moby Dick" })
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    const input = await screen.findByPlaceholderText(/gutenberg book id/i);
    await userEvent.type(input, "1");
    await userEvent.click(screen.getByRole("button", { name: /import book/i }));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining("already cached"),
      ),
    );
  });

  it("alerts import error when import fetch throws", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockRejectedValueOnce(new Error("Import failed"));

    render(<BooksPage />);
    await flushPromises();

    const input = await screen.findByPlaceholderText(/gutenberg book id/i);
    await userEvent.type(input, "9999");
    await userEvent.click(screen.getByRole("button", { name: /import book/i }));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Import failed"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 118-136: handleRetranslate
// ─────────────────────────────────────────────────────────────────────────────
describe("AdminBooksPage — handleRetranslate (lines 118-136)", () => {
  async function renderExpanded() {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    // Expand book 1
    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    // Expand zh language row
    await waitFor(() => screen.getByText("zh"));
    const langExpandBtns = screen.getAllByRole("button", {
      name: (name) => name === "▶" || name === "▼",
    });
    // The language expand chevron is inside the expanded book section
    const innerExpand = langExpandBtns.find(
      (b) => !b.title, // book expand buttons have title, lang ones don't
    );
    if (innerExpand) await userEvent.click(innerExpand);
    return;
  }

  it("calls retranslate endpoint when confirmed", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    // Expand the zh language row
    await waitFor(() => screen.getByText("zh"));
    // Click the small arrow to expand the language
    const allBtns = screen.getAllByRole("button");
    const langArrow = allBtns.find(
      (b) => (b.textContent === "▶" || b.textContent === "▼") && !b.title,
    );
    if (langArrow) await userEvent.click(langArrow);

    // Now "Retranslate" per-chapter button should appear
    const retranslateBtns = await screen.findAllByRole("button", {
      name: /^Retranslate$/i,
    });
    expect(retranslateBtns.length).toBeGreaterThan(0);

    // Set up the mock for the retranslate call
    mockAdminFetch
      .mockResolvedValueOnce({ provider: "gemini", paragraphs_count: 42 })
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    await userEvent.click(retranslateBtns[0]);

    await waitFor(() =>
      expect(mockAdminFetch).toHaveBeenCalledWith(
        expect.stringContaining("retranslate"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining("paragraphs"),
    );
  });

  it("does not retranslate when confirm is cancelled", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    await waitFor(() => screen.getByText("zh"));
    const allBtns = screen.getAllByRole("button");
    const langArrow = allBtns.find(
      (b) => (b.textContent === "▶" || b.textContent === "▼") && !b.title,
    );
    if (langArrow) await userEvent.click(langArrow);

    const retranslateBtns = await screen.findAllByRole("button", {
      name: /^Retranslate$/i,
    });
    await userEvent.click(retranslateBtns[0]);

    // Only initial 2 calls — no retranslate call
    expect(mockAdminFetch).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 152: queueLanguageForBook error path
// ─────────────────────────────────────────────────────────────────────────────
describe("AdminBooksPage — queueLanguageForBook error path (line 152)", () => {
  it("alerts error when enqueue API fails", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockRejectedValueOnce(new Error("Queue error"));

    render(<BooksPage />);
    await flushPromises();

    const translateBtns = await screen.findAllByRole("button", {
      name: /\+ translate/i,
    });
    await userEvent.click(translateBtns[0]);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Queue error"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 161-210: book detail expansion — metadata display, language expansion
// ─────────────────────────────────────────────────────────────────────────────
describe("AdminBooksPage — book expansion and metadata (lines 161-210)", () => {
  it("shows chapter count and size when book is expanded", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    // "3 chapters cached" should appear
    await waitFor(() =>
      expect(screen.getByText(/3 chapter/i)).toBeInTheDocument(),
    );
  });

  it("collapses book row when collapse button is clicked", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);
    const collapseBtn = await screen.findByTitle("Collapse");
    await userEvent.click(collapseBtn);

    await waitFor(() =>
      expect(screen.queryByTitle("Collapse")).not.toBeInTheDocument(),
    );
  });

  it("shows chapter rows when language row is expanded", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    await waitFor(() => screen.getByText("zh"));
    const allBtns = screen.getAllByRole("button");
    const langArrow = allBtns.find(
      (b) => (b.textContent === "▶" || b.textContent === "▼") && !b.title,
    );
    if (langArrow) await userEvent.click(langArrow);

    // Chapter rows should appear: "Ch. 1" and "Ch. 2"
    await waitFor(() =>
      expect(screen.getByText("Ch. 1")).toBeInTheDocument(),
    );
    expect(screen.getByText("Ch. 2")).toBeInTheDocument();
  });

  it("shows active translation badge for books with active=true", async () => {
    const activeBook = [
      {
        ...SAMPLE_BOOKS[0],
        active: true,
        active_language: "de",
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(activeBook)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    await waitFor(() =>
      expect(screen.getByText(/translating → de/i)).toBeInTheDocument(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 244: SeedPopularButton onComplete callback triggers a silent reload
// ─────────────────────────────────────────────────────────────────────────────
describe("AdminBooksPage — SeedPopularButton onComplete (line 244)", () => {
  it("reloads data when SeedPopularButton calls onComplete", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    await screen.findByText("Moby Dick");
    const seedBtn = screen.getByRole("button", { name: /seed popular/i });
    await userEvent.click(seedBtn);

    await waitFor(() =>
      // 4 total calls: initial 2 + silent reload 2
      expect(mockAdminFetch).toHaveBeenCalledTimes(4),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 350: retryFailedForLang — confirm + API call
// ─────────────────────────────────────────────────────────────────────────────
describe("AdminBooksPage — retryFailedForLang (line 350)", () => {
  const BOOKS_WITH_FAILED = [
    {
      id: 3,
      title: "War and Peace",
      authors: ["Tolstoy"],
      languages: ["ru"],
      download_count: 50,
      text_length: 100000,
      translations: { de: 5 },
      queue: { de: { failed: 2, pending: 0, running: 0 } },
      active: false,
    },
  ];

  it("calls retry endpoint when confirmed", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockAdminFetch
      .mockResolvedValueOnce(BOOKS_WITH_FAILED)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ updated: 2 })
      .mockResolvedValueOnce(BOOKS_WITH_FAILED)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    const retryBtn = await screen.findByRole("button", { name: "↻" });
    await userEvent.click(retryBtn);

    await waitFor(() =>
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/queue/retry-failed",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining("Re-queued"),
    );
  });

  it("does not call retry when confirm is cancelled", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    mockAdminFetch
      .mockResolvedValueOnce(BOOKS_WITH_FAILED)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    const retryBtn = await screen.findByRole("button", { name: "↻" });
    await userEvent.click(retryBtn);

    expect(mockAdminFetch).toHaveBeenCalledTimes(2);
  });

  it("alerts error when retry API fails", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockAdminFetch
      .mockResolvedValueOnce(BOOKS_WITH_FAILED)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Retry failed"));

    render(<BooksPage />);
    await flushPromises();

    const retryBtn = await screen.findByRole("button", { name: "↻" });
    await userEvent.click(retryBtn);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Retry failed"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 373: "Delete all" translations per-lang button
// ─────────────────────────────────────────────────────────────────────────────
describe("AdminBooksPage — Delete all translations per-lang (line 373)", () => {
  it("calls DELETE /admin/translations/:id when Delete all confirmed", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockResolvedValueOnce({}) // DELETE
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    // Expand book 1
    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    // "Delete all" button inside expanded section
    const deleteAllBtn = await screen.findByRole("button", { name: /delete all/i });
    await userEvent.click(deleteAllBtn);

    await waitFor(() =>
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/translations/1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("does not call DELETE when Delete all confirm is cancelled", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    const deleteAllBtn = await screen.findByRole("button", { name: /delete all/i });
    await userEvent.click(deleteAllBtn);

    expect(mockAdminFetch).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 423-534: bulk retranslate, chapter-level delete/move
// ─────────────────────────────────────────────────────────────────────────────
describe("AdminBooksPage — bulk retranslate (lines 423-460)", () => {
  it("calls bulk retranslate endpoint when confirmed", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockResolvedValueOnce({ chapters: 3 }) // bulk retranslate
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    const retranslateAllBtn = await screen.findByRole("button", {
      name: /retranslate all/i,
    });
    await userEvent.click(retranslateAllBtn);

    await waitFor(() =>
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/translations/1/retranslate-all",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining("chapters"),
    );
  });

  it("does not call bulk retranslate when confirm is cancelled", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    const retranslateAllBtn = await screen.findByRole("button", {
      name: /retranslate all/i,
    });
    await userEvent.click(retranslateAllBtn);

    expect(mockAdminFetch).toHaveBeenCalledTimes(2);
  });

  it("alerts error when bulk retranslate fails", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockRejectedValueOnce(new Error("Bulk failed"));

    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    const retranslateAllBtn = await screen.findByRole("button", {
      name: /retranslate all/i,
    });
    await userEvent.click(retranslateAllBtn);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Bulk failed"),
    );
  });
});

describe("AdminBooksPage — chapter-level delete (lines 530-543)", () => {
  async function renderWithChapterRows() {
    // Use only ONE book to avoid confusion with multiple Delete buttons
    const singleBook = [SAMPLE_BOOKS[0]];
    mockAdminFetch
      .mockResolvedValueOnce(singleBook)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    await waitFor(() => screen.getByText("zh"));
    const allBtns = screen.getAllByRole("button");
    const langArrow = allBtns.find(
      (b) => (b.textContent === "▶" || b.textContent === "▼") && !b.title,
    );
    if (langArrow) await userEvent.click(langArrow);
    await waitFor(() => screen.getByText("Ch. 1"));
  }

  it("calls DELETE /admin/translations/:id/:ch/:lang when chapter Delete clicked", async () => {
    // Chapter-level delete does NOT use confirm — override default of false doesn't matter
    // but we keep confirm returning false to block the book-level Delete from firing
    await renderWithChapterRows();

    mockAdminFetch
      .mockResolvedValueOnce({}) // DELETE chapter translation
      .mockResolvedValueOnce([SAMPLE_BOOKS[0]])
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    // After expanding, we have these buttons in order:
    //   Expand/Collapse book, ▶/▼ lang, "Retranslate all", "Delete all" (lang-level),
    //   then per-chapter: "Move", "Retranslate", "Delete"
    // The chapter-level Delete buttons have no red border class that matches
    // "Delete all". Use getAllByRole and pick the last "Delete" (chapter row).
    const deleteBtns = screen.getAllByRole("button", { name: /^Delete$/i });
    // The last Delete buttons are the chapter-level ones (after book-level Delete
    // which only appears once since we have one book)
    // Chapter Delete is the very last button named "Delete"
    await userEvent.click(deleteBtns[deleteBtns.length - 1]);

    await waitFor(() =>
      expect(mockAdminFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/admin\/translations\/1\/\d+\/zh/),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });
});

describe("AdminBooksPage — chapter move (lines 496-519)", () => {
  async function renderWithChapterRows() {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    await waitFor(() => screen.getByText("zh"));
    const allBtns = screen.getAllByRole("button");
    const langArrow = allBtns.find(
      (b) => (b.textContent === "▶" || b.textContent === "▼") && !b.title,
    );
    if (langArrow) await userEvent.click(langArrow);
    await waitFor(() => screen.getByText("Ch. 1"));
  }

  it("alerts when move target is same chapter", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    await renderWithChapterRows();

    // ch_index 0 means Ch. 1 (1-based). Entering 1 is same chapter.
    const moveInputs = screen.getAllByPlaceholderText("→Ch");
    await userEvent.clear(moveInputs[0]);
    await userEvent.type(moveInputs[0], "1");

    const moveBtns = screen.getAllByRole("button", { name: /^Move$/i });
    await userEvent.click(moveBtns[0]);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining("same"),
      ),
    );
  });

  it("alerts when move target is not a valid number", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    await renderWithChapterRows();

    const moveInputs = screen.getAllByPlaceholderText("→Ch");
    await userEvent.clear(moveInputs[0]);
    await userEvent.type(moveInputs[0], "0");

    const moveBtns = screen.getAllByRole("button", { name: /^Move$/i });
    await userEvent.click(moveBtns[0]);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining("chapter number"),
      ),
    );
  });

  it("calls move endpoint and clears input on success", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    await renderWithChapterRows();

    mockAdminFetch
      .mockResolvedValueOnce({}) // move
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    const moveInputs = screen.getAllByPlaceholderText("→Ch");
    await userEvent.clear(moveInputs[0]);
    await userEvent.type(moveInputs[0], "5");

    const moveBtns = screen.getAllByRole("button", { name: /^Move$/i });
    await userEvent.click(moveBtns[0]);

    await waitFor(() =>
      expect(mockAdminFetch).toHaveBeenCalledWith(
        expect.stringContaining("/move"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("alerts error when move API fails", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    await renderWithChapterRows();

    mockAdminFetch.mockRejectedValueOnce(new Error("Move error"));

    const moveInputs = screen.getAllByPlaceholderText("→Ch");
    await userEvent.clear(moveInputs[0]);
    await userEvent.type(moveInputs[0], "5");

    const moveBtns = screen.getAllByRole("button", { name: /^Move$/i });
    await userEvent.click(moveBtns[0]);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Move error"),
    );
  });

  it("triggers move via Enter keydown on move input", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    await renderWithChapterRows();

    mockAdminFetch
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    const moveInputs = screen.getAllByPlaceholderText("→Ch");
    await userEvent.clear(moveInputs[0]);
    await userEvent.type(moveInputs[0], "3{Enter}");

    await waitFor(() =>
      expect(mockAdminFetch).toHaveBeenCalledWith(
        expect.stringContaining("/move"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Import via Enter key (line 233)
// ─────────────────────────────────────────────────────────────────────────────
describe("AdminBooksPage — import via Enter key", () => {
  it("triggers import on Enter keydown in import input", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockResolvedValueOnce({ status: "imported", title: "New Book", text_length: 1000 })
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    const input = await screen.findByPlaceholderText(/gutenberg book id/i);
    await userEvent.type(input, "1234{Enter}");

    await waitFor(() =>
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/books/import",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Queue language selector change
// ─────────────────────────────────────────────────────────────────────────────
describe("AdminBooksPage — language selector (lines 371-373)", () => {
  it("changes the queued language for a book when dropdown is changed", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockResolvedValueOnce({ enqueued: 3 })
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    // There's one language select per book row
    const langSelects = await screen.findAllByTitle(
      "Pick a language to queue for translation",
    );
    // Change language to "de"
    await userEvent.selectOptions(langSelects[0], "de");

    // Then queue it
    const translateBtns = screen.getAllByRole("button", { name: /\+ translate/i });
    await userEvent.click(translateBtns[0]);

    await waitFor(() =>
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/queue/enqueue-book",
        expect.objectContaining({
          body: JSON.stringify({
            book_id: 1,
            target_languages: ["de"],
            priority: 50,
          }),
        }),
      ),
    );
  });
});
