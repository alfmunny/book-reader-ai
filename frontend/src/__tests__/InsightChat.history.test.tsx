/**
 * InsightChat — localStorage history persistence, chapter deduplication,
 * message pagination, and max-message cap.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import InsightChat from "@/components/InsightChat";

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "Chapter insight." }),
  askQuestion: jest.fn().mockResolvedValue({ answer: "A fine answer." }),
  getChatMessages: jest.fn().mockResolvedValue({ messages: [], has_more: false }),
  postChatMessage: jest.fn().mockResolvedValue({ id: 1, role: "assistant", content: "", created_at: "" }),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({ insightLang: "en", chatFontSize: "xs" }),
  saveSettings: jest.fn(),
}));

const BASE = {
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

const HISTORY_KEY = (userId: number | string, bookId: string) =>
  `chat-history:${userId}:${bookId}`;

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe("InsightChat — history persistence", () => {
  it("saves messages to localStorage after receiving an insight (anonymous)", async () => {
    // Anonymous users (userId=null) persist to localStorage; authenticated users use server.
    render(<InsightChat {...BASE} userId={null} />);
    await waitFor(() => {
      const raw = localStorage.getItem(HISTORY_KEY("anon", "1342"));
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw!);
      expect(stored.some((m: any) => m.content === "Chapter insight.")).toBe(true);
    });
  });

  it("restores previous messages from localStorage on mount (authenticated via migration)", async () => {
    const existing = [
      { role: "assistant", content: "Old insight.", isChapterHeader: false },
    ];
    // Authenticated users: server returns empty → component migrates from localStorage
    localStorage.setItem(HISTORY_KEY(1, "1342"), JSON.stringify(existing));

    render(<InsightChat {...BASE} isVisible={false} />);
    await screen.findByText("Old insight.");
  });

  it("scopes history by userId so different users don't share chat", async () => {
    const user1History = [{ role: "assistant", content: "User 1 insight." }];
    localStorage.setItem(HISTORY_KEY(1, "1342"), JSON.stringify(user1History));

    render(<InsightChat {...BASE} userId={2} isVisible={false} />);
    // User 2 should NOT see user 1's messages
    expect(screen.queryByText("User 1 insight.")).not.toBeInTheDocument();
  });

  it("caps stored messages at 200 (MAX_STORED) for anonymous users", async () => {
    // Anonymous users (userId=null) persist to localStorage; cap applies there.
    const manyMessages = Array.from({ length: 210 }, (_, i) => ({
      role: "assistant",
      content: `msg-${i}`,
    }));
    localStorage.setItem(HISTORY_KEY("anon", "1342"), JSON.stringify(manyMessages));

    render(<InsightChat {...BASE} userId={null} isVisible={false} />);

    // Trigger a new message to force a save
    await act(async () => {
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "hello" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(HISTORY_KEY("anon", "1342"))!);
      expect(stored.length).toBeLessThanOrEqual(200);
    });
  });
});

describe("InsightChat — chapter deduplication", () => {
  it("does not fetch insight twice for the same chapter", async () => {
    const { getInsight } = require("@/lib/api");
    const { rerender } = render(<InsightChat {...BASE} />);
    await waitFor(() => expect(getInsight).toHaveBeenCalledTimes(1));

    // Re-render with same chapter (simulate sidebar close/reopen)
    rerender(<InsightChat {...BASE} isVisible={false} />);
    rerender(<InsightChat {...BASE} isVisible={true} />);

    await act(async () => {});
    // Still only one call
    expect(getInsight).toHaveBeenCalledTimes(1);
  });

  it("fetches insight again for a new chapter", async () => {
    const { getInsight } = require("@/lib/api");
    const { rerender } = render(<InsightChat {...BASE} />);
    await waitFor(() => expect(getInsight).toHaveBeenCalledTimes(1));

    rerender(
      <InsightChat
        {...BASE}
        chapterText="Mr. Bennet was among the earliest."
        chapterTitle="Chapter II"
      />
    );
    await waitFor(() => expect(getInsight).toHaveBeenCalledTimes(2));
  });

  it("restores visitedKeys from history so insight is not re-fetched after reload (anonymous)", async () => {
    // Anonymous users (userId=null): localStorage is read synchronously so visitedKeys
    // is populated before effect #3 runs and checks whether to call getInsight.
    const { getInsight } = require("@/lib/api");
    const chapterKey = BASE.chapterText.slice(0, 100);
    const history = [
      { role: "assistant", content: "Chapter I", isChapterHeader: true, chapterKey },
      { role: "assistant", content: "Saved insight." },
    ];
    localStorage.setItem(HISTORY_KEY("anon", "1342"), JSON.stringify(history));

    render(<InsightChat {...BASE} userId={null} />);
    await act(async () => {});
    // visitedKeys was populated from history → no new API call
    expect(getInsight).not.toHaveBeenCalled();
  });
});

describe("InsightChat — pagination", () => {
  it("shows 'Load earlier' button when history has more than 30 messages (anonymous)", async () => {
    // Anonymous path: localStorage is read synchronously so pagination state is set on mount.
    const manyMessages = Array.from({ length: 35 }, (_, i) => ({
      role: "assistant" as const,
      content: `msg-${i}`,
    }));
    localStorage.setItem(HISTORY_KEY("anon", "1342"), JSON.stringify(manyMessages));

    render(<InsightChat {...BASE} userId={null} isVisible={false} />);
    await waitFor(() => expect(screen.getByText(/Load earlier/)).toBeInTheDocument());
  });

  it("does not show 'Load earlier' when fewer than 30 messages (anonymous)", async () => {
    const fewMessages = Array.from({ length: 5 }, (_, i) => ({
      role: "assistant" as const,
      content: `msg-${i}`,
    }));
    localStorage.setItem(HISTORY_KEY("anon", "1342"), JSON.stringify(fewMessages));

    render(<InsightChat {...BASE} userId={null} isVisible={false} />);
    await act(async () => {});
    expect(screen.queryByText(/Load earlier/)).not.toBeInTheDocument();
  });
});

describe("InsightChat — hasGeminiKey=false", () => {
  it("does not fetch insight and does not call onAIUsed", async () => {
    const { getInsight } = require("@/lib/api");
    const onAIUsed = jest.fn();
    render(<InsightChat {...BASE} hasGeminiKey={false} onAIUsed={onAIUsed} />);
    await act(async () => {});
    expect(getInsight).not.toHaveBeenCalled();
    expect(onAIUsed).not.toHaveBeenCalled();
  });

  it("disables the textarea when hasGeminiKey is false", () => {
    render(<InsightChat {...BASE} hasGeminiKey={false} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
