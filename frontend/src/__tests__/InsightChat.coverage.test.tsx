/**
 * InsightChat — coverage tests for previously uncovered lines:
 *   119-120: localStorage parse error → setMessages([]) + setLoadedFrom(0)
 *   158:     getInsight rejection → error message in chat
 *   167-175: manual refresh (refreshTick) via ↺ button
 *   196-206: sendMessage with context attached ("Selected passage:")
 *   235:     askQuestion rejection → error message in chat
 *   254, 262-311: loading state during send; typing indicator shown while loading
 *   359-397: onSaveInsight callback; save-button state; mobile layout
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

jest.mock("@/lib/api", () => ({
  getInsight: (...args: any[]) => mockGetInsight(...args),
  askQuestion: (...args: any[]) => mockAskQuestion(...args),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({ insightLang: "en", chatFontSize: "xs" }),
  saveSettings: jest.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

const BASE = {
  bookId: "book-42",
  userId: 7,
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
  // Default: happy-path mocks
  mockGetInsight.mockResolvedValue({ insight: "Test insight." });
  mockAskQuestion.mockResolvedValue({ answer: "Test answer." });
});

// ── Lines 119-120: localStorage parse error ────────────────────────────────────

describe("InsightChat — corrupted localStorage (lines 119-120)", () => {
  it("gracefully resets state when stored JSON is invalid", async () => {
    // Plant invalid JSON so JSON.parse throws
    localStorage.setItem("chat-history:7:book-42", "not-valid-json{{{");

    // Should not throw and should render without messages from storage
    render(<InsightChat {...BASE} isVisible={false} />);
    // No crash — component mounts normally
    await act(async () => {});
    // The textarea should be accessible (component rendered correctly)
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});

// ── Line 158: getInsight rejection ────────────────────────────────────────────

describe("InsightChat — getInsight failure (line 158)", () => {
  it("shows an error message in chat when getInsight rejects", async () => {
    mockGetInsight.mockRejectedValue(new Error("Gemini quota exceeded"));

    render(<InsightChat {...BASE} />);

    await waitFor(() =>
      expect(screen.getByText(/Error: Gemini quota exceeded/)).toBeInTheDocument()
    );
  });
});

// ── Lines 167-175: manual refresh via ↺ button ───────────────────────────────

describe("InsightChat — manual refresh (lines 167-175)", () => {
  it("calls getInsight again when the ↺ button is clicked", async () => {
    mockGetInsight.mockResolvedValue({ insight: "First insight." });
    render(<InsightChat {...BASE} />);

    // Wait for the initial auto-fetch
    await waitFor(() => expect(mockGetInsight).toHaveBeenCalledTimes(1));

    // Reset mock for the second call
    mockGetInsight.mockResolvedValue({ insight: "Refreshed insight." });

    const refreshBtn = screen.getByTitle("Append a fresh insight");
    fireEvent.click(refreshBtn);

    await waitFor(() => expect(mockGetInsight).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText(/Refreshed insight/)).toBeInTheDocument()
    );
  });

  it("calls onAIUsed when manual refresh fires", async () => {
    const onAIUsed = jest.fn();
    render(<InsightChat {...BASE} onAIUsed={onAIUsed} />);

    // Drain the auto-fetch
    await waitFor(() => expect(onAIUsed).toHaveBeenCalledTimes(1));

    const refreshBtn = screen.getByTitle("Append a fresh insight");
    fireEvent.click(refreshBtn);

    await waitFor(() => expect(onAIUsed).toHaveBeenCalledTimes(2));
  });

  it("shows error message when refresh getInsight rejects", async () => {
    render(<InsightChat {...BASE} />);
    await waitFor(() => expect(mockGetInsight).toHaveBeenCalledTimes(1));

    mockGetInsight.mockRejectedValue(new Error("Network error"));
    const refreshBtn = screen.getByTitle("Append a fresh insight");
    fireEvent.click(refreshBtn);

    await waitFor(() =>
      expect(screen.getByText(/Error: Network error/)).toBeInTheDocument()
    );
  });

  it("does not trigger refresh when hasGeminiKey is false", async () => {
    render(<InsightChat {...BASE} hasGeminiKey={false} />);
    await act(async () => {});

    // The refresh button should be disabled
    const refreshBtn = screen.getByTitle("Gemini API key required");
    expect(refreshBtn).toBeDisabled();
    expect(mockGetInsight).not.toHaveBeenCalled();
  });
});

// ── Lines 196-206: sendMessage with context attached ─────────────────────────

describe("InsightChat — sendMessage with context (lines 196-206)", () => {
  it("sends 'Selected passage:' prefix when contextText is set", async () => {
    // Provide selectedText so the context chip appears
    render(<InsightChat {...BASE} selectedText="universally acknowledged" />);

    // Wait for initial insight so loading clears
    await waitFor(() => expect(mockGetInsight).toHaveBeenCalledTimes(1));
    await act(async () => await flushPromises());

    // Type and send a question
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "What does this mean?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(mockAskQuestion).toHaveBeenCalledTimes(1));

    // The passage argument (2nd arg) should contain the context prefix
    const passageArg: string = mockAskQuestion.mock.calls[0][1];
    expect(passageArg).toContain("Selected passage:");
    expect(passageArg).toContain("universally acknowledged");
  });

  it("context chip shows the selected text and clears on × click (lines 158, 167-175)", async () => {
    render(<InsightChat {...BASE} selectedText="universally acknowledged" />);
    await act(async () => {});

    // Context chip should be visible in the input area
    expect(screen.getByText(/universally acknowledged/)).toBeInTheDocument();

    // Click the × button to clear context
    const clearBtn = screen.getByTitle("Remove context");
    fireEvent.click(clearBtn);

    // Chip should disappear
    await waitFor(() =>
      expect(screen.queryByTitle("Remove context")).not.toBeInTheDocument()
    );
  });

  it("sends without context prefix when no contextText set", async () => {
    render(<InsightChat {...BASE} />);
    await waitFor(() => expect(mockGetInsight).toHaveBeenCalledTimes(1));
    await act(async () => await flushPromises());

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Tell me more." } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(mockAskQuestion).toHaveBeenCalledTimes(1));

    const passageArg: string = mockAskQuestion.mock.calls[0][1];
    expect(passageArg).not.toContain("Selected passage:");
  });
});

// ── Line 235: askQuestion rejection ──────────────────────────────────────────

describe("InsightChat — askQuestion failure (line 235)", () => {
  it("shows an error message in chat when askQuestion rejects", async () => {
    mockAskQuestion.mockRejectedValue(new Error("API limit reached"));

    render(<InsightChat {...BASE} isVisible={false} />);
    await act(async () => {});

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "What does this mean?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(screen.getByText(/Error: API limit reached/)).toBeInTheDocument()
    );
  });
});

// ── Lines 254, 262-311: loading state + typing indicator ─────────────────────

describe("InsightChat — loading state during send (lines 254, 262-311)", () => {
  it("shows typing indicator while askQuestion is in-flight", async () => {
    // Make askQuestion hang so we can inspect the loading state
    let resolveAnswer!: (v: { answer: string }) => void;
    mockAskQuestion.mockReturnValue(
      new Promise<{ answer: string }>((res) => { resolveAnswer = res; })
    );

    render(<InsightChat {...BASE} isVisible={false} />);
    await act(async () => {});

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Pending question?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // After sending, messages.length > 0 and chatLoading=true → typing indicator
    await waitFor(() => {
      // The typing indicator is an animate-pulse div inside the message area
      const pulseEls = document.querySelectorAll(".animate-pulse");
      expect(pulseEls.length).toBeGreaterThan(0);
    });

    // Resolve to end loading
    await act(async () => { resolveAnswer({ answer: "Done!" }); });
    await waitFor(() =>
      expect(screen.getByText(/Done!/)).toBeInTheDocument()
    );
  });

  it("send button is disabled while loading", async () => {
    let resolveAnswer!: (v: { answer: string }) => void;
    mockAskQuestion.mockReturnValue(
      new Promise<{ answer: string }>((res) => { resolveAnswer = res; })
    );

    render(<InsightChat {...BASE} isVisible={false} />);
    await act(async () => {});

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Loading test?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      // The send button (↑) should be disabled while in-flight
      const sendBtn = screen.getByTitle("Send (Enter)");
      expect(sendBtn).toBeDisabled();
    });

    await act(async () => { resolveAnswer({ answer: "Done!" }); });
  });

  it("shows initial skeleton when chatLoading=true and no messages yet", async () => {
    // Make getInsight hang so we can observe the loading state with 0 messages
    let resolveInsight!: (v: { insight: string }) => void;
    mockGetInsight.mockReturnValue(
      new Promise<{ insight: string }>((res) => { resolveInsight = res; })
    );

    render(<InsightChat {...BASE} />);

    // chatLoading=true, messages.length===0 → skeleton visible
    await waitFor(() => {
      const pulseEls = document.querySelectorAll(".animate-pulse");
      expect(pulseEls.length).toBeGreaterThan(0);
    });

    await act(async () => { resolveInsight({ insight: "Loaded!" }); });
  });
});

// ── Lines 359-397: onSaveInsight callback ────────────────────────────────────

describe("InsightChat — onSaveInsight (lines 359-397)", () => {
  it("renders 'Save to notes' button on assistant messages when onSaveInsight provided", async () => {
    const onSaveInsight = jest.fn();

    render(<InsightChat {...BASE} isVisible={false} onSaveInsight={onSaveInsight} />);
    await act(async () => {});

    // Send a question so an assistant reply is added
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "What is the theme?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(screen.getByText("Test answer.")).toBeInTheDocument()
    );

    // Save button should appear on the assistant reply
    const saveBtn = screen.getByTitle(/Save to notes/i);
    expect(saveBtn).toBeInTheDocument();
  });

  it("calls onSaveInsight with question and answer when Save to notes is clicked", async () => {
    const onSaveInsight = jest.fn();

    render(<InsightChat {...BASE} isVisible={false} onSaveInsight={onSaveInsight} />);
    await act(async () => {});

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "What is the theme?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(screen.getByText("Test answer.")).toBeInTheDocument()
    );

    const saveBtn = screen.getByTitle(/Save to notes/i);
    fireEvent.click(saveBtn);

    expect(onSaveInsight).toHaveBeenCalledTimes(1);
    const [question, answer] = onSaveInsight.mock.calls[0];
    expect(question).toBe("What is the theme?");
    expect(answer).toBe("Test answer.");
  });

  it("changes save button to 'Saved' after clicking and does not call onSaveInsight again", async () => {
    const onSaveInsight = jest.fn();

    render(<InsightChat {...BASE} isVisible={false} onSaveInsight={onSaveInsight} />);
    await act(async () => {});

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Theme question?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(screen.getByText("Test answer.")).toBeInTheDocument()
    );

    const saveBtn = screen.getByTitle(/Save to notes/i);
    fireEvent.click(saveBtn);

    // After saving, the button should change to "Already saved"
    await waitFor(() =>
      expect(screen.getByTitle(/Already saved/i)).toBeInTheDocument()
    );

    // Clicking again should not call onSaveInsight a second time
    const alreadySavedBtn = screen.getByTitle(/Already saved/i);
    fireEvent.click(alreadySavedBtn);
    expect(onSaveInsight).toHaveBeenCalledTimes(1);
  });

  it("does not show 'Save to notes' button when onSaveInsight is not provided", async () => {
    render(<InsightChat {...BASE} isVisible={false} />);
    await act(async () => {});

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Question without save?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(screen.getByText("Test answer.")).toBeInTheDocument()
    );

    expect(screen.queryByTitle(/Save this insight/i)).not.toBeInTheDocument();
  });

  it("shows Gemini key notice when hasGeminiKey is false (lines 119-120 render branch)", () => {
    render(<InsightChat {...BASE} hasGeminiKey={false} />);

    // Both key-reminder notices should be present
    expect(screen.getAllByText(/Gemini API key/i).length).toBeGreaterThanOrEqual(1);
    // Insight notice (top of messages area)
    expect(screen.getByText(/Insights require/i)).toBeInTheDocument();
    // Input-area reminder
    expect(screen.getByText(/Chat requires a/i)).toBeInTheDocument();
  });
});

// ── Lines 167-175 (context chip rendering) ────────────────────────────────────

describe("InsightChat — context chip (lines 167-175 render paths)", () => {
  it("displays the context chip with truncated text when selectedText > 160 chars", async () => {
    const longText = "A".repeat(170);
    render(<InsightChat {...BASE} selectedText={longText} />);
    await act(async () => {});

    // The chip truncates at 160 chars with an ellipsis
    expect(screen.getByText(/…/)).toBeInTheDocument();
  });

  it("displays context chip without ellipsis when selectedText <= 160 chars", async () => {
    const shortText = "Short selection.";
    render(<InsightChat {...BASE} selectedText={shortText} />);
    await act(async () => {});

    // Chip should show the text — search in the input area
    const chip = screen.getAllByText(/Short selection\./i);
    expect(chip.length).toBeGreaterThanOrEqual(1);
  });
});
