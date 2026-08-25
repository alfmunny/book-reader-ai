/**
 * Owner request (2026-08-25): a saved chat answer's "Saved" marker was a dead
 * end — add a link beside it that jumps to the exact saved insight on the
 * book's notes page (anchored per insight id), so the reader can move between
 * chat and notes.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "Mocked", provider: "gemini" }),
  askQuestion: jest.fn().mockResolvedValue({ answer: "Mocked", provider: "gemini" }),
  getChatMessages: jest.fn(),
  postChatMessage: jest.fn().mockResolvedValue({ id: 1, role: "assistant", content: "", created_at: "" }),
  getInsights: jest.fn().mockResolvedValue([]),
}));

import InsightChat from "@/components/InsightChat";

const QUESTION = "What is the wager?";
const ANSWER = "A bet over Faust's striving.";

const defaultProps = {
  bookId: "2229",
  userId: 1,
  hasGeminiKey: true,
  isVisible: true,
  chapterText: "Prolog im Himmel.",
  chapterTitle: "Prolog im Himmel",
  selectedText: "",
  bookTitle: "Faust",
  author: "Goethe",
  bookLanguage: "de",
};

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  const { getChatMessages, getInsights } = jest.requireMock("@/lib/api");
  getChatMessages.mockResolvedValue({
    messages: [
      { id: 2, role: "assistant", content: ANSWER, created_at: "" },
      { id: 1, role: "user", content: QUESTION, created_at: "" },
    ],
    has_more: false,
  });
  getInsights.mockResolvedValue([]);
});

test("a server-saved answer links to its anchored note on the notes page", async () => {
  const { getInsights } = jest.requireMock("@/lib/api");
  getInsights.mockResolvedValue([
    { id: 12, book_id: 2229, chapter_index: 2, question: QUESTION, answer: ANSWER, created_at: "" },
  ]);
  render(<InsightChat {...defaultProps} onSaveInsight={jest.fn()} />);
  await act(async () => {});

  const link = screen.getByRole("link", { name: /view note/i });
  expect(link).toHaveAttribute("href", "/notes/2229#insight-12");
});

test("a freshly saved answer gets its link from the save response", async () => {
  const onSaveInsight = jest.fn(() =>
    Promise.resolve({ id: 55, book_id: 2229, chapter_index: 2, question: QUESTION, answer: ANSWER, created_at: "" }),
  );
  render(<InsightChat {...defaultProps} onSaveInsight={onSaveInsight} />);
  await act(async () => {});

  expect(screen.queryByRole("link", { name: /view note/i })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save to notes" }));
  await waitFor(() =>
    expect(screen.getByRole("link", { name: /view note/i })).toHaveAttribute(
      "href",
      "/notes/2229#insight-55",
    ),
  );
});

test("an unsaved answer shows no note link", async () => {
  render(<InsightChat {...defaultProps} onSaveInsight={jest.fn()} />);
  await act(async () => {});
  expect(screen.queryByRole("link", { name: /view note/i })).toBeNull();
});
