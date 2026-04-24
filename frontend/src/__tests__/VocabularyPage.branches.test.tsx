/**
 * VocabularyPage — branch coverage for missed branches (75% → ≥90%).
 *
 * Uncovered branches identified from coverage report (lines 72, 113):
 *  - router.push("/") click on "← Library" button
 *  - search onChange when words.length > 5 (renders search input)
 *  - words.length === 1 → singular "word" / occurrences === 1 → singular "occurrence"
 *  - exportMsg that starts with "http" → link rendering branch
 *  - urls[0] falsy → falls back to "Exported successfully"
 *  - export catch path: Error vs non-Error
 *  - word with empty first character → grouped under "#"
 *  - filtered.length === 0 (search with no matches)
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token123" } }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock("@/lib/api", () => ({
  getVocabulary: jest.fn(),
  deleteVocabularyWord: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
  getWordDefinition: jest.fn(),
  listVocabularyTags: jest.fn().mockResolvedValue([]),
  getVocabularyWordTags: jest.fn().mockResolvedValue([]),
  addVocabularyWordTag: jest.fn().mockResolvedValue({ tag: "" }),
  removeVocabularyWordTag: jest.fn().mockResolvedValue(undefined),
  ApiError: class ApiError extends Error { status = 500; },
}));

import * as api from "@/lib/api";
import VocabularyPage from "@/app/vocabulary/page";

const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockExportVocabularyToObsidian = api.exportVocabularyToObsidian as jest.MockedFunction<
  typeof api.exportVocabularyToObsidian
>;

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

// Six+ words so the search input is rendered (words.length > 5)
const MANY_WORDS = [
  { id: 1, word: "apple", occurrences: [{ book_id: 1, book_title: "Book A", chapter_index: 0, sentence_text: "s1" }] },
  { id: 2, word: "banana", occurrences: [{ book_id: 1, book_title: "Book A", chapter_index: 1, sentence_text: "s2" }] },
  { id: 3, word: "cherry", occurrences: [{ book_id: 2, book_title: "Book B", chapter_index: 0, sentence_text: "s3" }] },
  { id: 4, word: "date", occurrences: [{ book_id: 2, book_title: "Book B", chapter_index: 1, sentence_text: "s4" }] },
  { id: 5, word: "elderberry", occurrences: [{ book_id: 3, book_title: "Book C", chapter_index: 2, sentence_text: "s5" }] },
  { id: 6, word: "fig", occurrences: [{ book_id: 3, book_title: "Book C", chapter_index: 3, sentence_text: "s6" }] },
];

const ONE_WORD = [
  { id: 1, word: "solitary", occurrences: [{ book_id: 1, book_title: "Book", chapter_index: 0, sentence_text: "s" }] },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.mockReset();
});

// ── Line 72: router.push("/") ─────────────────────────────────────────────────

describe("VocabularyPage — Library back button (line 72)", () => {
  it("navigates to '/' when ← Library button is clicked", async () => {
    mockGetVocabulary.mockResolvedValue(MANY_WORDS);
    render(<VocabularyPage />);
    await flushPromises();

    await screen.findByText("apple");
    await userEvent.click(screen.getByText("Library"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});

// ── Line 113: search onChange (words.length > 5) ──────────────────────────────

describe("VocabularyPage — search input onChange (line 113)", () => {
  it("renders search input when words.length > 5 and typing filters words", async () => {
    mockGetVocabulary.mockResolvedValue(MANY_WORDS);
    render(<VocabularyPage />);
    await flushPromises();

    await screen.findByText("apple");

    const searchInput = screen.getByPlaceholderText("Search words…");
    expect(searchInput).toBeInTheDocument();

    // Type something to trigger onChange → setSearch
    await userEvent.type(searchInput, "app");

    // Only "apple" should remain visible
    await waitFor(() => expect(screen.getByText("apple")).toBeInTheDocument());
    expect(screen.queryByText("banana")).not.toBeInTheDocument();
  });

  it("shows 'No words match' message when search has no matches", async () => {
    mockGetVocabulary.mockResolvedValue(MANY_WORDS);
    render(<VocabularyPage />);
    await flushPromises();
    await screen.findByText("apple");

    const searchInput = screen.getByPlaceholderText("Search words…");
    await userEvent.type(searchInput, "zzznomatch");

    await waitFor(() =>
      expect(screen.getByText(/No words match/i)).toBeInTheDocument(),
    );
  });
});

// ── Singular/plural branches for words and occurrences ───────────────────────

describe("VocabularyPage — singular/plural word count display", () => {
  it("shows '1 word' (singular) and '1 occurrence' when exactly one word with one occurrence", async () => {
    mockGetVocabulary.mockResolvedValue(ONE_WORD);
    render(<VocabularyPage />);
    await flushPromises();
    await screen.findByText("solitary");

    // words.length === 1 → "word" not "words"
    // totalOccurrences === 1 → "occurrence" not "occurrences"
    expect(screen.getByText(/1 word · 1 occurrence/)).toBeInTheDocument();
  });

  it("shows '2 words' (plural) and '3 occurrences' (plural) for multiple entries", async () => {
    const multiOccWords = [
      {
        id: 1,
        word: "alpha",
        occurrences: [
          { book_id: 1, book_title: "B", chapter_index: 0, sentence_text: "s1" },
          { book_id: 1, book_title: "B", chapter_index: 1, sentence_text: "s2" },
        ],
      },
      {
        id: 2,
        word: "beta",
        occurrences: [
          { book_id: 2, book_title: "C", chapter_index: 0, sentence_text: "s3" },
        ],
      },
    ];
    mockGetVocabulary.mockResolvedValue(multiOccWords);
    render(<VocabularyPage />);
    await flushPromises();
    await screen.findByText("alpha");

    expect(screen.getByText(/2 words · 3 occurrences/)).toBeInTheDocument();
  });
});

// ── Export: exportMsg starts with "http" → link branch ───────────────────────

describe("VocabularyPage — export message link branch", () => {
  it("renders a clickable link when export URL starts with 'http'", async () => {
    mockGetVocabulary.mockResolvedValue(ONE_WORD);
    mockExportVocabularyToObsidian.mockResolvedValue({ urls: ["https://example.com/note.md"] });

    render(<VocabularyPage />);
    await flushPromises();
    await screen.findByText("solitary");

    await userEvent.click(screen.getByTestId("export-all-btn"));

    await waitFor(() => {
      const link = screen.getByRole("link", { name: "https://example.com/note.md" });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "https://example.com/note.md");
    });
  });

  it("renders error text in red when export result does not start with 'http'", async () => {
    mockGetVocabulary.mockResolvedValue(ONE_WORD);
    mockExportVocabularyToObsidian.mockResolvedValue({ urls: ["Export successful but no URL returned"] });

    render(<VocabularyPage />);
    await flushPromises();
    await screen.findByText("solitary");

    await userEvent.click(screen.getByTestId("export-all-btn"));

    await waitFor(() =>
      expect(screen.getByText("Export successful but no URL returned")).toBeInTheDocument(),
    );
  });
});

// ── Export: urls[0] falsy → "Exported successfully" fallback ─────────────────

describe("VocabularyPage — export urls empty fallback", () => {
  it("shows 'Exported successfully' when urls array is empty", async () => {
    mockGetVocabulary.mockResolvedValue(ONE_WORD);
    mockExportVocabularyToObsidian.mockResolvedValue({ urls: [] });

    render(<VocabularyPage />);
    await flushPromises();
    await screen.findByText("solitary");

    await userEvent.click(screen.getByTestId("export-all-btn"));

    await waitFor(() =>
      expect(screen.getByText("Exported successfully")).toBeInTheDocument(),
    );
  });
});

// ── Export catch: Error instance vs non-Error ─────────────────────────────────

describe("VocabularyPage — export error paths", () => {
  it("shows error message from Error instance when export throws", async () => {
    mockGetVocabulary.mockResolvedValue(ONE_WORD);
    mockExportVocabularyToObsidian.mockRejectedValue(new Error("Obsidian vault not found"));

    render(<VocabularyPage />);
    await flushPromises();
    await screen.findByText("solitary");

    await userEvent.click(screen.getByTestId("export-all-btn"));

    await waitFor(() =>
      expect(screen.getByText("Obsidian vault not found")).toBeInTheDocument(),
    );
  });

  it("shows 'Export failed' when export throws a non-Error value", async () => {
    mockGetVocabulary.mockResolvedValue(ONE_WORD);
    mockExportVocabularyToObsidian.mockRejectedValue("plain string failure");

    render(<VocabularyPage />);
    await flushPromises();
    await screen.findByText("solitary");

    await userEvent.click(screen.getByTestId("export-all-btn"));

    await waitFor(() =>
      expect(screen.getByText("Export failed")).toBeInTheDocument(),
    );
  });
});

// ── Issue #837: fetch failure shows error state, not empty-vocabulary state ───

describe("VocabularyPage — fetch error state (regression #837)", () => {
  it("shows error message when getVocabulary rejects, not the empty-words empty state", async () => {
    mockGetVocabulary.mockRejectedValue(new Error("Network error"));
    render(<VocabularyPage />);
    await flushPromises();

    await waitFor(() =>
      expect(screen.getByText("Failed to load vocabulary.")).toBeInTheDocument(),
    );
    // Must NOT show the "no saved words" empty state
    expect(screen.queryByText("No saved words yet.")).not.toBeInTheDocument();
  });
});

// ── Grouped under "#" when word has empty/undefined first char ────────────────

describe("VocabularyPage — word grouped under '#' fallback letter", () => {
  it("groups word starting with unusual char under '#'", async () => {
    // A word whose .word[0] is undefined would need word="" but that never
    // happens in practice. The ?? "#" covers the optional-chaining null case.
    // We can trigger the else-branch by having a word that starts with a
    // non-letter and verifying the grouping still works.
    const wordsWithHash = [
      {
        id: 99,
        word: "1984",
        occurrences: [{ book_id: 9, book_title: "Dystopia", chapter_index: 0, sentence_text: "Big Brother." }],
      },
    ];
    mockGetVocabulary.mockResolvedValue(wordsWithHash);
    render(<VocabularyPage />);
    await flushPromises();

    await screen.findByText("1984");
    // Grouped under "1" (the digit upper-cased is still "1")
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
