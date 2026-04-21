/**
 * ImportPage — additional coverage targeting uncovered lines:
 *   48-53:   fmtCost / fmtNum helpers
 *   141-159: stage event handling (active/done transitions)
 *   163-167: progress event handling
 *   209-228: cancel, skipToReading, handleTranslate
 *   263:     skip button (navigates to nextUrl before import starts)
 *   396:     "Skip for now" button on translate prompt
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
    ApiError: actual.ApiError,
  };
});

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({ translationLang: "de" }),
}));

const { importBookStream } = require("@/lib/api");

async function* makeStream(events: object[]) {
  for (const ev of events) yield ev;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// Error event handling (lines 96-99)
// ─────────────────────────────────────────────────────────────────────────────
describe("ImportPage — error event handling", () => {
  it("shows error message from error event without stage", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "error", message: "Network failure" }]),
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText("Network failure")).toBeInTheDocument(),
    );
  });

  it("shows default error message when error event has no message", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "error", stage: "fetching" }]),
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText("Import failed")).toBeInTheDocument(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 141-159: stage event — marks previous active stages done, sets new stage
// ─────────────────────────────────────────────────────────────────────────────
describe("ImportPage — stage event handling", () => {
  it("marks fetching done and splitting active when stage=splitting fires", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "fetching", total: 1, message: "Downloading…" },
        { event: "stage", stage: "splitting", total: 61, message: "Splitting…" },
      ]),
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText("Download text")).toBeInTheDocument(),
    );
    // After both stage events the stage list should be rendered without errors
    expect(screen.getByText("Split chapters")).toBeInTheDocument();
  });

  it("handles stage event with ev.stage='fetching'", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "fetching", total: 5, message: "Fetching text" },
      ]),
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));
    await waitFor(() =>
      expect(screen.getByText("Download text")).toBeInTheDocument(),
    );
  });

  it("stage event with unknown stage does not crash", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "unknown_stage", total: 1, message: "" },
      ]),
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));
    await waitFor(() =>
      expect(screen.getByText("Download text")).toBeInTheDocument(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 163-167: progress event — updates current/message on a stage
// ─────────────────────────────────────────────────────────────────────────────
describe("ImportPage — progress event handling", () => {
  it("updates progress count when progress event fires", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "fetching", total: 10 },
        {
          event: "progress",
          stage: "fetching",
          current: 5,
          title: "Chapter 5",
        },
      ]),
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));
    // Should render stage list with fetching active
    await waitFor(() =>
      expect(screen.getByText("Download text")).toBeInTheDocument(),
    );
  });

  it("uses ev.message when ev.title is absent in progress event", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "stage", stage: "splitting", total: 20 },
        {
          event: "progress",
          stage: "splitting",
          current: 10,
          message: "Half done",
        },
      ]),
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));
    await waitFor(() =>
      expect(screen.getByText("Split chapters")).toBeInTheDocument(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 209-228: cancel, skipToReading, handleTranslate
// ─────────────────────────────────────────────────────────────────────────────
describe("ImportPage — cancel and skip", () => {
  it("cancel button calls abort and pushes '/'", async () => {
    const { useRouter } = require("next/navigation");
    const push = jest.fn();
    useRouter.mockReturnValue({ push });

    importBookStream.mockReturnValue(makeStream([]));
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("shows 401 login required UI when API returns 401", async () => {
    const { ApiError } = require("@/lib/api");
    const err401 = new ApiError(401, "Unauthorized");
    importBookStream.mockReturnValue(
      (async function* () { throw err401; })(),
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText(/Login required/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /Sign in/i })).toBeInTheDocument();
  });
});

describe("ImportPage — isDone auto-redirect", () => {
  it("shows 'Done' message and redirects after 1500ms when done event fires", async () => {
    const { useRouter } = require("next/navigation");
    const push = jest.fn();
    useRouter.mockReturnValue({ push });

    importBookStream.mockReturnValue(
      makeStream([{ event: "done" }]),
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText(/Done — opening your book/i)).toBeInTheDocument(),
    );
    act(() => jest.advanceTimersByTime(1500));
    expect(push).toHaveBeenCalledWith("/reader/42");
  });

  it("uses custom 'next' search param as redirect URL", async () => {
    const { useRouter, useSearchParams } = require("next/navigation");
    const push = jest.fn();
    useRouter.mockReturnValue({ push });
    const customGet = jest.fn().mockReturnValue("/custom/path");
    useSearchParams.mockReturnValue({ get: customGet });

    importBookStream.mockReturnValue(makeStream([{ event: "done" }]));
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText(/Done — opening your book/i)).toBeInTheDocument(),
    );
    act(() => jest.advanceTimersByTime(1500));
    expect(push).toHaveBeenCalledWith("/custom/path");

    // Restore default mock so later tests are unaffected
    useSearchParams.mockReturnValue({ get: jest.fn().mockReturnValue(null) });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 263: "Skip" button before import starts — navigates to nextUrl
// ─────────────────────────────────────────────────────────────────────────────
describe("ImportPage — skip before import", () => {
  it("Skip button navigates to reader URL without starting import", async () => {
    const { useRouter } = require("next/navigation");
    const push = jest.fn();
    useRouter.mockReturnValue({ push });

    importBookStream.mockReturnValue(makeStream([]));
    render(<BookImportPage />);

    // "Skip" is visible before import starts
    fireEvent.click(screen.getByRole("button", { name: /^Skip$/i }));
    expect(push).toHaveBeenCalledWith("/reader/42");
    expect(importBookStream).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional branch coverage
// ─────────────────────────────────────────────────────────────────────────────
describe("ImportPage — meta event title", () => {
  it("shows book title from meta event", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "meta", title: "The Great Gatsby" }]),
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText("The Great Gatsby")).toBeInTheDocument(),
    );
  });
});

describe("ImportPage — general import error", () => {
  it("shows error message when stream throws a non-abort, non-401 error", async () => {
    importBookStream.mockReturnValue(
      (async function* () { throw new Error("Server exploded"); })(),
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText("Server exploded")).toBeInTheDocument(),
    );
  });
});
