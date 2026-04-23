/**
 * Regression tests for issue #610 — annotation action buttons below 44px touch target.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

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

import * as api from "@/lib/api";
import BookNotesPage from "@/app/notes/[bookId]/page";
import type { Annotation, BookInsight, VocabularyWord } from "@/lib/api";

const mockGetBookChapters = api.getBookChapters as jest.MockedFunction<typeof api.getBookChapters>;
const mockGetAnnotations = api.getAnnotations as jest.MockedFunction<typeof api.getAnnotations>;
const mockGetInsights = api.getInsights as jest.MockedFunction<typeof api.getInsights>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;

const CHAPTERS_RESP = {
  book_id: 10,
  meta: { id: 10, title: "Moby Dick", authors: ["Herman Melville"], languages: ["en"], subjects: [], download_count: 0, cover: null },
  chapters: [{ title: "Chapter 1", text: "" }],
};

const ANNOTATION: Annotation = {
  id: 1, book_id: 10, chapter_index: 0,
  sentence_text: "Call me Ishmael.", note_text: "Famous opening.", color: "yellow",
};

beforeEach(() => {
  mockGetBookChapters.mockResolvedValue(CHAPTERS_RESP as never);
  mockGetAnnotations.mockResolvedValue([ANNOTATION]);
  mockGetInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
});

afterEach(() => jest.clearAllMocks());

test("Edit note button has min-h-[44px] touch target", async () => {
  render(<BookNotesPage />);
  await waitFor(() => screen.getByLabelText("Edit note"));
  const btn = screen.getByLabelText("Edit note");
  expect(btn.className).toContain("min-h-[44px]");
});

test("Delete annotation button has min-h-[44px] touch target", async () => {
  render(<BookNotesPage />);
  await waitFor(() => screen.getByLabelText("Delete annotation"));
  const btn = screen.getByLabelText("Delete annotation");
  expect(btn.className).toContain("min-h-[44px]");
});

test("Save button in edit mode has min-h-[44px] touch target", async () => {
  render(<BookNotesPage />);
  await waitFor(() => screen.getByLabelText("Edit note"));

  // click edit to enter editing mode
  const editBtn = screen.getByLabelText("Edit note");
  editBtn.click();

  await waitFor(() => screen.getByRole("button", { name: "Save" }));
  const saveBtn = screen.getByRole("button", { name: "Save" });
  expect(saveBtn.className).toContain("min-h-[44px]");
});

test("Cancel button in edit mode has min-h-[44px] touch target", async () => {
  render(<BookNotesPage />);
  await waitFor(() => screen.getByLabelText("Edit note"));

  const editBtn = screen.getByLabelText("Edit note");
  editBtn.click();

  await waitFor(() => screen.getByRole("button", { name: "Cancel" }));
  const cancelBtn = screen.getByRole("button", { name: "Cancel" });
  expect(cancelBtn.className).toContain("min-h-[44px]");
});
