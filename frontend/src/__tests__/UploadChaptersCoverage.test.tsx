/**
 * The chapters page is a shell around ChapterAuditPanel: load the draft, wire the
 * save callbacks, finish by persisting the structure and confirming.
 *
 * The editing behaviours it used to own — title changes, removal, chapter
 * selection — moved into the panel and are covered by ChapterAuditPanel.test.tsx.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useParams: () => ({ bookId: "42" }),
  useRouter: () => ({ push: mockPush }),
}));

const mockGetDraftChapters = jest.fn();
const mockConfirmChapters = jest.fn();
const mockSaveMeta = jest.fn();
const mockSaveStructure = jest.fn();

jest.mock("@/lib/api", () => ({
  getDraftChapters: (...a: unknown[]) => mockGetDraftChapters(...a),
  confirmChapters: (...a: unknown[]) => mockConfirmChapters(...a),
  saveDraftChapterMeta: (...a: unknown[]) => mockSaveMeta(...a),
  saveDraftChapterStructure: (...a: unknown[]) => mockSaveStructure(...a),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "ApiError";
    }
  },
}));

import ChapterEditorPage from "@/app/upload/[bookId]/chapters/page";

const DRAFT = {
  chapters: [
    { index: 0, chapter_index: 0, title: "Chapter 1", text: "a\n\nb", preview: "a", word_count: 5, reviewed: true },
    { index: 1, chapter_index: 1, title: "Chapter 2", text: "c\n\nd", preview: "c", word_count: 5, reviewed: true },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDraftChapters.mockResolvedValue(DRAFT);
  mockConfirmChapters.mockResolvedValue({});
  mockSaveMeta.mockResolvedValue({});
  mockSaveStructure.mockResolvedValue({});
});

test("loads the draft and renders the audit panel", async () => {
  render(<ChapterEditorPage />);
  expect(await screen.findByRole("heading", { name: /review chapters/i })).toBeInTheDocument();
  expect(mockGetDraftChapters).toHaveBeenCalledWith(42);
});

test("says the work is saved as you go", async () => {
  render(<ChapterEditorPage />);
  expect(await screen.findByText(/saved as you go/i)).toBeInTheDocument();
});

test("back link goes to the bookshelf, where the draft is listed", async () => {
  render(<ChapterEditorPage />);
  const link = await screen.findByRole("link", { name: /bookshelf/i });
  expect(link).toHaveAttribute("href", "/bookshelf");
});

test("shows an error with a retry when the draft cannot be loaded", async () => {
  const { ApiError } = jest.requireMock("@/lib/api");
  mockGetDraftChapters.mockRejectedValue(new ApiError(500, "boom"));
  render(<ChapterEditorPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("boom");

  mockGetDraftChapters.mockResolvedValue(DRAFT);
  await userEvent.click(screen.getByRole("button", { name: /retry/i }));
  expect(await screen.findByRole("heading", { name: /review chapters/i })).toBeInTheDocument();
});

test("finishing saves the structure before confirming", async () => {
  const user = userEvent.setup();
  render(<ChapterEditorPage />);
  await screen.findByRole("heading", { name: /review chapters/i });

  await user.click(screen.getByRole("button", { name: /add to shelf/i }));

  // confirm reads the draft rows, so an unsaved split would be dropped en route.
  await waitFor(() => expect(mockSaveStructure).toHaveBeenCalled());
  await waitFor(() => expect(mockConfirmChapters).toHaveBeenCalledWith(42, [
    { title: "Chapter 1", original_index: 0 },
    { title: "Chapter 2", original_index: 1 },
  ]));
});

test("finishing sends the reader to the book", async () => {
  const user = userEvent.setup();
  render(<ChapterEditorPage />);
  await screen.findByRole("heading", { name: /review chapters/i });

  await user.click(screen.getByRole("button", { name: /add to shelf/i }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/reader/42"));
});

test("a failed finish explains itself and keeps you on the page", async () => {
  const { ApiError } = jest.requireMock("@/lib/api");
  mockConfirmChapters.mockRejectedValue(new ApiError(400, "chapters list cannot be empty"));
  const user = userEvent.setup();
  render(<ChapterEditorPage />);
  await screen.findByRole("heading", { name: /review chapters/i });

  await user.click(screen.getByRole("button", { name: /add to shelf/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent("chapters list cannot be empty");
  expect(mockPush).not.toHaveBeenCalled();
});

test("falls back to the preview when the server sends no full text", async () => {
  mockGetDraftChapters.mockResolvedValue({
    chapters: [{ index: 0, title: "Only", preview: "just a preview", word_count: 3 }],
  });
  render(<ChapterEditorPage />);
  expect(await screen.findByText("just a preview")).toBeInTheDocument();
});
