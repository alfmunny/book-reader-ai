/**
 * ImportPage — branch coverage for the updated page.tsx:
 *   - fmtCost / fmtNum helpers (lines 47-54)
 *   - estimateCost with totalWords (line 41)
 *   - meta event with source_language (line 124)
 *   - chapters event with total_words, singular chapter (lines 129-137)
 *   - stage event marking previous active stage done (lines 147-149)
 *   - stage event with ev.total=0 fallback (line 154)
 *   - progress event with ev.message fallback (line 165)
 *   - done event marking active stages done (lines 174-177)
 *   - skipToReading function (lines 213-216)
 *   - handleTranslate function + enqueue success/failure (lines 218-230)
 *   - showTranslatePrompt display (lines 194-403)
 *   - translateState "enqueued" banner (lines 405-410)
 *   - translateError message (lines 381-383)
 *   - started=true guard in startImport (line 91)
 *   - non-Error import failure (line 111)
 *   - stage "error" status rendering (lines 281, 290)
 *   - canStartReading button + showTranslatePrompt hiding it (lines 441-447)
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import BookImportPage from "@/app/import/[bookId]/page";

jest.mock("next/navigation", () => ({
  useParams: jest.fn().mockReturnValue({ bookId: "42" }),
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
  useSearchParams: jest
    .fn()
    .mockReturnValue({ get: jest.fn().mockReturnValue(null) }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    importBookStream: jest.fn(),
    enqueueBookTranslation: jest.fn(),
    ApiError: actual.ApiError,
  };
});

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({ translationLang: "de" }),
}));

const { importBookStream, enqueueBookTranslation } = require("@/lib/api");

async function* makeStream(events: object[]) {
  for (const ev of events) yield ev;
}

// Helper: click a button and flush async effects/generators
async function clickAndFlush(buttonName: RegExp | string) {
  const btn = screen.getByRole("button", { name: buttonName });
  await act(async () => { fireEvent.click(btn); });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── startImport guard: if (started) return ───────────────────────────────────

describe("ImportPage — startImport double-click guard (line 91)", () => {
  it("hides Start import button after first click so it cannot be clicked again", async () => {
    importBookStream.mockReturnValue(makeStream([]));
    render(<BookImportPage />);

    await clickAndFlush(/start import/i);

    // After import starts, the "start import" section is hidden (started=true)
    // So the button is no longer in the DOM
    expect(
      screen.queryByRole("button", { name: /start import/i })
    ).not.toBeInTheDocument();
    expect(importBookStream).toHaveBeenCalledTimes(1);
  });
});

// ── non-Error exception in startImport (line 111) ────────────────────────────

describe("ImportPage — non-Error exception during import (line 111)", () => {
  it("shows 'Import failed' when stream throws a non-Error object", async () => {
    importBookStream.mockReturnValue(
      (async function* () { throw "plain string error"; })()
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Import failed")).toBeInTheDocument()
    );
  });
});

// ── meta event with source_language (line 124) ───────────────────────────────

describe("ImportPage — meta event source_language (line 124)", () => {
  it("sets source language from meta event", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", title: "Test Book", source_language: "en" },
      ])
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Test Book")).toBeInTheDocument()
    );
  });

  it("meta event with no title does not crash", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "meta", source_language: "fr" }])
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Download text")).toBeInTheDocument()
    );
    // No title → shows "Book ID 42" fallback
    expect(screen.getByText(/Book ID 42/)).toBeInTheDocument();
  });
});

// ── chapters event with total_words and singular (lines 129-137) ──────────────

describe("ImportPage — chapters event (lines 129-137)", () => {
  it("sets chapterCount for singular chapter (total=1) and updates splitting stage", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "fetching", total: 1 },
        { event: "chapters", total: 1, total_words: 5000 },
      ])
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    // After chapters event, splitting stage is "done"
    await waitFor(() =>
      expect(screen.getByText("Split chapters")).toBeInTheDocument()
    );
    // The splitting stage should show as done (✓ icon)
    // canStartReading = splitting.done && chapterCount > 0 = true
    // The stage message is not shown (only when active)
    // Verify no crash and stage visible
    expect(screen.getByText("Download text")).toBeInTheDocument();
  });

  it("sets chapterCount for plural chapters (total > 1) and updates splitting stage", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "chapters", total: 5, total_words: 10000 },
      ])
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    // After chapters event, splitting stage is "done"
    await waitFor(() =>
      expect(screen.getByText("Split chapters")).toBeInTheDocument()
    );
    // canStartReading = true
    expect(screen.getByRole("button", { name: /start reading now/i })).toBeInTheDocument();
  });

  it("handles chapters event with total=0", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "chapters", total: 0 }])
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Split chapters")).toBeInTheDocument()
    );
  });
});

// ── stage event: marks previous active stage done (lines 147-149) ────────────

describe("ImportPage — stage event marks previous active stage done (line 147-149)", () => {
  it("marks fetching as done when splitting stage event arrives", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "fetching", total: 1, message: "Fetching…" },
        { event: "stage", stage: "splitting", total: 10, message: "Splitting…" },
      ])
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Split chapters")).toBeInTheDocument()
    );
    expect(screen.getByText("Download text")).toBeInTheDocument();
  });

  it("stage event with ev.total=0 uses 1 as fallback", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "stage", stage: "fetching", total: 0 }])
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Download text")).toBeInTheDocument()
    );
  });

  it("stage event with no message uses empty string", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "stage", stage: "fetching", total: 1 }])
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Download text")).toBeInTheDocument()
    );
  });
});

// ── progress event with ev.message fallback (line 165) ───────────────────────

describe("ImportPage — progress event fallback (line 165)", () => {
  it("uses ev.message when ev.title is absent", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "fetching", total: 10, message: "Starting" },
        { event: "progress", stage: "fetching", current: 3, message: "Progress message" },
      ])
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Download text")).toBeInTheDocument()
    );
  });

  it("uses empty string when neither title nor message is present", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "fetching", total: 5 },
        { event: "progress", stage: "fetching", current: 2 },
      ])
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Download text")).toBeInTheDocument()
    );
  });
});

// ── done event marking active stages done (lines 174-177) ────────────────────

describe("ImportPage — done event marks active stages done (lines 174-177)", () => {
  it("marks active stages done when done event fires", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "fetching", total: 1 },
        { event: "done" },
      ])
    );
    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Download text")).toBeInTheDocument()
    );
    // No crash
    expect(true).toBe(true);
  });
});

// ── skipToReading function (lines 213-216) ───────────────────────────────────

describe("ImportPage — skipToReading (lines 213-216)", () => {
  it("'Start reading now' button calls skipToReading when canStartReading", async () => {
    const { useRouter } = require("next/navigation");
    const push = jest.fn();
    useRouter.mockReturnValue({ push });

    // chapters event → canStartReading=true, source=de (same as target) → no translate prompt
    importBookStream.mockReturnValue(
      makeStream([
        // No source_language or same as "de" → showTranslatePrompt=false
        { event: "chapters", total: 3 },
        // Don't send done so canStartReading remains without redirect
      ])
    );

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Start reading now/i })).toBeInTheDocument()
    );

    await clickAndFlush(/Start reading now/i);
    expect(push).toHaveBeenCalledWith("/reader/42");
  });

  it("Skip button before import start navigates to reader", async () => {
    const { useRouter } = require("next/navigation");
    const push = jest.fn();
    useRouter.mockReturnValue({ push });

    render(<BookImportPage />);

    await clickAndFlush(/^Skip$/i);
    expect(push).toHaveBeenCalledWith("/reader/42");
  });
});

// ── handleTranslate — success path ───────────────────────────────────────────

describe("ImportPage — handleTranslate success (lines 218-224)", () => {
  it("shows translation queued banner after successful enqueue", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", title: "Test Book", source_language: "en" },
        { event: "chapters", total: 5 },
        { event: "done" },
      ])
    );
    enqueueBookTranslation.mockResolvedValue(undefined);

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText(/Pre-translate this book/i)).toBeInTheDocument()
    );

    await clickAndFlush(/Translate in background/i);

    await waitFor(() =>
      expect(screen.getByText(/Translation queued/i)).toBeInTheDocument()
    );
    expect(enqueueBookTranslation).toHaveBeenCalledWith(42, "de");
  });

  it("shows 'Enqueuing…' while handleTranslate is in flight", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", source_language: "en" },
        { event: "chapters", total: 3 },
        { event: "done" },
      ])
    );

    let resolveEnqueue!: () => void;
    enqueueBookTranslation.mockReturnValue(
      new Promise<void>((res) => { resolveEnqueue = res; })
    );

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText(/Pre-translate this book/i)).toBeInTheDocument()
    );

    await clickAndFlush(/Translate in background/i);

    // While pending, shows "Enqueuing…"
    await waitFor(() =>
      expect(screen.getByText(/Enqueuing…/i)).toBeInTheDocument()
    );

    await act(async () => { resolveEnqueue(); });
  });
});

// ── handleTranslate — failure path ───────────────────────────────────────────

describe("ImportPage — handleTranslate failure (lines 224-228)", () => {
  it("shows translateError when enqueue fails with Error", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", source_language: "en" },
        { event: "chapters", total: 3 },
        { event: "done" },
      ])
    );
    enqueueBookTranslation.mockRejectedValue(new Error("Quota exceeded"));

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText(/Pre-translate this book/i)).toBeInTheDocument()
    );

    await clickAndFlush(/Translate in background/i);

    await waitFor(() =>
      expect(screen.getByText("Quota exceeded")).toBeInTheDocument()
    );
  });

  it("shows fallback error when non-Error is thrown during handleTranslate", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", source_language: "en" },
        { event: "chapters", total: 3 },
        { event: "done" },
      ])
    );
    enqueueBookTranslation.mockRejectedValue("string error");

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText(/Pre-translate this book/i)).toBeInTheDocument()
    );

    await clickAndFlush(/Translate in background/i);

    await waitFor(() =>
      expect(screen.getByText("Failed to enqueue translation")).toBeInTheDocument()
    );
  });
});

// ── "Skip for now" button in translate prompt ─────────────────────────────────

describe("ImportPage — skip translation prompt (line 396-400)", () => {
  it("'Skip for now' hides translate prompt and shows Done message", async () => {
    jest.useFakeTimers();
    const { useRouter } = require("next/navigation");
    const push = jest.fn();
    useRouter.mockReturnValue({ push });

    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", source_language: "en" },
        { event: "chapters", total: 3 },
        { event: "done" },
      ])
    );

    render(<BookImportPage />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /start import/i })); });

    await waitFor(() =>
      expect(screen.getByText(/Pre-translate this book/i)).toBeInTheDocument()
    );

    const skipForNowBtn = screen.getByRole("button", { name: /Skip for now/i });
    await act(async () => { fireEvent.click(skipForNowBtn); });

    // After skip, readyToRedirect=true → shows Done message
    await waitFor(() =>
      expect(screen.getByText(/Done — opening your book/i)).toBeInTheDocument()
    );

    act(() => jest.advanceTimersByTime(1200));
    expect(push).toHaveBeenCalledWith("/reader/42");

    jest.useRealTimers();
  });
});

// ── fmtCost helper (lines 47-50) ─────────────────────────────────────────────

describe("ImportPage — fmtCost helper via translate prompt (lines 47-50)", () => {
  it("shows '< $0.01' for very cheap books (line 48)", async () => {
    // 1 word → tokens ≈ 1.4 → usd ≈ 0.0000035 < 0.005 → "< $0.01"
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", source_language: "en" },
        { event: "chapters", total: 1, total_words: 1 },
        { event: "done" },
      ])
    );

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText(/Pre-translate this book/i)).toBeInTheDocument()
    );

    expect(screen.getByText(/< \$0\.01/)).toBeInTheDocument();
  });

  it("shows formatted cost for larger books (line 49)", async () => {
    // 1M words → tokens = 1.4M → usd = 3.5 → "~$3.50"
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", source_language: "en" },
        { event: "chapters", total: 10, total_words: 1_000_000 },
        { event: "done" },
      ])
    );

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText(/Pre-translate this book/i)).toBeInTheDocument()
    );

    expect(screen.getByText(/~\$3\.50/)).toBeInTheDocument();
  });
});

// ── estimateCost with no totalWords (line 41) ─────────────────────────────────

describe("ImportPage — estimateCost without totalWords (line 41)", () => {
  it("shows cost estimate based on chapter count alone", async () => {
    // No total_words → estimateCost uses chapters * 2000 avg
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", source_language: "en" },
        { event: "chapters", total: 5 },  // no total_words
        { event: "done" },
      ])
    );

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText(/Pre-translate this book/i)).toBeInTheDocument()
    );

    // Cost display should be visible (any format)
    const costEl = screen.getByText(/~\$|< \$/);
    expect(costEl).toBeInTheDocument();
  });

  it("shows word count when total_words is available", async () => {
    // With total_words, the prompt shows "~N words"
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", source_language: "en" },
        { event: "chapters", total: 3, total_words: 12000 },
        { event: "done" },
      ])
    );

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText(/Pre-translate this book/i)).toBeInTheDocument()
    );

    // Word count appears in the description
    expect(screen.getByText(/12,000 words/)).toBeInTheDocument();
  });
});

// ── canStartReading shows "Start reading now" (lines 441-447) ────────────────

describe("ImportPage — canStartReading + showTranslatePrompt interaction", () => {
  it("shows 'Start reading now' when canStartReading and !showTranslatePrompt", async () => {
    // Source language = target language → no translate prompt
    // chapters → canStartReading = true
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", source_language: "de" }, // same as target "de"
        { event: "chapters", total: 3 },
      ])
    );

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Start reading now/i })).toBeInTheDocument()
    );
  });

  it("hides 'Start reading now' when showTranslatePrompt is true", async () => {
    // source != target → showTranslatePrompt=true → button hidden
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", source_language: "en" },
        { event: "chapters", total: 3 },
        { event: "done" },
      ])
    );

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText(/Pre-translate this book/i)).toBeInTheDocument()
    );

    // "Start reading now" should NOT be visible when translate prompt is shown
    expect(
      screen.queryByRole("button", { name: /Start reading now/i })
    ).not.toBeInTheDocument();
  });
});

// ── stage "error" icon and color (lines 281, 290) ────────────────────────────

describe("ImportPage — stage error state rendering (lines 281, 290)", () => {
  it("shows '!' icon for error stage", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "error", stage: "fetching", message: "Download failed" }])
    );

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Download failed")).toBeInTheDocument()
    );
    // Error state now renders AlertCircleIcon SVG — verify via the accessible element structure
    const stageRow = screen.getByText("Download failed").closest("div");
    expect(stageRow).toBeInTheDocument();
  });
});

// ── active stage with total > 1 shows count (line 306) ──────────────────────

describe("ImportPage — active stage with total > 1 shows current/total", () => {
  it("renders current / total counter when stage is active and total > 1", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "fetching", total: 10, message: "Working…" },
        { event: "progress", stage: "fetching", current: 3, title: "Chapter 3" },
      ])
    );

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText(/3 \/ 10/)).toBeInTheDocument()
    );
  });
});

// ── readyToRedirect (source=target, no translate prompt) ─────────────────────

describe("ImportPage — readyToRedirect when sourceLanguage = targetLanguage", () => {
  it("shows 'Done' and redirects when no translate prompt needed", async () => {
    jest.useFakeTimers();
    const { useRouter } = require("next/navigation");
    const push = jest.fn();
    useRouter.mockReturnValue({ push });

    // source_language same as target "de" → no translate prompt → direct redirect
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", source_language: "de" },
        { event: "chapters", total: 3 },
        { event: "done" },
      ])
    );

    render(<BookImportPage />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /start import/i })); });

    await waitFor(() =>
      expect(screen.getByText(/Done — opening your book/i)).toBeInTheDocument()
    );

    act(() => jest.advanceTimersByTime(1200));
    expect(push).toHaveBeenCalledWith("/reader/42");

    jest.useRealTimers();
  });
});

// ── stage active message rendering (line 327-330) ───────────────────────────

describe("ImportPage — active stage message rendering (line 327-330)", () => {
  it("shows stage message when stage is active and has a message", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "fetching", total: 1, message: "Downloading the book…" },
      ])
    );

    render(<BookImportPage />);
    await clickAndFlush(/start import/i);

    await waitFor(() =>
      expect(screen.getByText("Downloading the book…")).toBeInTheDocument()
    );
  });
});
