/**
 * /vocabulary — "Download Markdown" opens the export dialog, and the chosen
 * grouping/scope shapes both the file and its name.
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
import VocabularyPage from "@/app/(shell)/vocabulary/page";

const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockDownload = downloadTextFile as jest.MockedFunction<typeof downloadTextFile>;

const WORDS = [
  {
    id: 1, word: "ephemeral", language: "en", created_at: "2026-01-01T00:00:00",
    occurrences: [{ book_id: 10, book_title: "Moby Dick", chapter_index: 2, sentence_text: "The ephemeral whale." }],
  },
  {
    id: 2, word: "verhöhnen", language: "de", created_at: "2026-02-01T00:00:00",
    occurrences: [{ book_id: 20, book_title: "Faust", chapter_index: 0, sentence_text: "Er wurde verhöhnt." }],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetVocabulary.mockResolvedValue(WORDS);
});

async function openExportDialog() {
  await screen.findByText("ephemeral");
  await userEvent.click(screen.getByTestId("export-all-btn"));
  await userEvent.click(screen.getByRole("menuitem", { name: /download markdown/i }));
  return screen.getByRole("dialog");
}

test("Download Markdown opens the dialog instead of downloading straight away", async () => {
  render(<VocabularyPage />);
  await openExportDialog();

  expect(screen.getByRole("dialog")).toHaveAccessibleName(/export vocabulary/i);
  expect(mockDownload).not.toHaveBeenCalled();
});

test("the default download is grouped A–Z across everything", async () => {
  render(<VocabularyPage />);
  await openExportDialog();
  await userEvent.click(screen.getByRole("button", { name: /^download$/i }));

  expect(mockDownload).toHaveBeenCalledTimes(1);
  const [filename, md] = mockDownload.mock.calls[0];
  expect(filename).toBe("vocabulary.md");
  expect(md).toContain("## E");
  expect(md).toContain("## V");
  expect(md).toContain("**ephemeral**");
  expect(md).toContain("**verhöhnen**");
});

test("scoping to one book narrows the file and names it", async () => {
  render(<VocabularyPage />);
  await openExportDialog();
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Books" }), "20");
  await userEvent.click(screen.getByRole("button", { name: /^download$/i }));

  const [filename, md] = mockDownload.mock.calls[0];
  expect(filename).toBe("vocabulary-faust.md");
  expect(md).toContain("**verhöhnen**");
  expect(md).not.toContain("**ephemeral**");
});

test("scoping to one language narrows the file and names it", async () => {
  render(<VocabularyPage />);
  await openExportDialog();
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "de");
  await userEvent.click(screen.getByRole("button", { name: /^download$/i }));

  const [filename, md] = mockDownload.mock.calls[0];
  expect(filename).toBe("vocabulary-de.md");
  expect(md).toContain("**verhöhnen**");
  expect(md).not.toContain("**ephemeral**");
});

test("Recent grouping drops the section headings", async () => {
  render(<VocabularyPage />);
  await openExportDialog();
  await userEvent.click(screen.getByRole("radio", { name: "Recent" }));
  await userEvent.click(screen.getByRole("button", { name: /^download$/i }));

  const md = mockDownload.mock.calls[0][1];
  expect(md).not.toContain("## ");
  expect(md.indexOf("**verhöhnen**")).toBeLessThan(md.indexOf("**ephemeral**"));
});

test("the dialog closes and the status line reports the download", async () => {
  render(<VocabularyPage />);
  await openExportDialog();
  await userEvent.click(screen.getByRole("button", { name: /^download$/i }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText(/Downloaded vocabulary\.md/i)).toBeInTheDocument();
});

test("Cancel leaves the dialog without downloading", async () => {
  render(<VocabularyPage />);
  await openExportDialog();
  await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mockDownload).not.toHaveBeenCalled();
});
