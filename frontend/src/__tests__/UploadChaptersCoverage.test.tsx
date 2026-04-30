/**
 * Regression tests for missing branch coverage in
 * app/upload/[bookId]/chapters/page.tsx — closes #1977.
 *
 * Targets: handleTitleChange, handleRemove, handleConfirm (success + error),
 * chapter card click/keyboard selection, back/navigation buttons.
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

jest.mock("@/lib/api", () => ({
  getDraftChapters: (...args: unknown[]) => mockGetDraftChapters(...args),
  confirmChapters: (...args: unknown[]) => mockConfirmChapters(...args),
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

const TWO_CHAPTERS = {
  chapters: [
    { index: 0, title: "Chapter 1", word_count: 500, preview: "In the beginning..." },
    { index: 1, title: "Chapter 2", word_count: 350, preview: "The story continues..." },
  ],
};

const ONE_CHAPTER = {
  chapters: [
    { index: 0, title: "Chapter 1", word_count: 500, preview: "In the beginning..." },
  ],
};

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDraftChapters.mockResolvedValue(TWO_CHAPTERS);
  mockConfirmChapters.mockResolvedValue({});
});

// ── Back button navigation ────────────────────────────────────────────────────

test("back link points to /upload", async () => {
  render(<ChapterEditorPage />);
  await waitFor(() => screen.getByText("Chapter 1"));

  const backLink = screen.getByRole("link", { name: /back/i });
  expect(backLink).toHaveAttribute("href", "/upload");
});

// ── Try another file navigation (error state) ─────────────────────────────────

test("'Try another file' link points to /upload from error state", async () => {
  mockGetDraftChapters.mockRejectedValue(new Error("network failure"));
  render(<ChapterEditorPage />);
  await flushPromises();

  await screen.findByRole("alert");
  const tryAnotherLink = screen.getByRole("link", { name: /try another file/i });
  expect(tryAnotherLink).toHaveAttribute("href", "/upload");
});

// ── handleTitleChange ─────────────────────────────────────────────────────────

test("editing a chapter title input updates the title in the list", async () => {
  render(<ChapterEditorPage />);
  await waitFor(() => screen.getByText("Chapter 1"));

  const titleInput = screen.getByRole("textbox", { name: /chapter 1 title/i });
  await userEvent.clear(titleInput);
  await userEvent.type(titleInput, "Prologue");

  expect((titleInput as HTMLInputElement).value).toBe("Prologue");
});

// ── handleRemove ──────────────────────────────────────────────────────────────

test("clicking remove on a chapter removes it from the list", async () => {
  render(<ChapterEditorPage />);
  // Wait for both chapter title inputs to be rendered by display value
  await waitFor(() => screen.getByDisplayValue("Chapter 1"));
  await waitFor(() => screen.getByDisplayValue("Chapter 2"));

  // Remove chapter 1 — after removal, only "Chapter 2" remains
  await userEvent.click(screen.getByRole("button", { name: /remove chapter 1/i }));

  await waitFor(() => {
    expect(screen.queryByDisplayValue("Chapter 1")).not.toBeInTheDocument();
  });
  expect(screen.getByDisplayValue("Chapter 2")).toBeInTheDocument();
});

test("removing the selected chapter adjusts selection to within bounds", async () => {
  // Load only 1 chapter so removing it leaves selection at 0 (clamped)
  mockGetDraftChapters.mockResolvedValue(ONE_CHAPTER);
  render(<ChapterEditorPage />);
  await waitFor(() => screen.getByText("Chapter 1"));

  // Remove the only chapter — should not crash
  await userEvent.click(screen.getByRole("button", { name: /remove chapter 1/i }));

  // No chapter cards remain; confirm button should be disabled
  const confirmBtn = screen.getByRole("button", { name: /confirm & start reading/i });
  expect(confirmBtn).toBeDisabled();
});

// ── handleConfirm success ─────────────────────────────────────────────────────

test("clicking Confirm calls confirmChapters and redirects to reader", async () => {
  render(<ChapterEditorPage />);
  await waitFor(() => screen.getByText("Chapter 1"));

  await userEvent.click(screen.getByRole("button", { name: /confirm & start reading/i }));

  await waitFor(() => {
    expect(mockConfirmChapters).toHaveBeenCalledWith(
      42,
      expect.arrayContaining([
        expect.objectContaining({ title: "Chapter 1", original_index: 0 }),
        expect.objectContaining({ title: "Chapter 2", original_index: 1 }),
      ]),
    );
    expect(mockPush).toHaveBeenCalledWith("/reader/42");
  });
});

// ── handleConfirm error paths ─────────────────────────────────────────────────

test("confirm failure with ApiError shows the API error message inline", async () => {
  const { ApiError } = jest.requireMock("@/lib/api");
  mockConfirmChapters.mockRejectedValue(new ApiError(500, "Server overloaded"));

  render(<ChapterEditorPage />);
  await waitFor(() => screen.getByText("Chapter 1"));

  await userEvent.click(screen.getByRole("button", { name: /confirm & start reading/i }));

  await waitFor(() => {
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Server overloaded")).toBeInTheDocument();
  });
  // Should NOT navigate away
  expect(mockPush).not.toHaveBeenCalled();
});

test("confirm failure with generic Error shows fallback error message", async () => {
  mockConfirmChapters.mockRejectedValue(new Error("Something went wrong"));

  render(<ChapterEditorPage />);
  await waitFor(() => screen.getByText("Chapter 1"));

  await userEvent.click(screen.getByRole("button", { name: /confirm & start reading/i }));

  await waitFor(() => {
    expect(screen.getByText(/failed to confirm chapters/i)).toBeInTheDocument();
  });
  expect(mockPush).not.toHaveBeenCalled();
});

// ── Chapter card selection ────────────────────────────────────────────────────

test("clicking a chapter card selects it", async () => {
  render(<ChapterEditorPage />);
  await waitFor(() => screen.getByText("Chapter 1"));

  // Click chapter 2 card to select it
  const ch2Card = screen.getByRole("button", { name: /chapter 2:/i });
  await userEvent.click(ch2Card);

  // The card now has "(selected)" in its aria-label
  expect(screen.getByRole("button", { name: /chapter 2.*selected/i })).toBeInTheDocument();
});

test("pressing Enter on a chapter card selects it", async () => {
  render(<ChapterEditorPage />);
  await waitFor(() => screen.getByText("Chapter 1"));

  const ch2Card = screen.getByRole("button", { name: /chapter 2:/i });
  ch2Card.focus();
  await userEvent.keyboard("{Enter}");

  expect(screen.getByRole("button", { name: /chapter 2.*selected/i })).toBeInTheDocument();
});

test("pressing Space on a chapter card selects it", async () => {
  render(<ChapterEditorPage />);
  await waitFor(() => screen.getByText("Chapter 1"));

  const ch2Card = screen.getByRole("button", { name: /chapter 2:/i });
  ch2Card.focus();
  await userEvent.keyboard(" ");

  expect(screen.getByRole("button", { name: /chapter 2.*selected/i })).toBeInTheDocument();
});
