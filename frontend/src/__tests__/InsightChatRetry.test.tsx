/**
 * Owner report (2026-08-25): failed chat requests need clear feedback and a
 * retry, like other AI chat frontends. The error bubble now carries a Retry
 * button that re-sends the failed question without duplicating the user's
 * message, and error bubbles are excluded from the conversation context sent
 * to the provider.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "Mocked", provider: "gemini" }),
  askQuestion: jest.fn(),
  getChatMessages: jest.fn().mockResolvedValue({ messages: [], has_more: false }),
  postChatMessage: jest.fn().mockResolvedValue({ id: 1, role: "assistant", content: "", created_at: "" }),
  getInsights: jest.fn().mockResolvedValue([]),
}));

import InsightChat from "@/components/InsightChat";

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

async function typeAndSend(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /send/i }));
  await act(async () => {});
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  const { getChatMessages, getInsights } = jest.requireMock("@/lib/api");
  getChatMessages.mockResolvedValue({ messages: [], has_more: false });
  getInsights.mockResolvedValue([]);
});

test("a failed request shows the error detail and a Retry button", async () => {
  const { askQuestion } = jest.requireMock("@/lib/api");
  askQuestion.mockRejectedValue(new Error("DeepSeek rate limit or quota exceeded — wait a moment and retry."));
  render(<InsightChat {...defaultProps} />);
  await act(async () => {});

  await typeAndSend("Why the wager?");

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/quota exceeded/);
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
});

test("Retry re-sends the same question without duplicating the user bubble", async () => {
  const { askQuestion } = jest.requireMock("@/lib/api");
  askQuestion
    .mockRejectedValueOnce(new Error("Gemini did not respond in time — retry in a moment."))
    .mockResolvedValueOnce({ answer: "The wager tests striving.", provider: "gemini" });
  render(<InsightChat {...defaultProps} />);
  await act(async () => {});

  await typeAndSend("Why the wager?");
  fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
  await waitFor(() => expect(screen.getByText("The wager tests striving.")).toBeInTheDocument());

  expect(askQuestion).toHaveBeenCalledTimes(2);
  expect(askQuestion.mock.calls[1][0]).toBe("Why the wager?");
  // The error bubble is gone, and the question appears exactly once.
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getAllByText("Why the wager?").length).toBe(1);
});

test("an empty answer becomes a retryable error, not a blank bubble", async () => {
  const { askQuestion } = jest.requireMock("@/lib/api");
  askQuestion.mockResolvedValue({ answer: "   ", provider: "gemini" });
  render(<InsightChat {...defaultProps} />);
  await act(async () => {});

  await typeAndSend("Why the wager?");

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/empty/i);
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
});

test("error bubbles are excluded from the conversation context sent to the AI", async () => {
  const { askQuestion } = jest.requireMock("@/lib/api");
  askQuestion
    .mockRejectedValueOnce(new Error("boom"))
    .mockResolvedValueOnce({ answer: "fine", provider: "gemini" });
  render(<InsightChat {...defaultProps} />);
  await act(async () => {});

  await typeAndSend("first question");
  await typeAndSend("second question");

  const passage = askQuestion.mock.calls[1][1] as string;
  expect(passage).not.toContain("Error:");
  expect(passage).not.toContain("boom");
});
