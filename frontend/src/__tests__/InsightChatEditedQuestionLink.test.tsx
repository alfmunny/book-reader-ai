/**
 * Owner requirement (2026-08-26): editing an insight's question on the notes
 * page must NOT break the chat's Saved marker or its "View note" jump link.
 * The chat matches saved insights by question+answer; after a question edit
 * the full key no longer matches, so the chat falls back to matching by
 * answer alone (the answer is immutable).
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "Mocked", provider: "gemini" }),
  askQuestion: jest.fn(),
  getChatMessages: jest.fn(),
  postChatMessage: jest.fn().mockResolvedValue({ id: 1, role: "assistant", content: "", created_at: "" }),
  getInsights: jest.fn().mockResolvedValue([]),
}));

import InsightChat from "@/components/InsightChat";

const CHAT_QUESTION = "What is the theem?"; // as typed in the chat (typo)
const ANSWER = "The theme is striving and error.";

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
      { id: 1, role: "user", content: CHAT_QUESTION, created_at: "" },
    ],
    has_more: false,
  });
  // The insight's question was edited on the notes page (typo fixed) —
  // it no longer equals the chat message, but the answer is identical.
  getInsights.mockResolvedValue([
    {
      id: 12, book_id: 2229, chapter_index: 2,
      question: "What is the theme?", answer: ANSWER, created_at: "",
    },
  ]);
});

test("an edited question keeps the Saved marker via answer-only matching", async () => {
  render(<InsightChat {...defaultProps} onSaveInsight={jest.fn()} />);
  await act(async () => {});

  expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
});

test("the View note link still jumps to the edited insight", async () => {
  render(<InsightChat {...defaultProps} onSaveInsight={jest.fn()} />);
  await act(async () => {});

  expect(screen.getByRole("link", { name: /view note/i })).toHaveAttribute(
    "href",
    "/notes/2229#insight-12",
  );
});
