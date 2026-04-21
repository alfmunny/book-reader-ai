/**
 * SeedPopularButton — full branch coverage:
 *
 * - initial render (idle state, no progress panel)
 * - click "Seed all popular books" → confirm → calls start endpoint → refreshes status
 * - user cancels confirm → endpoint NOT called
 * - loading / running state (button disabled, "Seeding…" label)
 * - "Show progress" button appears when state != idle and collapsed
 * - "Hide" button appears when expanded and not running
 * - Stop button inside panel calls stop endpoint
 * - user cancels stop confirm → endpoint NOT called
 * - state.total > 0 → progress bar rendered
 * - state.total == 0 + running → "Planning…" text
 * - state.total == 0 + not running → "No books need downloading."
 * - completed state → done summary line
 * - failed status badge
 * - cancelled status badge
 * - log entries rendered (download + failed events)
 * - onComplete fires exactly once per completion (keyed by started_at)
 * - start error → error message shown
 * - stop error → error message shown
 * - already_cached > 0 → cached count shown in progress line and completion line
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import SeedPopularButton from "@/components/SeedPopularButton";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function idleStatus() {
  return {
    running: false,
    state: {
      status: "idle" as const,
      total: 0,
      current: 0,
      downloaded: 0,
      failed: 0,
      already_cached: 0,
      current_book_id: null,
      current_book_title: "",
      last_error: "",
      started_at: null,
      ended_at: null,
      log: [],
    },
  };
}

function runningStatus(override = {}) {
  return {
    running: true,
    state: {
      status: "running" as const,
      total: 10,
      current: 4,
      downloaded: 3,
      failed: 0,
      already_cached: 1,
      current_book_id: 42,
      current_book_title: "Moby-Dick",
      last_error: "",
      started_at: "2026-01-01T00:00:00Z",
      ended_at: null,
      log: [],
      ...override,
    },
  };
}

function completedStatus(override = {}) {
  return {
    running: false,
    state: {
      status: "completed" as const,
      total: 10,
      current: 10,
      downloaded: 9,
      failed: 1,
      already_cached: 2,
      current_book_id: null,
      current_book_title: "",
      last_error: "",
      started_at: "2026-01-01T00:00:00Z",
      ended_at: "2026-01-01T01:00:00Z",
      log: [],
      ...override,
    },
  };
}

function makeFetch(statusSeq: any[], { startReject = null as any, stopReject = null as any } = {}) {
  let callIdx = 0;
  return jest.fn().mockImplementation((path: string) => {
    if (path.includes("/status")) {
      const s = statusSeq[Math.min(callIdx++, statusSeq.length - 1)];
      return Promise.resolve(s);
    }
    if (path.includes("/start")) {
      if (startReject) return Promise.reject(startReject);
      return Promise.resolve({});
    }
    if (path.includes("/stop")) {
      if (stopReject) return Promise.reject(stopReject);
      return Promise.resolve({});
    }
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

// ── Initial render ─────────────────────────────────────────────────────────────

describe("SeedPopularButton — initial render", () => {
  it("shows 'Seed all popular books' button when idle", async () => {
    const adminFetch = makeFetch([idleStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    expect(screen.getByRole("button", { name: /seed all popular/i })).toBeInTheDocument();
  });

  it("button is enabled when not running", async () => {
    const adminFetch = makeFetch([idleStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    const btn = screen.getByRole("button", { name: /seed all popular/i });
    expect(btn).not.toBeDisabled();
  });

  it("does not show progress panel on initial idle state", async () => {
    const adminFetch = makeFetch([idleStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => expect(adminFetch).toHaveBeenCalled());
    expect(screen.queryByText("Seed popular books")).not.toBeInTheDocument();
  });
});

// ── Polling ────────────────────────────────────────────────────────────────────

describe("SeedPopularButton — polling", () => {
  it("calls status endpoint on mount", async () => {
    const adminFetch = makeFetch([idleStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith("/admin/books/seed-popular/status")
    );
  });

  it("polls every 2 seconds", async () => {
    const adminFetch = makeFetch([idleStatus(), idleStatus(), idleStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => expect(adminFetch).toHaveBeenCalledTimes(1));

    act(() => { jest.advanceTimersByTime(2000); });
    await waitFor(() => expect(adminFetch).toHaveBeenCalledTimes(2));
  });
});

// ── Start flow ─────────────────────────────────────────────────────────────────

describe("SeedPopularButton — start flow", () => {
  it("calls start endpoint and refreshes when user confirms", async () => {
    const adminFetch = makeFetch([idleStatus(), runningStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);

    fireEvent.click(screen.getByRole("button", { name: /seed all popular/i }));

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/books/seed-popular/start",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("does NOT call start when user cancels confirm", async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    const adminFetch = makeFetch([idleStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);

    fireEvent.click(screen.getByRole("button", { name: /seed all popular/i }));

    await act(async () => {});
    expect(adminFetch).not.toHaveBeenCalledWith(
      "/admin/books/seed-popular/start",
      expect.anything()
    );
  });

  it("shows error message when start throws an Error", async () => {
    // Return a non-idle state after start so the expanded panel is rendered
    // (the error display lives inside the expanded panel)
    const failedState = {
      running: false,
      state: {
        status: "failed" as const,
        total: 0, current: 0, downloaded: 0, failed: 0, already_cached: 0,
        current_book_id: null, current_book_title: "",
        last_error: "", started_at: null, ended_at: null, log: [],
      },
    };
    const adminFetch = makeFetch([failedState, failedState], {
      startReject: new Error("Network error"),
    });
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /show progress/i }));

    fireEvent.click(screen.getByRole("button", { name: /seed all popular/i }));

    await waitFor(() =>
      expect(screen.getByText("Network error")).toBeInTheDocument()
    );
  });

  it("shows 'Start failed' fallback when start throws a non-Error", async () => {
    const failedState = {
      running: false,
      state: {
        status: "failed" as const,
        total: 0, current: 0, downloaded: 0, failed: 0, already_cached: 0,
        current_book_id: null, current_book_title: "",
        last_error: "", started_at: null, ended_at: null, log: [],
      },
    };
    const adminFetch = makeFetch([failedState, failedState], { startReject: "oops" });
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /show progress/i }));

    fireEvent.click(screen.getByRole("button", { name: /seed all popular/i }));

    await waitFor(() =>
      expect(screen.getByText("Start failed")).toBeInTheDocument()
    );
  });
});

// ── Running state ─────────────────────────────────────────────────────────────

describe("SeedPopularButton — running state", () => {
  it("button shows 'Seeding…' and is disabled when running", async () => {
    const adminFetch = makeFetch([runningStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByText("Seeding…"));
    expect(screen.getByRole("button", { name: /seeding/i })).toBeDisabled();
  });

  it("shows progress bar and book title when running with total > 0", async () => {
    const adminFetch = makeFetch([runningStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByText("Seeding…"));

    // "Show progress" button appears in the collapsed state
    const showBtn = screen.getByRole("button", { name: /show progress/i });
    fireEvent.click(showBtn);

    // Wait for the full panel to render with current book title
    await waitFor(() => expect(screen.getByText(/Moby-Dick/)).toBeInTheDocument());
    expect(screen.getByText(/4 \/ 10 processed/)).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("shows 'Planning…' when running but total is 0", async () => {
    const planningStatus = {
      ...runningStatus({ total: 0, current: 0 }),
    };
    const adminFetch = makeFetch([planningStatus]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByText("Seeding…"));

    const showBtn = screen.getByRole("button", { name: /show progress/i });
    fireEvent.click(showBtn);

    expect(screen.getByText("Planning…")).toBeInTheDocument();
  });

  it("shows already_cached in progress line", async () => {
    const adminFetch = makeFetch([runningStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByText("Seeding…"));

    fireEvent.click(screen.getByRole("button", { name: /show progress/i }));

    expect(screen.getByText(/1 already cached/)).toBeInTheDocument();
  });
});

// ── Stop flow ─────────────────────────────────────────────────────────────────

describe("SeedPopularButton — stop flow", () => {
  it("calls stop endpoint when user confirms stop", async () => {
    const adminFetch = makeFetch([runningStatus(), idleStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByText("Seeding…"));

    fireEvent.click(screen.getByRole("button", { name: /show progress/i }));

    const stopBtn = screen.getByRole("button", { name: /stop/i });
    fireEvent.click(stopBtn);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/books/seed-popular/stop",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("does NOT call stop when user cancels confirm", async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    const adminFetch = makeFetch([runningStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByText("Seeding…"));

    fireEvent.click(screen.getByRole("button", { name: /show progress/i }));
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await act(async () => {});
    expect(adminFetch).not.toHaveBeenCalledWith(
      "/admin/books/seed-popular/stop",
      expect.anything()
    );
  });

  it("shows error when stop throws a non-Error", async () => {
    const adminFetch = makeFetch([runningStatus()], { stopReject: "fail" });
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByText("Seeding…"));

    fireEvent.click(screen.getByRole("button", { name: /show progress/i }));
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await waitFor(() =>
      expect(screen.getByText("Stop failed")).toBeInTheDocument()
    );
  });
});

// ── Completed state ───────────────────────────────────────────────────────────

describe("SeedPopularButton — completed state", () => {
  it("shows completion summary with downloaded, cached, failed counts", async () => {
    const adminFetch = makeFetch([completedStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /show progress/i }));

    fireEvent.click(screen.getByRole("button", { name: /show progress/i }));

    await waitFor(() => expect(screen.getByText(/downloaded 9/)).toBeInTheDocument());
    expect(screen.getByText(/cached 2/)).toBeInTheDocument();
    expect(screen.getByText(/failed 1/)).toBeInTheDocument();
  });

  it("shows 'Hide' button when expanded and not running", async () => {
    const adminFetch = makeFetch([completedStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /show progress/i }));

    fireEvent.click(screen.getByRole("button", { name: /show progress/i }));
    expect(screen.getByRole("button", { name: /hide/i })).toBeInTheDocument();
  });

  it("hides panel when 'Hide' is clicked", async () => {
    const adminFetch = makeFetch([completedStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /show progress/i }));

    fireEvent.click(screen.getByRole("button", { name: /show progress/i }));
    fireEvent.click(screen.getByRole("button", { name: /hide/i }));

    expect(screen.queryByText(/downloaded/)).not.toBeInTheDocument();
  });

  it("fires onComplete callback exactly once per completion", async () => {
    const onComplete = jest.fn();
    // First call: running, second call: completed
    const adminFetch = makeFetch([completedStatus()]);
    render(<SeedPopularButton adminFetch={adminFetch} onComplete={onComplete} />);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    // Second poll returning same started_at should NOT fire again
    act(() => { jest.advanceTimersByTime(2000); });
    await waitFor(() => expect(adminFetch).toHaveBeenCalledTimes(2));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows 'No books need downloading.' when total == 0 and not running", async () => {
    const nothingStatus = {
      running: false,
      state: {
        status: "completed" as const,
        total: 0,
        current: 0,
        downloaded: 0,
        failed: 0,
        already_cached: 5,
        current_book_id: null,
        current_book_title: "",
        last_error: "",
        started_at: "2026-01-01T00:00:00Z",
        ended_at: "2026-01-01T00:01:00Z",
        log: [],
      },
    };
    const adminFetch = makeFetch([nothingStatus]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /show progress/i }));

    fireEvent.click(screen.getByRole("button", { name: /show progress/i }));

    expect(screen.getByText("No books need downloading.")).toBeInTheDocument();
  });
});

// ── Status badge variants ─────────────────────────────────────────────────────

describe("SeedPopularButton — status badge variants", () => {
  function renderWithStatus(statusVal: string) {
    const s = {
      running: false,
      state: {
        status: statusVal as any,
        total: 5,
        current: 2,
        downloaded: 2,
        failed: 0,
        already_cached: 0,
        current_book_id: null,
        current_book_title: "",
        last_error: "",
        started_at: "2026-01-01T00:00:00Z",
        ended_at: null,
        log: [],
      },
    };
    const adminFetch = makeFetch([s]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    return adminFetch;
  }

  it("shows 'failed' status badge", async () => {
    renderWithStatus("failed");
    await waitFor(() => screen.getByRole("button", { name: /show progress/i }));
    fireEvent.click(screen.getByRole("button", { name: /show progress/i }));
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("shows 'cancelled' status badge", async () => {
    renderWithStatus("cancelled");
    await waitFor(() => screen.getByRole("button", { name: /show progress/i }));
    fireEvent.click(screen.getByRole("button", { name: /show progress/i }));
    expect(screen.getByText("cancelled")).toBeInTheDocument();
  });
});

// ── Log entries ───────────────────────────────────────────────────────────────

describe("SeedPopularButton — log entries", () => {
  it("renders downloaded and failed log entries", async () => {
    const withLog = {
      running: false,
      state: {
        status: "completed" as const,
        total: 2,
        current: 2,
        downloaded: 1,
        failed: 1,
        already_cached: 0,
        current_book_id: null,
        current_book_title: "",
        last_error: "",
        started_at: "2026-01-01T00:00:00Z",
        ended_at: "2026-01-01T00:05:00Z",
        log: [
          { event: "downloaded" as const, book_id: 1, title: "Great Gatsby", chars: 150000 },
          { event: "failed" as const, book_id: 2, title: "Bad Book", error: "404 Not Found" },
        ],
      },
    };
    const adminFetch = makeFetch([withLog]);
    render(<SeedPopularButton adminFetch={adminFetch} />);
    await waitFor(() => screen.getByRole("button", { name: /show progress/i }));
    fireEvent.click(screen.getByRole("button", { name: /show progress/i }));

    // The log section has a <details> element
    expect(screen.getByText(/Recent events \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Great Gatsby/)).toBeInTheDocument();
    expect(screen.getByText(/Bad Book/)).toBeInTheDocument();
    expect(screen.getByText(/404 Not Found/)).toBeInTheDocument();
    // chars displayed as K
    expect(screen.getByText(/150K/)).toBeInTheDocument();
  });
});
