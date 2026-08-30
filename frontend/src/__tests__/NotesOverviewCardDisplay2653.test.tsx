/**
 * Regression test for #2653 — /notes book cards collapsed to slivers.
 *
 * PR #2452 turned the card <button> into a Next.js <Link> but kept the
 * button's class list. An <a> is inline by default, so `w-full` and the
 * vertical padding collapsed and the block-level children broke out of the
 * inline box. The card link must carry a block-level display utility.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token" }, status: "authenticated" }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getAllAnnotations: jest.fn(),
  getAllInsights: jest.fn(),
  getVocabulary: jest.fn(),
}));

import * as api from "@/lib/api";
import NotesPage from "@/app/(shell)/notes/page";
import type { AnnotationWithBook } from "@/lib/api";

const mockGetAllAnnotations = api.getAllAnnotations as jest.MockedFunction<typeof api.getAllAnnotations>;
const mockGetAllInsights = api.getAllInsights as jest.MockedFunction<typeof api.getAllInsights>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;

const BLOCK_LEVEL = ["block", "flex", "grid"];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
  mockGetAllAnnotations.mockResolvedValue([
    {
      id: 1, book_id: 42, chapter_index: 0,
      sentence_text: "A sentence.", note_text: "", color: "yellow",
      book_title: "Pride and Prejudice", created_at: "2026-01-01T00:00:00",
    } as AnnotationWithBook,
  ]);
});

test("book card link has a block-level display class so w-full applies", async () => {
  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("Pride and Prejudice")).toBeInTheDocument());

  const card = screen.getByRole("link", { name: /Pride and Prejudice/i });
  const classes = Array.from(card.classList);

  expect(classes).toContain("w-full");
  expect(classes.some((c) => BLOCK_LEVEL.includes(c))).toBe(true);
});
