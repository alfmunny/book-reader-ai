/**
 * InsightChat — branch coverage for remaining uncovered lines:
 *   196-206: loadEarlier — scrollHeight delta branch and "Load earlier" button
 *   254:     sendMessage — history branch (if (history) parts.push(...))
 *   262-264: chatFontSize toggle button (xs→sm and sm→xs)
 *   311:     language select onChange (setLang)
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import InsightChat from "@/components/InsightChat";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetInsight = jest.fn();
const mockAskQuestion = jest.fn();
const mockSaveSettings = jest.fn();

jest.mock("@/lib/api", () => ({
  getInsight: (...args: any[]) => mockGetInsight(...args),
  askQuestion: (...args: any[]) => mockAskQuestion(...args),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({ insightLang: "en", chatFontSize: "xs" }),
  saveSettings: (...args: any[]) => mockSaveSettings(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

const BASE = {
  bookId: "book-42",
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

// Build a localStorage history with many messages so loadedFrom > 0
const HISTORY_KEY = (userId: number | string, bookId: string) =>
  `chat-history:${userId}:${bookId}`;

function buildHistory(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Message ${i}`,
  }));
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockGetInsight.mockResolvedValue({ insight: "Insight." });
  mockAskQuestion.mockResolvedValue({ answer: "Answer." });
});

// ── Lines 196-206: loadEarlier ────────────────────────────────────────────────

describe("InsightChat — loadEarlier button (lines 196-206)", () => {
  it("renders 'Load earlier messages' button when history exceeds INITIAL_DISPLAY", async () => {
    // 35 messages > INITIAL_DISPLAY(30) → loadedFrom = 5, hasEarlier = true
    const history = buildHistory(35);
    localStorage.setItem(
      HISTORY_KEY(7, "book-42"),
      JSON.stringify(history)
    );

    render(<InsightChat {...BASE} />);
    await act(async () => await flushPromises());

    expect(
      screen.getByRole("button", { name: /Load earlier messages/i })
    ).toBeInTheDocument();
  });

  it("clicking 'Load earlier messages' decrements loadedFrom and hides button when at 0", async () => {
    // 35 messages → loadedFrom starts at 5
    // After one click (LOAD_BATCH=20) → Math.max(0, 5-20) = 0 → button disappears
    const history = buildHistory(35);
    localStorage.setItem(
      HISTORY_KEY(7, "book-42"),
      JSON.stringify(history)
    );

    render(<InsightChat {...BASE} />);
    await act(async () => await flushPromises());

    const loadBtn = screen.getByRole("button", { name: /Load earlier messages/i });
    expect(loadBtn).toBeInTheDocument();

    fireEvent.click(loadBtn);
    await act(async () => await flushPromises());

    // After click, loadedFrom = 0 → button gone
    expect(
      screen.queryByRole("button", { name: /Load earlier messages/i })
    ).not.toBeInTheDocument();
  });

  it("shows correct count in 'Load earlier' button text", async () => {
    // 50 messages → loadedFrom = 50 - 30 = 20
    const history = buildHistory(50);
    localStorage.setItem(
      HISTORY_KEY(7, "book-42"),
      JSON.stringify(history)
    );

    render(<InsightChat {...BASE} />);
    await act(async () => await flushPromises());

    // Button shows "20 more"
    const btn = screen.getByRole("button", { name: /Load earlier messages/i });
    expect(btn.textContent).toContain("20");
  });

  it("clicking 'Load earlier' multiple times eventually reaches 0", async () => {
    // 60 messages → loadedFrom = 30
    // Click 1: 30 - 20 = 10
    // Click 2: 10 - 20 = 0 (clamped) → button disappears
    const history = buildHistory(60);
    localStorage.setItem(
      HISTORY_KEY(7, "book-42"),
      JSON.stringify(history)
    );

    render(<InsightChat {...BASE} />);
    await act(async () => await flushPromises());

    // First click
    let loadBtn = screen.getByRole("button", { name: /Load earlier messages/i });
    fireEvent.click(loadBtn);
    await act(async () => await flushPromises());

    // Should still have the button (loadedFrom=10 > 0)
    loadBtn = screen.getByRole("button", { name: /Load earlier messages/i });
    expect(loadBtn).toBeInTheDocument();

    // Second click → loadedFrom = 0
    fireEvent.click(loadBtn);
    await act(async () => await flushPromises());

    expect(
      screen.queryByRole("button", { name: /Load earlier messages/i })
    ).not.toBeInTheDocument();
  });
});

// ── Line 254: sendMessage — history branch ────────────────────────────────────

describe("InsightChat — sendMessage with conversation history (line 254)", () => {
  it("includes conversation history in the passage when prior messages exist", async () => {
    // Pre-load some history so messagesRef.current has messages
    const history = [
      { role: "user", content: "Who is the main character?" },
      { role: "assistant", content: "Elizabeth Bennet is the protagonist." },
    ];
    localStorage.setItem(HISTORY_KEY(7, "book-42"), JSON.stringify(history));

    render(<InsightChat {...BASE} />);
    await act(async () => await flushPromises());

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "What is her personality like?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(mockAskQuestion).toHaveBeenCalledTimes(1));

    const passageArg: string = mockAskQuestion.mock.calls[0][1];
    // The history branch pushes "Conversation:\n..."
    expect(passageArg).toContain("Conversation:");
    expect(passageArg).toContain("Elizabeth Bennet is the protagonist.");
  });

  it("does not include conversation prefix when no prior messages", async () => {
    // No history in localStorage
    render(<InsightChat {...BASE} />);
    await act(async () => await flushPromises());

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "First question?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(mockAskQuestion).toHaveBeenCalledTimes(1));

    const passageArg: string = mockAskQuestion.mock.calls[0][1];
    expect(passageArg).not.toContain("Conversation:");
  });

  it("sendMessage ignores Shift+Enter (does not submit)", async () => {
    render(<InsightChat {...BASE} />);
    await act(async () => await flushPromises());

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "A question." } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    await act(async () => await flushPromises());

    // Should NOT have called askQuestion
    expect(mockAskQuestion).not.toHaveBeenCalled();
  });

  it("sendMessage does nothing when input is empty", async () => {
    render(<InsightChat {...BASE} />);
    await act(async () => await flushPromises());

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "  " } }); // whitespace only
    fireEvent.keyDown(input, { key: "Enter" });

    await act(async () => await flushPromises());

    expect(mockAskQuestion).not.toHaveBeenCalled();
  });
});

// ── Lines 262-264: chatFontSize toggle button ─────────────────────────────────

describe("InsightChat — chatFontSize toggle (lines 262-264)", () => {
  it("shows 'A' (uppercase) when chatFontSize is xs", () => {
    render(<InsightChat {...BASE} />);
    // Default is "xs" → button shows "A"
    const toggleBtn = screen.getByTitle(/Chat font size: xs/i);
    expect(toggleBtn.textContent).toBe("A");
  });

  it("toggles from xs to sm and shows 'a' (lowercase) after click", async () => {
    render(<InsightChat {...BASE} />);

    const toggleBtn = screen.getByTitle(/Chat font size: xs/i);
    expect(toggleBtn.textContent).toBe("A");

    fireEvent.click(toggleBtn);
    await act(async () => await flushPromises());

    // After toggle: chatFontSize = "sm" → button shows "a"
    const updatedBtn = screen.getByTitle(/Chat font size: sm/i);
    expect(updatedBtn.textContent).toBe("a");
  });

  it("calls saveSettings with chatFontSize when toggling", async () => {
    render(<InsightChat {...BASE} />);

    const toggleBtn = screen.getByTitle(/Chat font size: xs/i);
    fireEvent.click(toggleBtn);
    await act(async () => await flushPromises());

    expect(mockSaveSettings).toHaveBeenCalledWith({ chatFontSize: "sm" });
  });

  it("toggles back from sm to xs on second click", async () => {
    // Start with chatFontSize "sm" via re-clicking
    render(<InsightChat {...BASE} />);

    // First click: xs → sm
    fireEvent.click(screen.getByTitle(/Chat font size: xs/i));
    await act(async () => await flushPromises());

    // Second click: sm → xs
    fireEvent.click(screen.getByTitle(/Chat font size: sm/i));
    await act(async () => await flushPromises());

    // Back to xs → shows "A"
    expect(screen.getByTitle(/Chat font size: xs/i).textContent).toBe("A");
    expect(mockSaveSettings).toHaveBeenLastCalledWith({ chatFontSize: "xs" });
  });
});

// ── Line 311: language select onChange ───────────────────────────────────────

describe("InsightChat — language select onChange (line 311)", () => {
  it("updates language when user selects a different language", async () => {
    render(<InsightChat {...BASE} />);
    await act(async () => await flushPromises());

    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "de" } });
    await act(async () => await flushPromises());

    // The select value should now reflect "de"
    expect((select as HTMLSelectElement).value).toBe("de");
  });

  it("renders all language options in the select", () => {
    render(<InsightChat {...BASE} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(
      expect.arrayContaining(["en", "de", "fr", "es", "it", "zh", "ja"])
    );
  });
});

// ── userId null (anon) — history key with "anon" ──────────────────────────────

describe("InsightChat — userId null uses 'anon' key", () => {
  it("reads history from anon key when userId is null", async () => {
    const history = [
      { role: "user", content: "Anonymous question." },
      { role: "assistant", content: "Anonymous answer." },
    ];
    localStorage.setItem(
      "chat-history:anon:book-42",
      JSON.stringify(history)
    );

    render(<InsightChat {...BASE} userId={null} />);
    await act(async () => await flushPromises());

    expect(screen.getByText("Anonymous question.")).toBeInTheDocument();
    expect(screen.getByText("Anonymous answer.")).toBeInTheDocument();
  });
});

// ── Persist: bookId falsy → skip localStorage save ───────────────────────────

describe("InsightChat — persist effect skips when bookId empty", () => {
  it("renders without crash when bookId is empty string", async () => {
    render(
      <InsightChat
        {...BASE}
        bookId=""
        chapterText=""
        chapterTitle=""
        bookTitle=""
      />
    );
    await act(async () => await flushPromises());
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});

// ── Chapter header rendering branch ──────────────────────────────────────────

describe("InsightChat — chapter header divider rendering", () => {
  it("renders chapter header divider message from stored history", async () => {
    const history = [
      {
        role: "assistant",
        content: "Chapter I",
        isChapterHeader: true,
        chapterKey: "chapter-key-1",
      },
      { role: "assistant", content: "Some insight text." },
    ];
    localStorage.setItem(
      HISTORY_KEY(7, "book-42"),
      JSON.stringify(history)
    );

    render(<InsightChat {...BASE} />);
    await act(async () => await flushPromises());

    // The chapter header is rendered as a divider with the chapter title
    expect(screen.getByText("Chapter I")).toBeInTheDocument();
  });
});
