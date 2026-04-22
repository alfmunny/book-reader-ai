/**
 * Tests for vocabulary page.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next-auth
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token123" } }),
}));

// Mock next/navigation
const mockUseSearchParams = jest.fn(() => ({ get: () => null }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => mockUseSearchParams(),
}));

jest.mock("@/lib/api", () => ({
  getVocabulary: jest.fn(),
  deleteVocabularyWord: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
  getWordDefinition: jest.fn(),
}));

import * as api from "@/lib/api";
import VocabularyPage from "@/app/vocabulary/page";

const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockDeleteVocabularyWord = api.deleteVocabularyWord as jest.MockedFunction<typeof api.deleteVocabularyWord>;
const mockExportVocabularyToObsidian = api.exportVocabularyToObsidian as jest.MockedFunction<typeof api.exportVocabularyToObsidian>;

const SAMPLE_WORDS = [
  {
    id: 1,
    word: "ephemeral",
    occurrences: [
      {
        book_id: 10,
        book_title: "Moby Dick",
        chapter_index: 2,
        sentence_text: "The ephemeral whale loomed.",
      },
    ],
  },
  {
    id: 2,
    word: "ardent",
    occurrences: [
      {
        book_id: 10,
        book_title: "Moby Dick",
        chapter_index: 5,
        sentence_text: "His ardent gaze swept the sea.",
      },
    ],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetVocabulary.mockResolvedValue(SAMPLE_WORDS);
});

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

test("renders word list after load", async () => {
  render(<VocabularyPage />);
  await flushPromises();
  expect(await screen.findByText("ephemeral")).toBeInTheDocument();
  expect(screen.getByText("ardent")).toBeInTheDocument();
});

test("shows book title and chapter for each occurrence", async () => {
  render(<VocabularyPage />);
  // Wait for words to load
  const titles = await screen.findAllByText("Moby Dick");
  expect(titles.length).toBeGreaterThanOrEqual(1);
  // chapter_index 2 → displayed as "Ch.3" (1-based)
  expect(screen.getByText("Ch.3")).toBeInTheDocument();
});

test("occurrence with null book_title (deleted book) shows fallback text instead of blank link", async () => {
  mockGetVocabulary.mockResolvedValue([
    {
      id: 1,
      word: "ephemeral",
      occurrences: [
        {
          book_id: 999,
          book_title: null,
          chapter_index: 0,
          sentence_text: "The ephemeral moment passed.",
        },
      ],
    },
  ]);
  render(<VocabularyPage />);
  await screen.findByText("ephemeral");
  expect(screen.getByText("(deleted book)")).toBeInTheDocument();
  // Should NOT render a clickable link for a deleted book
  const link = screen.queryByRole("link", { name: "(deleted book)" });
  expect(link).not.toBeInTheDocument();
});

test("groups words alphabetically under correct letter heading", async () => {
  render(<VocabularyPage />);
  await flushPromises();
  // 'a' for ardent, 'e' for ephemeral
  expect(await screen.findByText("A")).toBeInTheDocument();
  expect(screen.getByText("E")).toBeInTheDocument();
});

test("delete button calls deleteVocabularyWord and removes word", async () => {
  mockDeleteVocabularyWord.mockResolvedValue({ ok: true });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ephemeral");

  const deleteBtn = screen.getByTestId("delete-ephemeral");
  await userEvent.click(deleteBtn);

  await waitFor(() => {
    expect(mockDeleteVocabularyWord).toHaveBeenCalledWith("ephemeral");
    expect(screen.queryByText("ephemeral")).not.toBeInTheDocument();
  });
});

test("export button calls exportVocabularyToObsidian with no book_id", async () => {
  mockExportVocabularyToObsidian.mockResolvedValue({ urls: ["https://github.com/example/pr/1"] });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ephemeral");

  const exportBtn = screen.getByTestId("export-all-btn");
  await userEvent.click(exportBtn);

  await waitFor(() => {
    expect(mockExportVocabularyToObsidian).toHaveBeenCalledWith(undefined);
  });
});

test("export shows URL link when export succeeds", async () => {
  mockExportVocabularyToObsidian.mockResolvedValue({ urls: ["https://github.com/example/pr/1"] });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ephemeral");

  const exportBtn = screen.getByTestId("export-all-btn");
  await userEvent.click(exportBtn);

  await waitFor(() => {
    const link = screen.getByRole("link", { name: "https://github.com/example/pr/1" });
    expect(link).toHaveAttribute("href", "https://github.com/example/pr/1");
  });
});

test("export shows error message when export fails", async () => {
  mockExportVocabularyToObsidian.mockRejectedValue(new Error("GitHub API error"));

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ephemeral");

  const exportBtn = screen.getByTestId("export-all-btn");
  await userEvent.click(exportBtn);

  await waitFor(() => {
    expect(screen.getByText("GitHub API error")).toBeInTheDocument();
  });
});

test("shows empty state when no words", async () => {
  mockGetVocabulary.mockResolvedValue([]);
  render(<VocabularyPage />);
  await flushPromises();
  expect(await screen.findByText(/No saved words yet/i)).toBeInTheDocument();
});

// ── Flash highlight on target word ───────────────────────────────────────────

test("target word card gets animate-vocab-flash class when ?word= matches", async () => {
  mockUseSearchParams.mockReturnValue({ get: (k: string) => (k === "word" ? "ephemeral" : null) });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ephemeral");

  // The card wrapping the target word should have the flash class
  const card = screen.getByText("ephemeral").closest("[class*='rounded-xl']");
  expect(card?.className).toContain("animate-vocab-flash");
});

test("non-target word cards do NOT get animate-vocab-flash", async () => {
  mockUseSearchParams.mockReturnValue({ get: (k: string) => (k === "word" ? "ephemeral" : null) });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ardent");

  const card = screen.getByText("ardent").closest("[class*='rounded-xl']");
  expect(card?.className).not.toContain("animate-vocab-flash");
});
