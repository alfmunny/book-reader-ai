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
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getVocabulary: jest.fn(),
  deleteVocabularyWord: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
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
        book_language: "en",
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
        book_language: "en",
        chapter_index: 5,
        sentence_text: "His ardent gaze swept the sea.",
      },
    ],
  },
];

const MULTI_LANG_WORDS = [
  {
    id: 1,
    word: "Schiff",
    occurrences: [{ book_id: 20, book_title: "Faust", book_language: "de", chapter_index: 0, sentence_text: "Das Schiff fuhr fort." }],
  },
  {
    id: 2,
    word: "ephemeral",
    occurrences: [{ book_id: 10, book_title: "Moby Dick", book_language: "en", chapter_index: 2, sentence_text: "The ephemeral whale." }],
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
  mockExportVocabularyToObsidian.mockResolvedValue({ url: "https://github.com/example/pr/1" });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ephemeral");

  const exportBtn = screen.getByTestId("export-all-btn");
  await userEvent.click(exportBtn);

  await waitFor(() => {
    expect(mockExportVocabularyToObsidian).toHaveBeenCalledWith(undefined);
  });
});

test("shows empty state when no words", async () => {
  mockGetVocabulary.mockResolvedValue([]);
  render(<VocabularyPage />);
  await flushPromises();
  expect(await screen.findByText(/No saved words yet/i)).toBeInTheDocument();
});

test("shows language filter tabs when words span multiple languages", async () => {
  mockGetVocabulary.mockResolvedValue(MULTI_LANG_WORDS);
  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("Schiff");

  expect(screen.getByTestId("lang-filter")).toBeInTheDocument();
  expect(screen.getByTestId("lang-filter-de")).toBeInTheDocument();
  expect(screen.getByTestId("lang-filter-en")).toBeInTheDocument();
});

test("language filter shows only words from selected language", async () => {
  mockGetVocabulary.mockResolvedValue(MULTI_LANG_WORDS);
  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("Schiff");

  // Click German filter
  await userEvent.click(screen.getByTestId("lang-filter-de"));

  // Only German word visible
  expect(screen.getByText("Schiff")).toBeInTheDocument();
  expect(screen.queryByText("ephemeral")).not.toBeInTheDocument();
});

test("does not show language tabs when all words are from single language", async () => {
  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ephemeral");

  expect(screen.queryByTestId("lang-filter")).not.toBeInTheDocument();
});
