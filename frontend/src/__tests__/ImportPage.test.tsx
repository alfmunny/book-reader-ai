/**
 * Import page — stage transitions, error handling, 401 gate, and
 * auto-redirect after completion.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import BookImportPage from "@/app/import/[bookId]/page";
import { ApiError } from "@/lib/api";

jest.mock("next/navigation", () => ({
  useParams: jest.fn().mockReturnValue({ bookId: "1342" }),
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
  useSearchParams: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(null) }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    importBookStream: jest.fn(),
    enqueueBookTranslation: jest.fn().mockResolvedValue({ ok: true, enqueued: 5 }),
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

async function* failingStream(error: Error) {
  throw error;
  yield {}; // never reached; satisfies generator type
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("ImportPage — stage transitions", () => {
  it("shows stage list after starting import", async () => {
    importBookStream.mockReturnValue(makeStream([]));
    render(<BookImportPage />);

    fireEvent.click(screen.getByRole("button", { name: /start import/i }));
    await waitFor(() => {
      expect(screen.getByText("Download text")).toBeInTheDocument();
      expect(screen.getByText("Split chapters")).toBeInTheDocument();
    });
  });

  it("shows book title after meta event", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "meta", title: "Pride and Prejudice" }])
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText(/Pride and Prejudice/i)).toBeInTheDocument()
    );
  });

  it("marks Split chapters as done after chapters event", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "chapters", total: 61 }])
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    // "Start reading now" button appears only after splitting is done and chapterCount > 0
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /start reading now/i })).toBeInTheDocument()
    );
  });

  it("redirects to reader after done event (after 1.5s delay)", async () => {
    const { useRouter } = require("next/navigation");
    const push = jest.fn();
    useRouter.mockReturnValue({ push });

    importBookStream.mockReturnValue(makeStream([{ event: "done" }]));
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() => screen.getByText(/Done — opening your book/i));
    act(() => jest.advanceTimersByTime(1500));
    expect(push).toHaveBeenCalledWith("/reader/1342");
  });
});

describe("ImportPage — error handling", () => {
  it("shows error message when stream emits error event", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "error", message: "Gutenberg timeout", stage: "fetching" }])
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText(/Gutenberg timeout/i)).toBeInTheDocument()
    );
  });

  it("shows generic error message on stream throw", async () => {
    importBookStream.mockReturnValue(failingStream(new Error("Network error")));
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText(/Network error/i)).toBeInTheDocument()
    );
  });

  it("shows login-required message on 401 ApiError", async () => {
    importBookStream.mockReturnValue(
      failingStream(new ApiError(401, "Login required"))
    );
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText(/Login required/i)).toBeInTheDocument()
    );
  });
});

describe("ImportPage — abort / cancel", () => {
  it("shows Cancel button during import", async () => {
    importBookStream.mockReturnValue(makeStream([]));
    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeInTheDocument()
    );
  });
});
