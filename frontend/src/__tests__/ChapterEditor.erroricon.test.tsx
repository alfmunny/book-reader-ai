/**
 * Regression test for #1955: chapter-editor inline confirm-error banner
 * must include AlertCircleIcon (SVG) when confirmChapters fails.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/navigation", () => ({
  useParams: () => ({ bookId: "42" }),
  useRouter: () => ({ push: jest.fn() }),
}));

const mockGetDraftChapters = jest.fn();
const mockConfirmChapters = jest.fn();

jest.mock("@/lib/api", () => ({
  getDraftChapters: (...args: unknown[]) => mockGetDraftChapters(...args),
  confirmChapters: (...args: unknown[]) => mockConfirmChapters(...args),
  ApiError: class ApiError extends Error {
    constructor(message: string) { super(message); this.name = "ApiError"; }
  },
}));

import ChapterEditorPage from "@/app/upload/[bookId]/chapters/page";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const CHAPTERS = {
  chapters: [{ index: 0, title: "Chapter 1", word_count: 500, preview: "In the beginning..." }],
};

beforeEach(() => {
  jest.resetAllMocks();
});

test("inline confirm-error alert contains SVG icon (AlertCircleIcon)", async () => {
  mockGetDraftChapters.mockResolvedValue(CHAPTERS);
  mockConfirmChapters.mockRejectedValue(new Error("server error"));

  render(<ChapterEditorPage />);
  await flushPromises();

  await screen.findByText("Chapter 1");

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /confirm.*start reading/i }));
  await flushPromises();

  await waitFor(() => {
    const alert = screen.getByRole("alert");
    const svg = alert.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
