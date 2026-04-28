/**
 * Regression test for #1969: confirm button on upload/chapters page must not
 * contain a trailing "→" that screen readers announce as "right arrow".
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useParams: () => ({ bookId: "42" }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getDraftChapters: jest.fn().mockResolvedValue({
    chapters: [
      { index: 0, title: "Chapter 1", word_count: 300, preview: "It begins." },
    ],
  }),
  confirmChapters: jest.fn(),
  ApiError: class ApiError extends Error {},
}));

import ChapterEditorPage from "@/app/upload/[bookId]/chapters/page";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

test("confirm button text does not contain a trailing → arrow", async () => {
  render(<ChapterEditorPage />);
  await flushPromises();
  await screen.findByText("Chapter 1");

  const confirmBtn = screen.getByRole("button", { name: /Confirm & Start Reading/i });
  expect(confirmBtn).toBeInTheDocument();
  expect(confirmBtn.textContent).not.toContain("→");
});
