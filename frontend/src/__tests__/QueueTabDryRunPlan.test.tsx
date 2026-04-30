/**
 * Regression tests for #2372: cover QueueTab dry-run, plan, and
 * banner-dismiss interactions that had zero test coverage.
 *
 * Covers lines: 430-461 (runDryRun, runPlan), 551-567 (dismiss banners),
 * 760 (dryRunLang onChange), 803-847 (planResult display).
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QueueTab from "@/components/QueueTab";

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeStatus(running = false) {
  return {
    running,
    state: {
      enabled: true,
      idle: true,
      current_book_id: null,
      current_book_title: "",
      current_target_language: "",
      current_batch_size: 0,
      current_model: "",
      startup_phase: "",
      startup_progress: "",
      last_completed_at: null,
      last_error: "",
      started_at: null,
      requests_made: 0,
      chapters_done: 0,
      chapters_failed: 0,
      waiting_reason: "",
      retry_attempt: 0,
      retry_max: 0,
      retry_delay_seconds: 0,
      retry_reason: "",
      log: [],
    },
    counts: { pending: 0, running: 0, done: 0, failed: 0 },
  };
}

const BASE_SETTINGS = {
  enabled: true,
  has_api_key: true,
  auto_translate_languages: ["zh"],
  rpm: 1000,
  rpd: 10000,
  model: "gemini-2.5-flash",
  model_chain: ["gemini-2.5-flash"],
  max_output_tokens: 7500,
};

const NO_COST = {
  pending_items: 0,
  pending_books: 0,
  estimated_input_tokens: 0,
  estimated_output_tokens: 0,
  per_model: [],
};

function makeAdminFetch(overrides: Record<string, unknown> = {}, running = false) {
  return jest.fn((path: string, opts?: RequestInit) => {
    if (path === "/admin/queue/status")
      return Promise.resolve(overrides.status ?? makeStatus(running));
    if (path === "/admin/queue/settings")
      return Promise.resolve(overrides.settings ?? BASE_SETTINGS);
    if (path.startsWith("/admin/queue/items"))
      return Promise.resolve([]);
    if (path === "/admin/queue/cost-estimate")
      return Promise.resolve(NO_COST);
    const key = `${opts?.method ?? "GET"} ${path}`;
    if (overrides[key] !== undefined)
      return Promise.resolve(overrides[key]);
    return Promise.resolve({});
  });
}

async function renderAndWait(adminFetch: jest.Mock) {
  render(<QueueTab adminFetch={adminFetch} />);
  await waitFor(
    () => expect(screen.queryByText(/loading queue/i)).not.toBeInTheDocument(),
    { timeout: 3000 }
  );
}

// ── runPlan (lines 447-461) ───────────────────────────────────────────────────

describe("QueueTab runPlan (closes #2372)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("clicking Show plan calls /admin/queue/plan POST", async () => {
    const planResult = {
      total_books: 3,
      total_chapters: 12,
      total_batches: 6,
      total_words: 50000,
      estimated_minutes_at_rpm: 10,
      estimated_days_at_rpd: 2,
      books: [
        { id: 1, title: "Book Alpha", chapters_to_translate: 5 },
        { id: 2, title: "Book Beta", chapters_to_translate: 7 },
      ],
    };
    const adminFetch = makeAdminFetch({
      "POST /admin/queue/plan": planResult,
    });

    await renderAndWait(adminFetch);

    await userEvent.click(screen.getByRole("button", { name: /show plan/i }));

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/plan",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("plan result stats grid renders after successful plan call", async () => {
    const planResult = {
      total_books: 4,
      total_chapters: 22,
      total_batches: 11,
      total_words: 80000,
      estimated_minutes_at_rpm: 15,
      estimated_days_at_rpd: 3,
      books: [{ id: 1, title: "My Novel", chapters_to_translate: 22 }],
    };
    const adminFetch = makeAdminFetch({
      "POST /admin/queue/plan": planResult,
    });

    await renderAndWait(adminFetch);
    await userEvent.click(screen.getByRole("button", { name: /show plan/i }));

    await waitFor(() =>
      expect(screen.getAllByText("22").length).toBeGreaterThan(0)
    );
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Books").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Chapters").length).toBeGreaterThan(0);
    expect(screen.getByText("My Novel")).toBeInTheDocument();
  });

  it("plan result shows estimated time labels", async () => {
    const planResult = {
      total_books: 1,
      total_chapters: 5,
      total_batches: 3,
      total_words: 20000,
      estimated_minutes_at_rpm: 8,
      estimated_days_at_rpd: 1,
      books: [],
    };
    const adminFetch = makeAdminFetch({
      "POST /admin/queue/plan": planResult,
    });

    await renderAndWait(adminFetch);
    await userEvent.click(screen.getByRole("button", { name: /show plan/i }));

    await waitFor(() =>
      expect(screen.getByText(/8 min/)).toBeInTheDocument()
    );
    expect(screen.getByText(/1 days/)).toBeInTheDocument();
  });

  it("shows dryRunError when plan API fails", async () => {
    const adminFetch = jest.fn((path: string, opts?: RequestInit) => {
      if (path === "/admin/queue/status") return Promise.resolve(makeStatus());
      if (path === "/admin/queue/settings") return Promise.resolve(BASE_SETTINGS);
      if (path.startsWith("/admin/queue/items")) return Promise.resolve([]);
      if (path === "/admin/queue/cost-estimate") return Promise.resolve(NO_COST);
      if (path === "/admin/queue/plan" && opts?.method === "POST")
        return Promise.reject(new Error("Plan failed: quota exceeded"));
      return Promise.resolve({});
    });

    await renderAndWait(adminFetch);
    await userEvent.click(screen.getByRole("button", { name: /show plan/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/plan failed: quota exceeded/i)
    );
  });
});

// ── runDryRun (lines 430-445) ─────────────────────────────────────────────────

describe("QueueTab runDryRun (closes #2372)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("clicking Dry run calls /admin/queue/dry-run POST", async () => {
    const dryRunResult = {
      preview: { "0": ["Translated paragraph one.", "Translated paragraph two."] },
      preview_book_title: "Test Book",
      total_chapters: 10,
      total_books: 2,
    };
    const adminFetch = makeAdminFetch({
      "POST /admin/queue/dry-run": dryRunResult,
    });

    await renderAndWait(adminFetch);
    await userEvent.click(screen.getByRole("button", { name: /dry run/i }));

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/dry-run",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("dry run result preview paragraphs render after successful call", async () => {
    const dryRunResult = {
      preview: {
        "0": ["First translated paragraph.", "Second translated paragraph."],
      },
      preview_book_title: "Sample Book",
      total_chapters: 5,
      total_books: 1,
    };
    const adminFetch = makeAdminFetch({
      "POST /admin/queue/dry-run": dryRunResult,
    });

    await renderAndWait(adminFetch);
    await userEvent.click(screen.getByRole("button", { name: /dry run/i }));

    await waitFor(() =>
      expect(screen.getByText("First translated paragraph.")).toBeInTheDocument()
    );
    expect(screen.getByText("Second translated paragraph.")).toBeInTheDocument();
    expect(screen.getByText(/Sample Book/)).toBeInTheDocument();
  });

  it("shows dryRunError when dry-run API fails", async () => {
    const adminFetch = jest.fn((path: string, opts?: RequestInit) => {
      if (path === "/admin/queue/status") return Promise.resolve(makeStatus());
      if (path === "/admin/queue/settings") return Promise.resolve(BASE_SETTINGS);
      if (path.startsWith("/admin/queue/items")) return Promise.resolve([]);
      if (path === "/admin/queue/cost-estimate") return Promise.resolve(NO_COST);
      if (path === "/admin/queue/dry-run" && opts?.method === "POST")
        return Promise.reject(new Error("No content available"));
      return Promise.resolve({});
    });

    await renderAndWait(adminFetch);
    await userEvent.click(screen.getByRole("button", { name: /dry run/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/no content available/i)
    );
  });
});

// ── dryRunLang select onChange (line 760) ─────────────────────────────────────

describe("QueueTab dryRunLang select clears results (closes #2372)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("changing language select clears a previous plan result", async () => {
    const planResult = {
      total_books: 2,
      total_chapters: 8,
      total_batches: 4,
      total_words: 30000,
      estimated_minutes_at_rpm: 5,
      estimated_days_at_rpd: 1,
      books: [{ id: 1, title: "Cleared Book", chapters_to_translate: 8 }],
    };
    const adminFetch = makeAdminFetch({
      "POST /admin/queue/plan": planResult,
    });

    await renderAndWait(adminFetch);
    await userEvent.click(screen.getByRole("button", { name: /show plan/i }));

    await waitFor(() =>
      expect(screen.getByText("Cleared Book")).toBeInTheDocument()
    );

    // Change language — should clear plan result
    const langSelect = screen.getByRole("combobox", { name: /preview language/i });
    fireEvent.change(langSelect, { target: { value: "de" } });

    expect(screen.queryByText("Cleared Book")).not.toBeInTheDocument();
  });
});

// ── Dismiss banners (lines 551-567) ──────────────────────────────────────────

describe("QueueTab banner dismiss buttons (closes #2372)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("clicking × on actError banner dismisses it", async () => {
    // actError is set by failed retry/delete actions, not dry-run errors
    const failedItem = { id: 9, book_id: 1, book_title: "Test Book", chapter_index: 0,
      target_language: "zh", status: "failed", priority: 0, attempts: 2,
      last_error: "Timeout", created_at: new Date().toISOString(), queued_by: null };

    const adminFetch = jest.fn((path: string, opts?: RequestInit) => {
      if (path === "/admin/queue/status") return Promise.resolve(makeStatus());
      if (path === "/admin/queue/settings") return Promise.resolve(BASE_SETTINGS);
      if (path === "/admin/queue/cost-estimate") return Promise.resolve(NO_COST);
      if (path.startsWith("/admin/queue/items") && opts?.method === "POST")
        return Promise.reject(new Error("Dismiss me error"));
      if (path.startsWith("/admin/queue/items")) return Promise.resolve([failedItem]);
      return Promise.resolve({});
    });

    await renderAndWait(adminFetch);

    const retryBtn = await screen.findByRole("button", { name: /retry/i });
    await userEvent.click(retryBtn);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/dismiss me error/i)
    );

    await userEvent.click(screen.getByRole("button", { name: /dismiss error/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clicking × on toast success banner dismisses it", async () => {
    // clearAll triggers showToast("Deleted N queue items") on success
    const pendingItem = { id: 1, book_id: 1, book_title: "Book", chapter_index: 0,
      target_language: "zh", status: "pending", priority: 0, attempts: 0,
      last_error: null, created_at: new Date().toISOString(), queued_by: null };

    const adminFetch = jest.fn((path: string, opts?: RequestInit) => {
      if (path === "/admin/queue/status") return Promise.resolve(makeStatus());
      if (path === "/admin/queue/settings") return Promise.resolve(BASE_SETTINGS);
      if (path === "/admin/queue/cost-estimate") return Promise.resolve(NO_COST);
      if (path.startsWith("/admin/queue/items")) return Promise.resolve([pendingItem]);
      if (path === "/admin/queue" && opts?.method === "DELETE")
        return Promise.resolve({ deleted: 1 });
      return Promise.resolve({});
    });

    await renderAndWait(adminFetch);

    // Switch to 'all' filter so Clear Queue button appears
    const allPill = screen.getByRole("button", { name: /^all$/i });
    await userEvent.click(allPill);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /clear queue/i })).toBeInTheDocument()
    );

    // clearAll → confirm → toast appears
    await userEvent.click(screen.getByRole("button", { name: /clear queue/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm action/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /dismiss message/i })).not.toBeNull(),
      { timeout: 3000 }
    );

    await userEvent.click(screen.getByRole("button", { name: /dismiss message/i }));

    expect(screen.queryByRole("button", { name: /dismiss message/i })).not.toBeInTheDocument();
  });
});
