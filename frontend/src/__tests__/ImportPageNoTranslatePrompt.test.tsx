/**
 * Regression test for #1739: the "Pre-translate this book?" panel has been
 * removed from the import page (moved to the reader translation sidebar).
 * Verify that the panel never appears, even when source != target language.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import BookImportPage from "@/app/(shell)/import/[bookId]/page";

jest.mock("next/navigation", () => ({
  useParams: jest.fn().mockReturnValue({ bookId: "42" }),
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
  useSearchParams: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(null) }),
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

describe("ImportPage — translate prompt removed (issue #1739)", () => {
  it("does not show translate prompt when source != target language after done event", async () => {
    importBookStream.mockReturnValue(
      makeStream([
        { event: "meta", title: "Faust", source_language: "en" },
        { event: "chapters", total: 5 },
        { event: "done" },
      ])
    );

    render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText(/Done — opening your book/i)).toBeInTheDocument()
    );

    expect(screen.queryByText(/Pre-translate this book/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Translate in background/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Skip for now/i)).not.toBeInTheDocument();
  });

  it("redirects automatically after done without waiting for translation action", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(screen.getByText(/Done — opening your book/i)).toBeInTheDocument()
    );

    act(() => jest.advanceTimersByTime(1200));
    expect(push).toHaveBeenCalledWith("/reader/42");
  });
});
