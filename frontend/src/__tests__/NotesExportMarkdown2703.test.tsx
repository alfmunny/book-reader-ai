/**
 * /notes/[bookId] — the Export button offers a direct Markdown download
 * alongside the existing Obsidian vault flow (#2703).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "tok" }, status: "authenticated" }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ bookId: "10" }),
}));

jest.mock("@/lib/api", () => ({
  getBookChapters: jest.fn(),
  getAnnotations: jest.fn(),
  getInsights: jest.fn(),
  getVocabulary: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
  deleteInsight: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
}));

jest.mock("@/lib/download", () => ({
  downloadTextFile: jest.fn(),
  slugifyFilename: jest.requireActual("@/lib/download").slugifyFilename,
}));

import * as api from "@/lib/api";
import { downloadTextFile } from "@/lib/download";
import BookNotesPage from "@/app/notes/[bookId]/page";
import type { Annotation, BookInsight, BookMeta, BookChapter } from "@/lib/api";

const mockGetBookChapters = api.getBookChapters as jest.MockedFunction<typeof api.getBookChapters>;
const mockGetAnnotations = api.getAnnotations as jest.MockedFunction<typeof api.getAnnotations>;
const mockGetInsights = api.getInsights as jest.MockedFunction<typeof api.getInsights>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockExportObsidian = api.exportVocabularyToObsidian as jest.MockedFunction<typeof api.exportVocabularyToObsidian>;
const mockDownload = downloadTextFile as jest.MockedFunction<typeof downloadTextFile>;

const META: BookMeta = {
  id: 10, title: "Moby Dick", authors: ["Herman Melville"],
  languages: ["en"], subjects: [], download_count: 0, cover: null,
};
const CHAPTERS: BookChapter[] = [{ title: "Chapter 1", text: "" }, { title: "Chapter 2", text: "" }];
const ANNOTATION: Annotation = {
  id: 1, book_id: 10, chapter_index: 0,
  sentence_text: "Call me Ishmael.", note_text: "Famous opening.", color: "yellow",
};
const INSIGHT: BookInsight = {
  id: 1, book_id: 10, chapter_index: 0,
  question: "Who narrates?", answer: "Ishmael.", context_text: null, created_at: "2026-01-01T00:00:00",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBookChapters.mockResolvedValue({ book_id: 10, meta: META, chapters: CHAPTERS } as never);
  mockGetAnnotations.mockResolvedValue([ANNOTATION]);
  mockGetInsights.mockResolvedValue([INSIGHT]);
  mockGetVocabulary.mockResolvedValue([]);
});

async function openExportMenu() {
  await waitFor(() => expect(screen.getByText(/Call me Ishmael/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: /export/i }));
}

test("the Export button opens a menu instead of exporting to Obsidian straight away", async () => {
  render(<BookNotesPage />);
  await openExportMenu();

  expect(screen.getByRole("menuitem", { name: /download markdown/i })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /export to obsidian/i })).toBeInTheDocument();
  expect(mockExportObsidian).not.toHaveBeenCalled();
});

test("Download Markdown writes a .md file named after the book", async () => {
  render(<BookNotesPage />);
  await openExportMenu();
  await userEvent.click(screen.getByRole("menuitem", { name: /download markdown/i }));

  expect(mockDownload).toHaveBeenCalledTimes(1);
  expect(mockDownload.mock.calls[0][0]).toBe("moby-dick-notes.md");
});

test("the downloaded markdown carries annotations and insights", async () => {
  render(<BookNotesPage />);
  await openExportMenu();
  await userEvent.click(screen.getByRole("menuitem", { name: /download markdown/i }));

  const md = mockDownload.mock.calls[0][1];
  expect(md).toContain("# Moby Dick");
  expect(md).toContain("Call me Ishmael.");
  expect(md).toContain("Famous opening.");
  expect(md).toContain("Who narrates?");
  expect(md).toContain("Ishmael.");
});

test("the download follows the current view mode", async () => {
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText(/Call me Ishmael/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: /by chapter/i }));

  await userEvent.click(screen.getByRole("button", { name: /export/i }));
  await userEvent.click(screen.getByRole("menuitem", { name: /download markdown/i }));

  const md = mockDownload.mock.calls[0][1];
  expect(md).toContain("## Chapter 1");
  expect(md).not.toContain("## Annotations");
});

test("a successful download is reported in the status line, with no URL", async () => {
  render(<BookNotesPage />);
  await openExportMenu();
  await userEvent.click(screen.getByRole("menuitem", { name: /download markdown/i }));

  await waitFor(() => expect(screen.getByText(/Downloaded moby-dick-notes\.md/i)).toBeInTheDocument());
  expect(screen.queryByRole("link", { name: /https?:/ })).not.toBeInTheDocument();
});

test("Export to Obsidian still runs the vault flow for this book", async () => {
  mockExportObsidian.mockResolvedValue({ urls: ["https://github.com/example/1"] });
  render(<BookNotesPage />);
  await openExportMenu();
  await userEvent.click(screen.getByRole("menuitem", { name: /export to obsidian/i }));

  await waitFor(() => expect(mockExportObsidian).toHaveBeenCalledWith(10));
  expect(mockDownload).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByRole("link", { name: /github\.com\/example\/1/ })).toBeInTheDocument(),
  );
});

test("a book with nothing saved reports it instead of downloading an empty file", async () => {
  mockGetAnnotations.mockResolvedValue([]);
  mockGetInsights.mockResolvedValue([]);
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument());

  await userEvent.click(screen.getByRole("button", { name: /export/i }));
  await userEvent.click(screen.getByRole("menuitem", { name: /download markdown/i }));

  expect(mockDownload).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText(/Nothing to export yet/i)).toBeInTheDocument());
});
