/**
 * BulkTranslateTab — status polling, plan generation, job start/stop,
 * confirmation guards, error display, and progress calculation.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import BulkTranslateTab from "@/components/BulkTranslateTab";

const IDLE_STATUS = { running: false, state: null, preview: null };
const RUNNING_STATUS = {
  running: true,
  state: {
    id: 1,
    status: "running",
    target_language: "zh",
    provider: "gemini",
    model: "gemini-2.5-flash",
    dry_run: false,
    total_chapters: 100,
    completed_chapters: 50,
    failed_chapters: 0,
    skipped_chapters: 0,
    requests_made: 50,
    current_book_id: 1342,
    current_book_title: "Pride and Prejudice",
    current_chapter_index: 5,
    last_error: "",
    started_at: "2026-01-01T00:00:00Z",
    ended_at: null,
  },
  preview: null,
};
const EMPTY_HISTORY: never[] = [];

function makeAdminFetch(statusResp = IDLE_STATUS, historyResp = EMPTY_HISTORY) {
  return jest.fn().mockImplementation((path: string) => {
    if (path.includes("/status")) return Promise.resolve(statusResp);
    if (path.includes("/history")) return Promise.resolve(historyResp);
    if (path.includes("/plan")) return Promise.resolve({
      total_books: 2,
      total_chapters: 40,
      total_batches: 4,
      total_words: 80000,
      estimated_minutes_at_rpm: 200,
      estimated_days_at_rpd: 0.28,
      books: [],
    });
    if (path.includes("/start") || path.includes("/stop")) return Promise.resolve({});
    return Promise.resolve({});
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("BulkTranslateTab — status polling", () => {
  it("calls status and history endpoints on mount", async () => {
    const adminFetch = makeAdminFetch();
    render(<BulkTranslateTab adminFetch={adminFetch} />);
    await waitFor(() => {
      expect(adminFetch).toHaveBeenCalledWith("/admin/bulk-translate/status");
      expect(adminFetch).toHaveBeenCalledWith("/admin/bulk-translate/history");
    });
  });

  it("polls every 3 seconds", async () => {
    const adminFetch = makeAdminFetch();
    render(<BulkTranslateTab adminFetch={adminFetch} />);
    await waitFor(() => expect(adminFetch).toHaveBeenCalled());
    const callsBefore = adminFetch.mock.calls.length;

    act(() => { jest.advanceTimersByTime(3000); });
    await waitFor(() => expect(adminFetch.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});

describe("BulkTranslateTab — plan generation", () => {
  it("shows plan estimates after clicking Plan button", async () => {
    const adminFetch = makeAdminFetch();
    render(<BulkTranslateTab adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /plan/i }));

    fireEvent.click(screen.getByRole("button", { name: /plan/i }));

    await waitFor(() => {
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/bulk-translate/plan",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      // Plan results are displayed — chapter count
      expect(screen.getByText(/40/)).toBeInTheDocument();
    });
  });

  it("shows error message when plan request fails", async () => {
    const adminFetch = jest.fn().mockImplementation((path: string) => {
      if (path.includes("/status")) return Promise.resolve(IDLE_STATUS);
      if (path.includes("/history")) return Promise.resolve(EMPTY_HISTORY);
      if (path.includes("/plan")) return Promise.reject(new Error("Network error"));
      return Promise.resolve({});
    });
    render(<BulkTranslateTab adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /plan/i }));

    fireEvent.click(screen.getByRole("button", { name: /plan/i }));
    await waitFor(() => expect(screen.getByText(/Network error/)).toBeInTheDocument());
  });
});

describe("BulkTranslateTab — start/stop job", () => {
  it("calls start endpoint and refreshes status after confirmation", async () => {
    const adminFetch = makeAdminFetch();
    render(<BulkTranslateTab adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /start/i }));

    // Click the "Start real job" button (not dry run)
    fireEvent.click(screen.getByRole("button", { name: /start real/i }));

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/bulk-translate/start",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("does NOT call start endpoint when user cancels confirmation", async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    const adminFetch = makeAdminFetch();
    render(<BulkTranslateTab adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /start real/i }));

    fireEvent.click(screen.getByRole("button", { name: /start real/i }));

    await act(async () => {});
    expect(adminFetch).not.toHaveBeenCalledWith(
      "/admin/bulk-translate/start",
      expect.anything()
    );
  });

  it("shows Stop button and calls stop endpoint when job is running", async () => {
    const adminFetch = makeAdminFetch(RUNNING_STATUS);
    render(<BulkTranslateTab adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /stop/i }));

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/bulk-translate/stop",
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});

describe("BulkTranslateTab — progress display", () => {
  it("shows correct progress percentage when job is running", async () => {
    const adminFetch = makeAdminFetch(RUNNING_STATUS);
    render(<BulkTranslateTab adminFetch={adminFetch} />);
    // 50/100 = 50%
    await waitFor(() => expect(screen.getByText(/50%/)).toBeInTheDocument());
  });

  it("shows current book title while running", async () => {
    const adminFetch = makeAdminFetch(RUNNING_STATUS);
    render(<BulkTranslateTab adminFetch={adminFetch} />);
    await waitFor(() =>
      expect(screen.getByText(/Pride and Prejudice/)).toBeInTheDocument()
    );
  });
});
