/**
 * AdminBooksPage — second branch coverage pass targeting remaining missed branches.
 *
 * Remaining uncovered lines from coverage report:
 *  Line 75:   load catch — non-Error thrown → "Failed to load books"
 *  Line 96:   handleImport early return when id <= 0
 *  Line 111:  handleImport catch — non-Error thrown → "Import failed"
 *  Lines 141-152: queueLanguageForBook early return when lang="" + non-Error catch
 *  Line 190:  handleMove catch — non-Error thrown → "Move failed"
 *  Line 208:  retryFailedForLang catch — non-Error thrown → "Retry failed"
 *  Lines 303-305: word_count display; authors display
 *  Line 314:  translation count 0 → count = 0
 *  Line 320:  if (count) pieces guard
 *  Line 352:  failed===1 → singular "chapter" in title
 *  Line 423:  setExpandedLang toggle (collapse lang row)
 *  Line 430:  count===1 → singular "chapter cached"
 *  Line 453:  bulk retranslate non-Error catch → "Failed"
 *  Line 480:  chapterRows.length===0 message shown
 *  Lines 512-518: moveInput onChange
 *  Line 564:  books.filter(...).length===0 when search has no match (with books present)
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

// ── Line 75: load catch — non-Error thrown ────────────────────────────────────

describe("AdminBooksPage — load catch non-Error (line 75)", () => {
  it("shows generic 'Failed to load books' when load throws a non-Error", async () => {
    mockAdminFetch.mockRejectedValueOnce("plain string error");

    render(<BooksPage />);
    await flushPromises();

    await waitFor(() =>
      expect(screen.getByText(/Failed to load books/i)).toBeInTheDocument(),
    );
  });
});

// ── Line 96: handleImport early return when id is 0 ──────────────────────────

describe("AdminBooksPage — handleImport invalid id guard (line 96)", () => {
  it("does not call adminFetch when import ID is 0", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    // Type "0" as the book ID — parseInt("0") = 0 → guard returns early
    const input = await screen.findByPlaceholderText(/gutenberg book id/i);
    await userEvent.type(input, "0");
    await userEvent.click(screen.getByRole("button", { name: /import book/i }));

    // Only initial 2 calls, no import call
    await flushPromises();
    expect(mockAdminFetch).toHaveBeenCalledTimes(2);
  });

  it("does not call adminFetch when import ID is not a number", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    const input = await screen.findByPlaceholderText(/gutenberg book id/i);
    await userEvent.type(input, "abc");
    await userEvent.click(screen.getByRole("button", { name: /import book/i }));

    await flushPromises();
    expect(mockAdminFetch).toHaveBeenCalledTimes(2);
  });
});

// ── Line 111: handleImport non-Error catch ────────────────────────────────────

describe("AdminBooksPage — handleImport non-Error catch (line 111)", () => {
  it("shows 'Import failed' fallback when non-Error is thrown", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockRejectedValueOnce("string error");

    render(<BooksPage />);
    await flushPromises();

    const input = await screen.findByPlaceholderText(/gutenberg book id/i);
    await userEvent.type(input, "1234");
    await userEvent.click(screen.getByRole("button", { name: /import book/i }));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Import failed"),
    );
  });
});

// ── Lines 141-152: queueLanguageForBook non-Error catch ───────────────────────

describe("AdminBooksPage — queueLanguageForBook non-Error catch (lines 141-152)", () => {
  it("shows 'Enqueue failed' when non-Error is thrown during queue", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockRejectedValueOnce("not an error");

    render(<BooksPage />);
    await flushPromises();

    const translateBtns = await screen.findAllByRole("button", {
      name: /\+ translate/i,
    });
    await userEvent.click(translateBtns[0]);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Enqueue failed"),
    );
  });
});

// ── Line 190: handleMove non-Error catch ──────────────────────────────────────

describe("AdminBooksPage — handleMove non-Error catch (line 190)", () => {
  jest.spyOn(window, "confirm").mockReturnValue(true);

  async function renderWithChapterRows() {
    const singleBook = [SAMPLE_BOOKS[0]];
    mockAdminFetch
      .mockResolvedValueOnce(singleBook)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByRole("button", { name: /^Expand / });
    await userEvent.click(expandBtns[0]);

    await waitFor(() => screen.getByText("zh"));
    const allBtns = screen.getAllByRole("button");
    const langArrow = allBtns.find(
      (b) => (b.getAttribute("aria-label")?.startsWith("Expand") || b.getAttribute("aria-label")?.startsWith("Collapse")) && !b.title,
    );
    if (langArrow) await userEvent.click(langArrow);
    await waitFor(() => screen.getByText("Ch. 1"));
  }

  it("shows 'Move failed' fallback when non-Error is thrown during move", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    await renderWithChapterRows();

    mockAdminFetch.mockRejectedValueOnce("non-error string");

    const moveInputs = screen.getAllByPlaceholderText("→Ch");
    await userEvent.clear(moveInputs[0]);
    await userEvent.type(moveInputs[0], "5");

    const moveBtns = screen.getAllByRole("button", { name: /^Move$/i });
    await userEvent.click(moveBtns[0]);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Move failed"),
    );
  });
});

// ── Line 208: retryFailedForLang non-Error catch ──────────────────────────────

describe("AdminBooksPage — retryFailedForLang non-Error catch (line 208)", () => {
  it("shows 'Retry failed' fallback when non-Error is thrown", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
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
    mockAdminFetch
      .mockResolvedValueOnce(BOOKS_WITH_FAILED)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce("string error");

    render(<BooksPage />);
    await flushPromises();

    const retryBtn = await screen.findByRole("button", { name: /Retry.*failed.*chapter/i });
    await userEvent.click(retryBtn);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Retry failed"),
    );
  });
});

// ── Lines 303-305: word_count and authors display ─────────────────────────────

describe("AdminBooksPage — book metadata display (lines 303-305)", () => {
  it("shows word count when book has word_count", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();
    await screen.findByText("Moby Dick");

    // word_count: 9000 → "9,000 words"
    expect(screen.getByText(/9,000 words/)).toBeInTheDocument();
  });

  it("shows authors when book has authors array", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();
    await screen.findByText("Moby Dick");

    expect(screen.getByText(/Herman Melville/)).toBeInTheDocument();
  });

  it("does not show word count when book has no word_count", async () => {
    const bookNoWordCount = [{ ...SAMPLE_BOOKS[0], word_count: undefined }];
    mockAdminFetch
      .mockResolvedValueOnce(bookNoWordCount)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();
    await screen.findByText("Moby Dick");

    expect(screen.queryByText(/words/)).not.toBeInTheDocument();
  });
});

// ── Line 352: failed===1 → singular "chapter" in retry button title ───────────

describe("AdminBooksPage — retry button singular chapter title (line 352)", () => {
  it("shows singular 'chapter' in retry title when failed===1", async () => {
    const bookWith1Failed = [
      {
        id: 4,
        title: "Singular Book",
        authors: ["Author"],
        languages: ["en"],
        download_count: 10,
        text_length: 1000,
        translations: { fr: 2 },
        queue: { fr: { failed: 1, pending: 0, running: 0 } },
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(bookWith1Failed)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    const retryBtn = await screen.findByTitle(/1 failed fr chapter$/);
    expect(retryBtn).toBeInTheDocument();
  });

  it("shows plural 'chapters' in retry title when failed>1", async () => {
    const bookWithMultiFailed = [
      {
        id: 5,
        title: "Plural Book",
        authors: ["Author"],
        languages: ["en"],
        download_count: 10,
        text_length: 1000,
        translations: { fr: 5 },
        queue: { fr: { failed: 3, pending: 0, running: 0 } },
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(bookWithMultiFailed)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    const retryBtn = await screen.findByTitle(/3 failed fr chapters$/);
    expect(retryBtn).toBeInTheDocument();
  });
});

// ── Line 423: setExpandedLang toggle (collapse) ───────────────────────────────

describe("AdminBooksPage — language row expand/collapse toggle (line 423)", () => {
  it("collapses language row when already-expanded lang row is clicked again", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    // Expand book
    const expandBtns = await screen.findAllByRole("button", { name: /^Expand / });
    await userEvent.click(expandBtns[0]);

    await waitFor(() => screen.getByText("zh"));

    // Find the lang arrow and click it to expand
    const allBtns = screen.getAllByRole("button");
    const langArrow = allBtns.find(
      (b) => (b.getAttribute("aria-label")?.startsWith("Expand") || b.getAttribute("aria-label")?.startsWith("Collapse")) && !b.title,
    );
    if (langArrow) {
      await userEvent.click(langArrow);
      // Now it should be expanded (▼)
      await waitFor(() => screen.getByText("Ch. 1"));

      // Click again to collapse
      const collapsedArrow = screen.getAllByRole("button").find(
        (b) => b.getAttribute("aria-label")?.startsWith("Collapse") && !b.title,
      );
      if (collapsedArrow) {
        await userEvent.click(collapsedArrow);
        // Ch. 1 should disappear
        await waitFor(() =>
          expect(screen.queryByText("Ch. 1")).not.toBeInTheDocument(),
        );
      }
    }
  });
});

// ── Line 430: count===1 → singular "chapter cached" ──────────────────────────

describe("AdminBooksPage — singular chapter count (line 430)", () => {
  it("shows '1 chapter cached' (singular) when count is 1", async () => {
    const booksWith1Translation = [
      {
        id: 6,
        title: "One Chapter Book",
        authors: ["Writer"],
        languages: ["en"],
        download_count: 5,
        text_length: 2000,
        translations: { zh: 1 }, // exactly 1 chapter
        queue: {},
        active: false,
      },
    ];
    const translations1 = [
      {
        book_id: 6,
        chapter_index: 0,
        target_language: "zh",
        size_chars: 1000,
        created_at: "2024-01-01",
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(booksWith1Translation)
      .mockResolvedValueOnce(translations1);

    render(<BooksPage />);
    await flushPromises();

    // Expand book
    const expandBtns = await screen.findAllByRole("button", { name: /^Expand / });
    await userEvent.click(expandBtns[0]);

    await waitFor(() =>
      expect(screen.getByText(/· 1 chapter cached/)).toBeInTheDocument(),
    );
  });
});

// ── Line 453: bulk retranslate non-Error catch → "Failed" ────────────────────

describe("AdminBooksPage — bulk retranslate non-Error catch (line 453)", () => {
  it("shows 'Failed' fallback when bulk retranslate throws non-Error", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS)
      .mockRejectedValueOnce("non-error");

    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByRole("button", { name: /^Expand / });
    await userEvent.click(expandBtns[0]);

    const retranslateAllBtn = await screen.findByRole("button", {
      name: /retranslate all/i,
    });
    await userEvent.click(retranslateAllBtn);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Failed"),
    );
  });
});

// ── Line 480: chapterRows.length===0 message when lang expanded ───────────────

describe("AdminBooksPage — empty chapter rows message (line 480)", () => {
  it("shows reload message when expanded lang has no matching chapter translations", async () => {
    // Book has zh translations count=2 but the translations list has no zh rows
    // (simulates a mismatch / stale data scenario)
    const bookWithZhButNoRows = [
      {
        id: 10,
        title: "Mismatch Book",
        authors: ["Author"],
        languages: ["en"],
        download_count: 5,
        text_length: 2000,
        translations: { zh: 2 },
        queue: {},
        active: false,
      },
    ];
    // Translations list has entries for a different book/lang
    const translationsOtherLang = [
      {
        book_id: 10,
        chapter_index: 0,
        target_language: "de",  // different lang
        size_chars: 500,
        created_at: "2024-01-01",
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(bookWithZhButNoRows)
      .mockResolvedValueOnce(translationsOtherLang);

    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByRole("button", { name: /^Expand / });
    await userEvent.click(expandBtns[0]);

    await waitFor(() => screen.getByText("zh"));
    const allBtns = screen.getAllByRole("button");
    const langArrow = allBtns.find(
      (b) => (b.getAttribute("aria-label")?.startsWith("Expand") || b.getAttribute("aria-label")?.startsWith("Collapse")) && !b.title,
    );
    if (langArrow) await userEvent.click(langArrow);

    await waitFor(() =>
      expect(
        screen.getByText(/Chapter-level details load from the translations list/i),
      ).toBeInTheDocument(),
    );
  });
});

// ── Lines 512-518: moveInput onChange (change input value) ───────────────────

describe("AdminBooksPage — moveInput onChange (lines 512-518)", () => {
  async function renderWithChapterRows() {
    const singleBook = [SAMPLE_BOOKS[0]];
    mockAdminFetch
      .mockResolvedValueOnce(singleBook)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByRole("button", { name: /^Expand / });
    await userEvent.click(expandBtns[0]);

    await waitFor(() => screen.getByText("zh"));
    const allBtns = screen.getAllByRole("button");
    const langArrow = allBtns.find(
      (b) => (b.getAttribute("aria-label")?.startsWith("Expand") || b.getAttribute("aria-label")?.startsWith("Collapse")) && !b.title,
    );
    if (langArrow) await userEvent.click(langArrow);
    await waitFor(() => screen.getByText("Ch. 1"));
  }

  it("typing in moveInput enables the Move button", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    await renderWithChapterRows();

    const moveInputs = screen.getAllByPlaceholderText("→Ch") as HTMLInputElement[];
    await userEvent.type(moveInputs[0], "4");
    expect(moveInputs[0].value).toBe("4");

    const moveBtns = screen.getAllByRole("button", { name: /^Move$/i });
    expect(moveBtns[0]).not.toBeDisabled();
  });
});

// ── Line 564: books.filter().length===0 — search with no match (books > 0) ────

describe("AdminBooksPage — filtered empty when search mismatches (line 564)", () => {
  it("shows 'No books match' div inside book list when all books are filtered out", async () => {
    // Need non-empty books but search that matches nothing
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_BOOKS)
      .mockResolvedValueOnce(SAMPLE_TRANSLATIONS);

    render(<BooksPage />);
    await flushPromises();

    const searchInput = await screen.findByRole("searchbox");
    await userEvent.type(searchInput, "xxxxnomatch");

    await waitFor(() =>
      expect(screen.getByText(/No books match/i)).toBeInTheDocument(),
    );
  });
});
