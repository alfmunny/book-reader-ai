/**
 * Owner request (2026-08-25): every chat message needs a Copy button, like
 * Gemini and other AI chat frontends — assistant answers, the reader's own
 * questions, and error bubbles alike.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "Mocked", provider: "gemini" }),
  askQuestion: jest.fn(),
  getChatMessages: jest.fn(),
  postChatMessage: jest.fn().mockResolvedValue({ id: 1, role: "assistant", content: "", created_at: "" }),
  getInsights: jest.fn().mockResolvedValue([]),
}));

import InsightChat from "@/components/InsightChat";

const QUESTION = "Why the wager?";
const ANSWER = "It tests whether striving can be corrupted.";

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

const writeText = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  writeText.mockClear().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
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

test("an assistant answer has a Copy button that copies its text", async () => {
  render(<InsightChat {...defaultProps} />);
  await act(async () => {});

  fireEvent.click(screen.getByRole("button", { name: "Copy answer" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(ANSWER));
  // Feedback state
  expect(await screen.findByText(/copied/i)).toBeInTheDocument();
});

test("the copy button exists even without a save handler", async () => {
  render(<InsightChat {...defaultProps} />);
  await act(async () => {});
  expect(screen.getByRole("button", { name: "Copy answer" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /save to notes/i })).toBeNull();
});

test("the reader's own message has a copy button too", async () => {
  render(<InsightChat {...defaultProps} />);
  await act(async () => {});

  fireEvent.click(screen.getByRole("button", { name: "Copy your message" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(QUESTION));
});

test("an error bubble gets a copy button alongside Retry", async () => {
  const { askQuestion, getChatMessages } = jest.requireMock("@/lib/api");
  getChatMessages.mockResolvedValue({ messages: [], has_more: false });
  askQuestion.mockRejectedValue(new Error("DeepSeek did not respond in time — retry in a moment."));
  render(<InsightChat {...defaultProps} />);
  await act(async () => {});

  fireEvent.change(screen.getByRole("textbox"), { target: { value: "test q" } });
  fireEvent.click(screen.getByRole("button", { name: /send/i }));
  await act(async () => {});

  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Copy error" }));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith("DeepSeek did not respond in time — retry in a moment."),
  );
});
