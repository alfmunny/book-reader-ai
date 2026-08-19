/**
 * InsightChat — AI provider selector. The reader can pick which provider
 * (Auto / Gemini / Claude / DeepSeek) answers chat questions; the choice is
 * passed to askQuestion and persisted in settings.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InsightChat from "@/components/InsightChat";
import { getSettings } from "@/lib/settings";

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "Mocked insight" }),
  askQuestion: jest.fn().mockResolvedValue({ answer: "Mocked answer", provider: "claude" }),
  checkPronunciation: jest.fn().mockResolvedValue({ feedback: "Mocked feedback" }),
  findVideos: jest.fn().mockResolvedValue({ query: "test query", videos: [] }),
  getChatMessages: jest.fn().mockResolvedValue({ messages: [], has_more: false }),
  postChatMessage: jest.fn().mockResolvedValue({ id: 1, role: "assistant", content: "", created_at: "" }),
}));

const defaultProps = {
  bookId: "1342",
  userId: 1,
  hasGeminiKey: true,
  isVisible: false, // suppress the auto-insight
  chapterText: "It is a truth universally acknowledged.",
  chapterTitle: "Chapter I",
  selectedText: "",
  bookTitle: "Pride and Prejudice",
  author: "Jane Austen",
  bookLanguage: "en",
};

describe("InsightChat — provider selector", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it("renders the provider select with all four options, defaulting to auto", () => {
    render(<InsightChat {...defaultProps} />);
    const select = screen.getByLabelText("Chat AI provider") as HTMLSelectElement;
    expect(select.value).toBe("auto");
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(["auto", "gemini", "claude", "deepseek"]);
  });

  it("passes the selected provider to askQuestion", async () => {
    const { askQuestion } = jest.requireMock("@/lib/api");
    render(<InsightChat {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Chat AI provider"), { target: { value: "claude" } });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Who is Darcy?" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() =>
      expect(askQuestion).toHaveBeenCalledWith(
        "Who is Darcy?",
        expect.any(String),
        "Pride and Prejudice",
        "Jane Austen",
        expect.any(String),
        "claude",
      ),
    );
  });

  it("persists the provider choice to settings and restores it on remount", () => {
    const { unmount } = render(<InsightChat {...defaultProps} />);
    fireEvent.change(screen.getByLabelText("Chat AI provider"), { target: { value: "deepseek" } });
    expect(getSettings().chatProvider).toBe("deepseek");
    unmount();

    render(<InsightChat {...defaultProps} />);
    expect((screen.getByLabelText("Chat AI provider") as HTMLSelectElement).value).toBe("deepseek");
  });
});
