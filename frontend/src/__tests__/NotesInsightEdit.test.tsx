/**
 * Owner request (2026-08-26): insight questions must be editable on the notes
 * page (typo fixes for questions typed in the chat), annotation-style: pencil
 * → textarea → Save/Cancel. Only the question is editable — the answer is the
 * AI's recorded output.
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

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
  updateInsight: jest.fn(),
  deleteAnnotation: jest.fn(),
  deleteInsight: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
}));

import * as api from "@/lib/api";
import BookNotesPage from "@/app/(shell)/notes/[bookId]/page";

const mockUpdateInsight = api.updateInsight as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (api.getBookChapters as jest.Mock).mockResolvedValue({
    book_id: 10,
    meta: { id: 10, title: "Faust", authors: ["Goethe"], languages: ["de"], subjects: [], download_count: 0, cover: null },
    chapters: [{ title: "Prolog", text: "" }],
  });
  (api.getAnnotations as jest.Mock).mockResolvedValue([]);
  (api.getVocabulary as jest.Mock).mockResolvedValue([]);
  (api.getInsights as jest.Mock).mockResolvedValue([
    {
      id: 12, book_id: 10, chapter_index: 0,
      question: "What is the theem?", answer: "The theme is striving.",
      context_text: null, created_at: "2026-08-26T00:00:00",
    },
  ]);
});

test("editing an insight question saves via the API and updates the view", async () => {
  mockUpdateInsight.mockResolvedValue({
    id: 12, book_id: 10, chapter_index: 0,
    question: "What is the theme?", answer: "The theme is striving.",
    context_text: null, created_at: "2026-08-26T00:00:00",
  });
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText("What is the theem?")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /edit insight question/i }));
  const input = screen.getByLabelText("Edit question");
  fireEvent.change(input, { target: { value: "What is the theme?" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(mockUpdateInsight).toHaveBeenCalledWith(12, { question: "What is the theme?" }));
  await waitFor(() => expect(screen.getByText("What is the theme?")).toBeInTheDocument());
  expect(screen.queryByLabelText("Edit question")).toBeNull();
});

test("cancel leaves the question unchanged without an API call", async () => {
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText("What is the theem?")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /edit insight question/i }));
  fireEvent.change(screen.getByLabelText("Edit question"), { target: { value: "changed" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(mockUpdateInsight).not.toHaveBeenCalled();
  expect(screen.getByText("What is the theem?")).toBeInTheDocument();
});

test("a failed save shows an error and stays in edit mode", async () => {
  mockUpdateInsight.mockRejectedValue(new Error("boom"));
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText("What is the theem?")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /edit insight question/i }));
  fireEvent.change(screen.getByLabelText("Edit question"), { target: { value: "What is the theme?" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/couldn.t save/i);
  expect(screen.getByLabelText("Edit question")).toBeInTheDocument();
});
