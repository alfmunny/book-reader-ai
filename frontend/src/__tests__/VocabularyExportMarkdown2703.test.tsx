/**
 * /vocabulary — the Export button offers a direct Markdown download alongside
 * the existing Obsidian vault flow (#2703).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token123" } }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock("@/lib/api", () => ({
  getVocabulary: jest.fn(),
  deleteVocabularyWord: jest.fn().mockResolvedValue(undefined),
  exportVocabularyToObsidian: jest.fn(),
  getWordDefinition: jest.fn(),
  listVocabularyTags: jest.fn().mockResolvedValue([]),
  getVocabularyWordTags: jest.fn().mockResolvedValue([]),
  addVocabularyWordTag: jest.fn().mockResolvedValue({ tag: "" }),
  removeVocabularyWordTag: jest.fn().mockResolvedValue(undefined),
  ApiError: class ApiError extends Error { status = 500; },
}));

jest.mock("@/lib/download", () => ({
  downloadTextFile: jest.fn(),
  slugifyFilename: jest.requireActual("@/lib/download").slugifyFilename,
}));

import * as api from "@/lib/api";
import { downloadTextFile } from "@/lib/download";
import VocabularyPage from "@/app/vocabulary/page";

const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockExportObsidian = api.exportVocabularyToObsidian as jest.MockedFunction<typeof api.exportVocabularyToObsidian>;
const mockDownload = downloadTextFile as jest.MockedFunction<typeof downloadTextFile>;

const WORDS = [
  {
    id: 1,
    word: "ephemeral",
    occurrences: [
      { book_id: 10, book_title: "Moby Dick", chapter_index: 2, sentence_text: "The ephemeral whale loomed." },
    ],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetVocabulary.mockResolvedValue(WORDS);
});

async function openExportMenu() {
  await screen.findByText("ephemeral");
  await userEvent.click(screen.getByTestId("export-all-btn"));
}

test("the Export button opens a menu instead of exporting to Obsidian straight away", async () => {
  render(<VocabularyPage />);
  await openExportMenu();

  expect(screen.getByRole("menuitem", { name: /download markdown/i })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /export to obsidian/i })).toBeInTheDocument();
  expect(mockExportObsidian).not.toHaveBeenCalled();
});

test("Download Markdown writes vocabulary.md with the saved words", async () => {
  render(<VocabularyPage />);
  await openExportMenu();
  await userEvent.click(screen.getByRole("menuitem", { name: /download markdown/i }));
  // Grouping/scope are chosen in the export dialog (#2703 follow-up).
  await userEvent.click(screen.getByRole("button", { name: /^download$/i }));

  expect(mockDownload).toHaveBeenCalledTimes(1);
  expect(mockDownload.mock.calls[0][0]).toBe("vocabulary.md");
  const md = mockDownload.mock.calls[0][1];
  expect(md).toContain("# Vocabulary");
  // The dialog opens on A–Z, so sections are initials and each line names its book.
  expect(md).toContain("## E");
  expect(md).toContain("**ephemeral**");
  expect(md).toContain("The ephemeral whale loomed.");
  expect(md).toContain("Moby Dick");
});

test("a successful download is reported in the status line", async () => {
  render(<VocabularyPage />);
  await openExportMenu();
  await userEvent.click(screen.getByRole("menuitem", { name: /download markdown/i }));
  await userEvent.click(screen.getByRole("button", { name: /^download$/i }));

  await waitFor(() => expect(screen.getByText(/Downloaded vocabulary\.md/i)).toBeInTheDocument());
});

test("Export to Obsidian still runs the vault flow for the whole list", async () => {
  mockExportObsidian.mockResolvedValue({ urls: ["https://github.com/example/pr/1"] });
  render(<VocabularyPage />);
  await openExportMenu();
  await userEvent.click(screen.getByRole("menuitem", { name: /export to obsidian/i }));

  await waitFor(() => expect(mockExportObsidian).toHaveBeenCalledWith(undefined));
  expect(mockDownload).not.toHaveBeenCalled();
});

test("the Export button stays disabled while there are no words", async () => {
  mockGetVocabulary.mockResolvedValue([]);
  render(<VocabularyPage />);
  await screen.findByText(/No saved words yet/i);

  expect(screen.getByTestId("export-all-btn")).toBeDisabled();
});
