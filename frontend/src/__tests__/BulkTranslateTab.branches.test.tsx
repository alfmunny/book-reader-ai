/**
 * BulkTranslateTab — branch coverage for missed branches (87.7% → ≥90%).
 *
 * Uncovered branch identified from coverage report (line 364):
 *  - startJob(true) — the "Dry run" button click handler
 *  - dryRun=true confirms with dry-run message (vs real-run message)
 *  - model set → body includes { model } (vs model not set → no model key)
 *  - startJob cancelled → does nothing
 *  - current_chapter_index === null → no chapter display
 *  - stopJob cancelled → does nothing
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BulkTranslateTab from "@/components/BulkTranslateTab";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const IDLE_STATUS = { running: false, state: null, preview: null };

const RUNNING_STATE = {
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
};

function makeFetch({
  status = IDLE_STATUS as any,
  history = [] as any[],
  startReject = null as null | (() => any),
} = {}) {
  return jest.fn().mockImplementation((path: string) => {
    if (path.includes("/status")) return Promise.resolve(status);
    if (path.includes("/history")) return Promise.resolve(history);
    if (path.includes("/plan")) return Promise.resolve({
      total_books: 1,
      total_chapters: 10,
      total_batches: 1,
      total_words: 5000,
      estimated_minutes_at_rpm: 50,
      estimated_days_at_rpd: 0.07,
      books: [],
    });
    if (path.includes("/start")) {
      if (startReject) return Promise.reject(startReject());
      return Promise.resolve({});
    }
    if (path.includes("/stop")) return Promise.resolve({});
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

// ── Line 364: startJob(true) — "Dry run" button ───────────────────────────────

describe("BulkTranslateTab — dry run button startJob(true) (line 364)", () => {
  it("calls start endpoint with dry_run=true when Dry run button clicked", async () => {
    const adminFetch = makeFetch();
    render(<BulkTranslateTab adminFetch={adminFetch} />);

    await waitFor(() => screen.getByRole("button", { name: /dry run/i }));
    fireEvent.click(screen.getByRole("button", { name: /dry run/i }));

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/bulk-translate/start",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"dry_run":true'),
        }),
      ),
    );
  });

  it("shows confirm dialog with dry-run message (not real-run message)", async () => {
    const adminFetch = makeFetch();
    render(<BulkTranslateTab adminFetch={adminFetch} />);

    await waitFor(() => screen.getByRole("button", { name: /dry run/i }));
    fireEvent.click(screen.getByRole("button", { name: /dry run/i }));

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("Dry run"),
    );
    // Should NOT contain the real-run message
    const confirmMsg = (window.confirm as jest.Mock).mock.calls[0][0] as string;
    expect(confirmMsg).not.toContain("Start real bulk translation");
  });

  it("does nothing when dry run confirm is cancelled", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const adminFetch = makeFetch();
    render(<BulkTranslateTab adminFetch={adminFetch} />);

    await waitFor(() => screen.getByRole("button", { name: /dry run/i }));
    const callsBefore = adminFetch.mock.calls.filter(
      (c: any[]) => c[0].includes("/start"),
    ).length;

    fireEvent.click(screen.getByRole("button", { name: /dry run/i }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());

    const callsAfter = adminFetch.mock.calls.filter(
      (c: any[]) => c[0].includes("/start"),
    ).length;
    expect(callsAfter).toBe(callsBefore);
  });

  it("includes model in body when model is selected", async () => {
    const adminFetch = makeFetch();
    render(<BulkTranslateTab adminFetch={adminFetch} />);

    await waitFor(() => screen.getByRole("button", { name: /dry run/i }));

    // Select a model radio
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    const flashRadio = radios.find((r) => r.value === "gemini-2.5-flash");
    if (flashRadio) {
      fireEvent.click(flashRadio);
    }

    fireEvent.click(screen.getByRole("button", { name: /dry run/i }));

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/bulk-translate/start",
        expect.objectContaining({
          body: expect.stringContaining('"model":"gemini-2.5-flash"'),
        }),
      ),
    );
  });

  it("does NOT include model in body when model is empty string", async () => {
    const adminFetch = makeFetch();
    render(<BulkTranslateTab adminFetch={adminFetch} />);

    await waitFor(() => screen.getByRole("button", { name: /dry run/i }));

    // Default model state is "" (empty) — click dry run directly
    // First ensure model is reset to empty by checking the source default
    fireEvent.click(screen.getByRole("button", { name: /dry run/i }));

    await waitFor(() => {
      const calls = adminFetch.mock.calls.filter((c: any[]) =>
        c[0].includes("/start"),
      );
      if (calls.length > 0) {
        const body = JSON.parse(calls[0][1].body);
        // model key should not be present when model is "" (falsy)
        expect(body).not.toHaveProperty("model");
      }
    });
  });
});

// ── current_chapter_index === null → no chapter span shown ───────────────────

describe("BulkTranslateTab — current_chapter_index null (line 226)", () => {
  it("does not show chapter number when current_chapter_index is null", async () => {
    const stateNoChapter = {
      ...RUNNING_STATE,
      current_chapter_index: null,
    };
    const adminFetch = makeFetch({
      status: { running: true, state: stateNoChapter, preview: null },
    });

    render(<BulkTranslateTab adminFetch={adminFetch} />);

    await waitFor(() =>
      screen.getByText(/Now translating/i),
    );

    // "· chapter X" should NOT appear
    expect(screen.queryByText(/· chapter/i)).not.toBeInTheDocument();
  });

  it("shows chapter number when current_chapter_index is set", async () => {
    const adminFetch = makeFetch({
      status: { running: true, state: RUNNING_STATE, preview: null },
    });

    render(<BulkTranslateTab adminFetch={adminFetch} />);

    await waitFor(() =>
      screen.getByText(/· chapter 6/),
    );
  });
});

// ── stopJob cancelled → does not call stop endpoint ──────────────────────────

describe("BulkTranslateTab — stopJob cancelled (line 157)", () => {
  it("does not call stop endpoint when user cancels confirm", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const adminFetch = makeFetch({
      status: { running: true, state: RUNNING_STATE, preview: null },
    });

    render(<BulkTranslateTab adminFetch={adminFetch} />);

    await waitFor(() => screen.getByRole("button", { name: /^stop$/i }));

    const callsBefore = adminFetch.mock.calls.filter(
      (c: any[]) => c[0].includes("/stop"),
    ).length;

    fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());

    const callsAfter = adminFetch.mock.calls.filter(
      (c: any[]) => c[0].includes("/stop"),
    ).length;
    expect(callsAfter).toBe(callsBefore);
  });
});

// ── progressPct = 0 when total_chapters = 0 ──────────────────────────────────

describe("BulkTranslateTab — progress bar zero when total_chapters=0", () => {
  it("does not render progress bar when total_chapters is 0", async () => {
    const stateZeroChapters = {
      ...RUNNING_STATE,
      total_chapters: 0,
      completed_chapters: 0,
    };
    const adminFetch = makeFetch({
      status: { running: false, state: stateZeroChapters, preview: null },
    });

    render(<BulkTranslateTab adminFetch={adminFetch} />);
    await waitFor(() => expect(adminFetch).toHaveBeenCalled());

    // The progress bar div is only rendered when total_chapters > 0
    const progressBar = document.querySelector(".bg-amber-100.rounded-full");
    expect(progressBar).toBeFalsy();
  });
});
