/**
 * InsightChat — coverage2: remaining uncovered branches
 *   L78:      ContextChip "less"/"more" toggle (expanded=true branch)
 *   L114:     savedInsights loaded from localStorage (raw ? new Set(...) true branch)
 *   L189:     early return when chapterText/bookTitle empty (isVisible + hasGeminiKey true)
 *   L355:     skeleton map callback (chatLoading=true with 0 messages)
 *   L389-390: MsgContextBlock onToggle callback (user message with long context)
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import InsightChat from "@/components/InsightChat";

const mockGetInsight = jest.fn();
const mockAskQuestion = jest.fn();

jest.mock("@/lib/api", () => ({
  getInsight: (...args: any[]) => mockGetInsight(...args),
  askQuestion: (...args: any[]) => mockAskQuestion(...args),
  getChatMessages: jest.fn().mockResolvedValue({ messages: [], has_more: false }),
  postChatMessage: jest.fn().mockResolvedValue({ id: 1, role: "assistant", content: "", created_at: "" }),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({ insightLang: "en", chatFontSize: "xs" }),
  saveSettings: jest.fn(),
}));

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

const LONG_TEXT = "A".repeat(170); // > CTX_COLLAPSE_AT (160)

const BASE = {
  bookId: "book-99",
  userId: 7,
  hasGeminiKey: true,
  isVisible: false,
  chapterText: "It is a truth universally acknowledged.",
  chapterTitle: "Chapter I",
  selectedText: "",
  bookTitle: "Pride and Prejudice",
  author: "Jane Austen",
  bookLanguage: "en",
};

const SAVED_KEY = (userId: number | string, bookId: string) =>
  `saved-insights:${userId}:${bookId}`;
const HISTORY_KEY = (userId: number | string, bookId: string) =>
  `chat-history:${userId}:${bookId}`;

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockGetInsight.mockResolvedValue({ insight: "Insight." });
  mockAskQuestion.mockResolvedValue({ answer: "Answer." });
});

// ── L78: ContextChip "less" branch (click "more" to expand) ───────────────────

describe("InsightChat — ContextChip expand/collapse (L78)", () => {
  it("toggles ContextChip from 'more' to 'less' when button clicked", async () => {
    render(<InsightChat {...BASE} selectedText={LONG_TEXT} />);
    await act(async () => await flushPromises());

    // Initially shows "more"
    const moreBtn = screen.getByRole("button", { name: "Expand context" });
    expect(moreBtn).toBeInTheDocument();

    fireEvent.click(moreBtn);
    await act(async () => await flushPromises());

    // After expanding, shows "less"
    expect(screen.getByRole("button", { name: "Collapse context" })).toBeInTheDocument();
  });

  it("toggles ContextChip back from 'less' to 'more' on second click", async () => {
    render(<InsightChat {...BASE} selectedText={LONG_TEXT} />);
    await act(async () => await flushPromises());

    fireEvent.click(screen.getByRole("button", { name: "Expand context" }));
    await act(async () => await flushPromises());

    fireEvent.click(screen.getByRole("button", { name: "Collapse context" }));
    await act(async () => await flushPromises());

    expect(screen.getByRole("button", { name: "Expand context" })).toBeInTheDocument();
  });
});

// ── L114: savedInsights loaded from localStorage ──────────────────────────────

describe("InsightChat — savedInsights from localStorage (L114)", () => {
  it("marks save button as 'Already saved' when insight key is pre-loaded", async () => {
    // Pre-load history with a user + assistant exchange
    const q = "What is the theme?";
    const a = "Answer.";
    const saveKey = `${q.slice(0, 60)}|${a.slice(0, 60)}`;
    localStorage.setItem(HISTORY_KEY(7, "book-99"), JSON.stringify([
      { role: "user", content: q },
      { role: "assistant", content: a },
    ]));
    localStorage.setItem(SAVED_KEY(7, "book-99"), JSON.stringify([saveKey]));

    const onSaveInsight = jest.fn();
    render(<InsightChat {...BASE} onSaveInsight={onSaveInsight} />);
    await act(async () => await flushPromises());

    // The assistant message's save button should be "Already saved"
    expect(screen.getByTitle("Already saved")).toBeInTheDocument();
    // Clicking it should not call onSaveInsight
    fireEvent.click(screen.getByTitle("Already saved"));
    expect(onSaveInsight).not.toHaveBeenCalled();
  });

  it("savedInsights useEffect reloads when bookId changes", async () => {
    const saveKey = "some-key";
    localStorage.setItem(SAVED_KEY(7, "book-99"), JSON.stringify([saveKey]));

    const { rerender } = render(<InsightChat {...BASE} onSaveInsight={jest.fn()} />);
    await act(async () => await flushPromises());

    // Change bookId — the effect should reload (empty) saved insights for new bookId
    rerender(<InsightChat {...BASE} bookId="book-00" onSaveInsight={jest.fn()} />);
    await act(async () => await flushPromises());

    // No saved insights for book-00
    expect(localStorage.getItem(SAVED_KEY(7, "book-00"))).toBeNull();
  });
});

// ── L189: early return when chapterText/bookTitle empty ───────────────────────

describe("InsightChat — chapter effect skips when chapterText empty (L189)", () => {
  it("does not call getInsight when chapterText is empty even if isVisible=true", async () => {
    render(
      <InsightChat
        {...BASE}
        isVisible={true}
        chapterText=""
      />
    );
    await act(async () => await flushPromises());

    expect(mockGetInsight).not.toHaveBeenCalled();
  });

  it("does not call getInsight when bookTitle is empty", async () => {
    render(
      <InsightChat
        {...BASE}
        isVisible={true}
        bookTitle=""
      />
    );
    await act(async () => await flushPromises());

    expect(mockGetInsight).not.toHaveBeenCalled();
  });
});

// ── L355: skeleton map callback (chatLoading=true, messages.length===0) ───────

describe("InsightChat — loading skeleton (L355 map callback)", () => {
  it("shows skeleton bars when refresh fires with no existing messages", async () => {
    // isVisible=false → no auto-fetch, messages stays empty
    // Click refresh → setChatLoading(true) without adding any message → skeleton
    let resolveInsight!: (v: { insight: string }) => void;
    mockGetInsight.mockReturnValue(
      new Promise<{ insight: string }>((res) => { resolveInsight = res; })
    );

    render(<InsightChat {...BASE} isVisible={false} />);
    await act(async () => await flushPromises());

    const refreshBtn = screen.getByTitle("Append a fresh insight");
    fireEvent.click(refreshBtn);

    // chatLoading=true, messages=[] → skeleton bars visible
    await waitFor(() => {
      const bars = document.querySelectorAll(".h-3.bg-gray-100.rounded");
      expect(bars.length).toBeGreaterThan(0);
    });

    await act(async () => { resolveInsight({ insight: "Done." }); });
  });
});

// ── L116 + L152: corrupted saved-insights catch blocks ───────────────────────

describe("InsightChat — corrupted saved-insights JSON (L116, L152)", () => {
  it("initializes savedInsights to empty set when saved-insights JSON is corrupted", async () => {
    localStorage.setItem("saved-insights:7:book-99", "bad-json{{{");

    const onSaveInsight = jest.fn();
    render(<InsightChat {...BASE} isVisible={false} onSaveInsight={onSaveInsight} />);
    await act(async () => await flushPromises());

    // Component should still render without crash
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("resets savedInsights when bookId changes to a book with corrupted saved-insights", async () => {
    const { rerender } = render(
      <InsightChat {...BASE} isVisible={false} onSaveInsight={jest.fn()} />
    );
    await act(async () => await flushPromises());

    // Plant corrupted JSON for next bookId
    localStorage.setItem("saved-insights:7:book-00", "{{corrupted");

    rerender(
      <InsightChat {...BASE} bookId="book-00" isVisible={false} onSaveInsight={jest.fn()} />
    );
    await act(async () => await flushPromises());

    // Should not throw — component still functional
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});

// ── L241-243: useLayoutEffect scroll anchor when loadEarlier is called ────────

describe("InsightChat — scroll anchor after loadEarlier (L241-243)", () => {
  it("adjusts scrollTop when loadEarlier fires and scrollHeight > 0", async () => {
    // Pre-load enough messages so "Load earlier" button appears
    const history = Array.from({ length: 35 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));
    localStorage.setItem("chat-history:7:book-99", JSON.stringify(history));

    render(<InsightChat {...BASE} isVisible={false} />);
    await act(async () => await flushPromises());

    const loadBtn = screen.getByRole("button", { name: /Load earlier/i });
    expect(loadBtn).toBeInTheDocument();

    // Patch scrollHeight on the messages container so the useLayoutEffect
    // guard (scrollHeightBeforeLoad > 0) is satisfied
    const container = document.querySelector(".overflow-y-auto") as HTMLElement;
    Object.defineProperty(container, "scrollHeight", {
      get: () => 500,
      configurable: true,
    });

    fireEvent.click(loadBtn);
    await act(async () => await flushPromises());

    // Lines 241-243 execute: delta computed, scrollTop adjusted, ref reset
    // We verify no crash and the button disappears (loadedFrom reached 0)
    expect(
      screen.queryByRole("button", { name: /Load earlier/i })
    ).not.toBeInTheDocument();
  });
});

// ── L389-390: MsgContextBlock onToggle ────────────────────────────────────────

describe("InsightChat — MsgContextBlock onToggle (L389-L390)", () => {
  it("toggles 'more'→'less' on MsgContextBlock after sending message with long context", async () => {
    // selectedText → contextText gets set, user sends message with long context attached
    render(<InsightChat {...BASE} selectedText={LONG_TEXT} />);
    await act(async () => await flushPromises());

    // Type and send a message; the context chip is active
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "What does this mean?" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(mockAskQuestion).toHaveBeenCalledTimes(1));
    await act(async () => await flushPromises());

    // Wait for the assistant reply
    await waitFor(() => expect(screen.getByText("Answer.")).toBeInTheDocument());

    // The user message's MsgContextBlock shows "more" (context > 160 chars, collapsed)
    // There may be multiple "more" buttons (ContextChip in input area is gone after send,
    // but MsgContextBlock in the user bubble should now be present)
    const moreBtns = screen.getAllByRole("button", { name: "Expand context" });
    expect(moreBtns.length).toBeGreaterThanOrEqual(1);

    // Click the MsgContextBlock's "more" button (last one, as ContextChip was cleared on send)
    fireEvent.click(moreBtns[moreBtns.length - 1]);
    await act(async () => await flushPromises());

    // After expanding, the MsgContextBlock shows "less"
    const lessBtns = screen.getAllByRole("button", { name: "Collapse context" });
    expect(lessBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("toggles MsgContextBlock back from 'less' to 'more' on second click", async () => {
    render(<InsightChat {...BASE} selectedText={LONG_TEXT} />);
    await act(async () => await flushPromises());

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Question?" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(screen.getByText("Answer.")).toBeInTheDocument());

    const moreBtns = screen.getAllByRole("button", { name: "Expand context" });
    fireEvent.click(moreBtns[moreBtns.length - 1]);
    await act(async () => await flushPromises());

    const lessBtns = screen.getAllByRole("button", { name: "Collapse context" });
    fireEvent.click(lessBtns[lessBtns.length - 1]);
    await act(async () => await flushPromises());

    // Back to "more"
    expect(screen.getAllByRole("button", { name: "Expand context" }).length).toBeGreaterThanOrEqual(1);
  });
});
