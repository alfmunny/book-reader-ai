/**
 * Regression (owner report, 2026-08-24): saved insight answers on the notes
 * page rendered as one raw paragraph with visible markdown markers (##, **),
 * while the same answer renders formatted in the insight chat. The notes page
 * must render answers through the same markdown pipeline as the chat.
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

const ANSWER = "## The wager\n\nA bet over **striving** and error.";

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
      id: 1, book_id: 10, chapter_index: 0,
      question: "What is the wager?", answer: ANSWER,
      context_text: null, created_at: "2026-08-24T00:00:00",
    },
  ]);
});

test("insight answers render through the markdown pipeline, not as raw text", async () => {
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText("What is the wager?")).toBeInTheDocument());

  // The answer must live inside the shared markdown wrapper (prose styles).
  // The jest ReactMarkdown stub renders children as-is, so assert on the
  // wrapper rather than the converted HTML.
  const md = screen.getByTestId("insight-markdown");
  expect(md).toHaveTextContent("The wager");
  expect(md.className).toContain("prose");
});

test("each insight card carries an id anchor so chat links can jump to it", async () => {
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText("What is the wager?")).toBeInTheDocument());
  // The chat's "View note" link targets /notes/<bookId>#insight-<id>; the
  // page's existing hash-scroll effect needs this element id to land on it.
  expect(document.getElementById("insight-1")).not.toBeNull();
});
