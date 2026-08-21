/**
 * Opening the chat must not fire an AI request on its own (owner feedback,
 * 2026-08-20): the automatic chapter insight is removed. Instead, suggestion
 * chips let the reader explicitly send a request with one tap.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import InsightChat from "@/components/InsightChat";

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "Mocked insight", provider: "gemini" }),
  askQuestion: jest.fn().mockResolvedValue({ answer: "Mocked answer", provider: "gemini" }),
  checkPronunciation: jest.fn().mockResolvedValue({ feedback: "Mocked feedback" }),
  findVideos: jest.fn().mockResolvedValue({ query: "test query", videos: [] }),
  getChatMessages: jest.fn().mockResolvedValue({ messages: [], has_more: false }),
  postChatMessage: jest.fn().mockResolvedValue({ id: 1, role: "assistant", content: "", created_at: "" }),
}));

const defaultProps = {
  bookId: "1342",
  userId: 1,
  hasGeminiKey: true,
  isVisible: true,
  chapterText: "It is a truth universally acknowledged.",
  chapterTitle: "Chapter I",
  selectedText: "",
  bookTitle: "Pride and Prejudice",
  author: "Jane Austen",
  bookLanguage: "en",
};

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test("opening the chat does not fire any AI request", async () => {
  const { getInsight, askQuestion } = jest.requireMock("@/lib/api");
  const onAIUsed = jest.fn();
  render(<InsightChat {...defaultProps} onAIUsed={onAIUsed} />);
  await act(async () => {});

  expect(getInsight).not.toHaveBeenCalled();
  expect(askQuestion).not.toHaveBeenCalled();
  expect(onAIUsed).not.toHaveBeenCalled();
});

test("the chapter header still marks the chapter without an AI call", async () => {
  // Mount hidden first so the async history load settles, then open the chat
  // — mirrors real usage (the sidebar starts closed).
  const { rerender } = render(<InsightChat {...defaultProps} isVisible={false} />);
  await act(async () => {});
  rerender(<InsightChat {...defaultProps} isVisible={true} />);
  expect(screen.getByText("Chapter I")).toBeInTheDocument();
});

test("suggestion chips render and clicking one sends that request", async () => {
  const { askQuestion } = jest.requireMock("@/lib/api");
  render(<InsightChat {...defaultProps} />);
  await act(async () => {}); // let the async history load settle first

  const chips = screen.getByRole("group", { name: "Suggested questions" });
  expect(chips).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Summarize this chapter" }));

  await waitFor(() =>
    expect(askQuestion).toHaveBeenCalledWith(
      "Summarize this chapter",
      expect.any(String),
      "Pride and Prejudice",
      "Jane Austen",
      expect.any(String),
      expect.any(String),
    ),
  );
  // The tapped suggestion appears as the user's message in the thread
  // (chip button + user bubble both carry the text).
  await waitFor(() =>
    expect(screen.getAllByText("Summarize this chapter").length).toBeGreaterThanOrEqual(2),
  );
});

test("chips are hidden while the reader is typing", () => {
  render(<InsightChat {...defaultProps} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "my own question" } });
  expect(screen.queryByRole("group", { name: "Suggested questions" })).toBeNull();
});

test("chips are hidden when no provider key is configured", () => {
  render(<InsightChat {...defaultProps} hasGeminiKey={false} />);
  expect(screen.queryByRole("group", { name: "Suggested questions" })).toBeNull();
});

test("the manual refresh button still fetches an insight on demand", async () => {
  const { getInsight } = jest.requireMock("@/lib/api");
  render(<InsightChat {...defaultProps} />);

  fireEvent.click(screen.getByRole("button", { name: "Append a fresh insight" }));
  await waitFor(() => expect(getInsight).toHaveBeenCalledTimes(1));
});

describe("InsightChat — dismissible suggestions", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it("hides the chips via the close button and shows them again via the link", () => {
    const { getSettings } = jest.requireActual("@/lib/settings");
    render(<InsightChat {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Hide suggestions" }));
    expect(screen.queryByRole("group", { name: "Suggested questions" })).toBeNull();
    expect(getSettings().chatSuggestionsHidden).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Show suggestions" }));
    expect(screen.getByRole("group", { name: "Suggested questions" })).toBeInTheDocument();
    expect(getSettings().chatSuggestionsHidden).toBe(false);
  });

  it("keeps the chips hidden on remount when dismissed", () => {
    const { unmount } = render(<InsightChat {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide suggestions" }));
    unmount();

    render(<InsightChat {...defaultProps} />);
    expect(screen.queryByRole("group", { name: "Suggested questions" })).toBeNull();
    expect(screen.getByRole("button", { name: "Show suggestions" })).toBeInTheDocument();
  });
});
