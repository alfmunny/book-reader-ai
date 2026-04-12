/**
 * Tests that InsightChat calls the onAIUsed callback whenever it makes
 * a live AI request (insight, Q&A, pronunciation, video search).
 * The callback is used by the parent to show the Gemini key reminder.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import InsightChat from "@/components/InsightChat";

// ── Mock all AI API calls ─────────────────────────────────────────────────────

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "Mocked insight" }),
  askQuestion: jest.fn().mockResolvedValue({ answer: "Mocked answer" }),
  checkPronunciation: jest.fn().mockResolvedValue({ feedback: "Mocked feedback" }),
  findVideos: jest.fn().mockResolvedValue({ query: "test query", videos: [] }),
}));

// ── Default props ─────────────────────────────────────────────────────────────

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InsightChat — onAIUsed callback", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it("calls onAIUsed when the chapter insight is automatically fetched", async () => {
    const onAIUsed = jest.fn();
    render(<InsightChat {...defaultProps} onAIUsed={onAIUsed} />);
    await waitFor(() => expect(onAIUsed).toHaveBeenCalledTimes(1));
  });

  it("calls onAIUsed when the user sends a chat message", async () => {
    const onAIUsed = jest.fn();
    render(<InsightChat {...defaultProps} isVisible={false} onAIUsed={onAIUsed} />);
    // isVisible=false so the auto-insight is suppressed — only the user message triggers it

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "What does this chapter mean?" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(onAIUsed).toHaveBeenCalledTimes(1));
  });

  it("does not call onAIUsed for an empty message", async () => {
    const onAIUsed = jest.fn();
    render(<InsightChat {...defaultProps} isVisible={false} onAIUsed={onAIUsed} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // Give it a moment to confirm nothing fires
    await act(async () => {});
    expect(onAIUsed).not.toHaveBeenCalled();
  });

  it("works without onAIUsed prop (does not throw)", async () => {
    expect(() =>
      render(<InsightChat {...defaultProps} />)
    ).not.toThrow();
    // Let the insight call complete
    await waitFor(() =>
      expect(require("@/lib/api").getInsight).toHaveBeenCalled()
    );
  });
});
