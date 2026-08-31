/**
 * Regression test for #1942: upload chapters error state must have an
 * AlertCircleIcon + a "Retry" button that re-fetches in place, keeping
 * "Try another file" as a secondary CTA.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/navigation", () => ({
  useParams: () => ({ bookId: "42" }),
  useRouter: () => ({ push: jest.fn() }),
}));

const mockGetFrozenSplit = jest.fn();
const mockSaveFrozenSplit = jest.fn();

jest.mock("@/lib/api", () => ({
  // A confirmed book has no drafts; the page reopens its frozen split instead.
  getFrozenSplit: (...a: unknown[]) => mockGetFrozenSplit(...a),
  saveFrozenSplit: (...a: unknown[]) => mockSaveFrozenSplit(...a),
  getDraftChapters: jest.fn(),
  getBookMeta: jest.fn().mockResolvedValue({ id: 7, title: "T" }),
  updateBookMeta: jest.fn(),
  confirmChapters: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

import * as api from "@/lib/api";
import ChapterEditorPage from "@/app/(shell)/upload/[bookId]/chapters/page";

const mockGetDraftChapters = api.getDraftChapters as jest.MockedFunction<
  typeof api.getDraftChapters
>;

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFrozenSplit.mockRejectedValue(new Error("no frozen split"));
  mockSaveFrozenSplit.mockResolvedValue({ ok: true });
});

const CHAPTERS = {
  chapters: [
    { index: 0, title: "Chapter 1", word_count: 500, preview: "In the beginning..." },
  ],
};

test("error state shows AlertCircleIcon, headline, sub-text, Retry and Try-another-file buttons", async () => {
  mockGetDraftChapters.mockRejectedValue(new Error("network error"));
  render(<ChapterEditorPage />);
  await flushPromises();

  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByText(/Could not load chapters/i)).toBeInTheDocument();

  // Primary Retry button
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();

  // Secondary navigation link
  expect(screen.getByRole("link", { name: /try another file/i })).toBeInTheDocument();
});

test("Retry button re-fetches chapters successfully without navigation", async () => {
  mockGetDraftChapters
    .mockRejectedValueOnce(new Error("network error"))
    .mockResolvedValueOnce(CHAPTERS);

  render(<ChapterEditorPage />);
  await flushPromises();

  const retryBtn = await screen.findByRole("button", { name: /retry/i });
  const user = userEvent.setup();
  await user.click(retryBtn);

  await waitFor(() => {
    expect(screen.getByText("Chapter 1")).toBeInTheDocument();
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("error state is gone after successful retry — alert cleared", async () => {
  mockGetDraftChapters
    .mockRejectedValueOnce(new Error("boom"))
    .mockResolvedValueOnce(CHAPTERS);

  render(<ChapterEditorPage />);
  await flushPromises();

  await screen.findByRole("alert");

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /retry/i }));

  await waitFor(() => {
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
