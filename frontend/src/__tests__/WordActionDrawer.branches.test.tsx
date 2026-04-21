/**
 * WordActionDrawer — branch coverage for missed branches (80.5% → ≥90%).
 *
 * Uncovered branches identified from coverage report (lines 89-90):
 *  - mousedown outside the drawer fires onClose (click-outside handler)
 *  - mousedown inside the drawer does NOT fire onClose
 *  - language prop provided → uses lang code from split
 *  - phonetic from phonetics[0].text (not entry.phonetic)
 *  - word shorter than 2 chars → no fetch triggered
 *  - action.word is empty string → no fetch triggered
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import WordActionDrawer from "@/components/WordActionDrawer";
import type { WordAction } from "@/components/WordActionDrawer";

const BASE_ACTION: WordAction = {
  word: "hello",
  sentenceText: "Hello world.",
  segmentStartTime: 1.5,
  chapterIndex: 0,
};

const mockDictionaryEntry = {
  word: "hello",
  phonetic: "/həˈloʊ/",
  meanings: [
    { partOfSpeech: "exclamation", definitions: [{ definition: "Used as a greeting." }] },
  ],
};

function setupFetchMock(ok = true, data: unknown = [mockDictionaryEntry]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: jest.fn().mockResolvedValue(data),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  setupFetchMock();
});

afterEach(() => {
  jest.useRealTimers();
});

// ── Lines 89-90: click-outside closes drawer ──────────────────────────────────

describe("WordActionDrawer — click-outside handler (lines 89-90)", () => {
  it("calls onClose when mousedown fires outside the drawer element", async () => {
    const onClose = jest.fn();
    render(
      <WordActionDrawer action={BASE_ACTION} onClose={onClose} />,
    );

    // The setTimeout delay in the useEffect is 100ms — advance timers so
    // the event listener is attached.
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Fire mousedown on the document body (outside the drawer)
    act(() => {
      fireEvent.mouseDown(document.body);
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT call onClose when mousedown fires inside the drawer element", async () => {
    const onClose = jest.fn();
    const { container } = render(
      <WordActionDrawer action={BASE_ACTION} onClose={onClose} />,
    );

    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Find the drawer div (has z-50 class)
    const drawer = container.querySelector(".z-50") as HTMLElement;
    expect(drawer).toBeTruthy();

    act(() => {
      fireEvent.mouseDown(drawer);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes event listener when action becomes null (cleanup)", async () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <WordActionDrawer action={BASE_ACTION} onClose={onClose} />,
    );

    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Now set action to null — component returns null and cleanup runs
    rerender(<WordActionDrawer action={null} onClose={onClose} />);

    // Mousedown should NOT call onClose because listener was removed
    act(() => {
      fireEvent.mouseDown(document.body);
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── language prop — split on hyphen ──────────────────────────────────────────

describe("WordActionDrawer — language prop used in API URL", () => {
  it("uses language code prefix (before hyphen) in the dictionary API URL", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([mockDictionaryEntry]),
    });

    render(
      <WordActionDrawer
        action={BASE_ACTION}
        language="en-US"
        onClose={jest.fn()}
      />,
    );

    // Advance timers so fetch fires
    act(() => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/en/hello"),
      );
    });
  });

  it("defaults to 'en' when language prop is undefined", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([mockDictionaryEntry]),
    });

    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
      />,
    );

    act(() => jest.advanceTimersByTime(0));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/en/hello"),
      );
    });
  });
});

// ── phonetic from phonetics array fallback ────────────────────────────────────

describe("WordActionDrawer — phonetic fallback from phonetics array", () => {
  it("shows phonetic text from phonetics[0].text when entry.phonetic is missing", async () => {
    const entryWithPhoneticsFallback = {
      word: "hello",
      phonetic: undefined,
      phonetics: [{ text: "/hɛˈloʊ/" }],
      meanings: [
        { partOfSpeech: "exclamation", definitions: [{ definition: "A greeting." }] },
      ],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([entryWithPhoneticsFallback]),
    });

    render(
      <WordActionDrawer action={BASE_ACTION} onClose={jest.fn()} />,
    );

    act(() => jest.advanceTimersByTime(0));

    await waitFor(() =>
      expect(screen.getByText("/hɛˈloʊ/")).toBeInTheDocument(),
    );
  });
});

// ── short word (< 2 chars) → no fetch ─────────────────────────────────────────

describe("WordActionDrawer — short word skips fetch", () => {
  it("does not call fetch when word has length < 2", () => {
    global.fetch = jest.fn();
    render(
      <WordActionDrawer
        action={{ ...BASE_ACTION, word: "a" }}
        onClose={jest.fn()}
      />,
    );

    act(() => jest.advanceTimersByTime(0));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not call fetch when word is empty string", () => {
    global.fetch = jest.fn();
    render(
      <WordActionDrawer
        action={{ ...BASE_ACTION, word: "" }}
        onClose={jest.fn()}
      />,
    );

    act(() => jest.advanceTimersByTime(0));

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── meanings ?? [] fallback ───────────────────────────────────────────────────

describe("WordActionDrawer — null meanings fallback", () => {
  it("renders without crash when entry.meanings is null/undefined", async () => {
    const entryNoMeanings = {
      word: "hello",
      phonetic: "/həˈloʊ/",
      meanings: null,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([entryNoMeanings]),
    });

    render(<WordActionDrawer action={BASE_ACTION} onClose={jest.fn()} />);
    act(() => jest.advanceTimersByTime(0));

    // Component should render without throwing and show the word
    await waitFor(() =>
      expect(screen.getByText("hello")).toBeInTheDocument(),
    );
  });
});
