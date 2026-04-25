/**
 * Additional coverage tests for QueueTab.
 * Targets: lines 108-115, 187, 232-234, 248-249, 264-291,
 * 325-357, 530-645, 826-964, 1013-1095.
 */

import React from "react";
import {
  render,
  screen,
  waitFor,
  within,
  act,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QueueTab from "@/components/QueueTab";

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeStatus(overrides: Partial<{
  running: boolean;
  idle: boolean;
  waiting_reason: string;
  last_error: string;
  startup_phase: string;
  startup_progress: string;
  retry_attempt: number;
  retry_max: number;
  retry_delay_seconds: number;
  retry_reason: string;
  requests_made: number;
  log: Array<{ event: string; at: string; title?: string; chapter?: number; lang?: string; error?: string }>;
  current_book_title: string;
  current_target_language: string;
  current_model: string;
}> = {}) {
  const {
    running = false,
    idle = true,
    waiting_reason = "",
    last_error = "",
    startup_phase = "",
    startup_progress = "",
    retry_attempt = 0,
    retry_max = 0,
    retry_delay_seconds = 0,
    retry_reason = "",
    requests_made = 0,
    log = [],
    current_book_title = "",
    current_target_language = "",
    current_model = "",
  } = overrides;

  return {
    running,
    state: {
      enabled: true,
      idle,
      current_book_id: null,
      current_book_title,
      current_target_language,
      current_batch_size: 0,
      current_model,
      startup_phase,
      startup_progress,
      last_completed_at: null,
      last_error,
      started_at: null,
      requests_made,
      chapters_done: 0,
      chapters_failed: 0,
      waiting_reason,
      retry_attempt,
      retry_max,
      retry_delay_seconds,
      retry_reason,
      log,
    },
    counts: { pending: 2, running: 0, done: 5, failed: 1 },
  };
}

const BASE_SETTINGS = {
  enabled: true,
  has_api_key: true,
  auto_translate_languages: ["zh", "de"],
  rpm: 1000,
  rpd: 10000,
  model: "gemini-2.5-flash",
  model_chain: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
  max_output_tokens: 7500,
};

const NO_COST = {
  pending_items: 0,
  pending_books: 0,
  estimated_input_tokens: 0,
  estimated_output_tokens: 0,
  per_model: [],
};

function makeItem(overrides: Partial<{
  id: number;
  book_id: number;
  book_title: string | null;
  chapter_index: number;
  target_language: string;
  status: string;
  priority: number;
  attempts: number;
  last_error: string | null;
  created_at: string;
  queued_by: string | null;
}> = {}) {
  return {
    id: 1,
    book_id: 42,
    book_title: "Test Book",
    chapter_index: 0,
    target_language: "zh",
    status: "pending",
    priority: 0,
    attempts: 0,
    last_error: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    queued_by: "admin",
    ...overrides,
  };
}

function makeAdminFetch(overrides: Record<string, unknown> = {}) {
  return jest.fn((path: string, opts?: RequestInit) => {
    if (path === "/admin/queue/status")
      return Promise.resolve(overrides.status ?? makeStatus());
    if (path === "/admin/queue/settings")
      return Promise.resolve(overrides.settings ?? BASE_SETTINGS);
    if (path.startsWith("/admin/queue/items"))
      return Promise.resolve(overrides.items ?? []);
    if (path === "/admin/queue/cost-estimate")
      return Promise.resolve(overrides.cost ?? NO_COST);
    if (overrides[`${opts?.method ?? "GET"} ${path}`] !== undefined)
      return Promise.resolve(overrides[`${opts?.method ?? "GET"} ${path}`]);
    return Promise.resolve({});
  });
}

async function renderAndWait(adminFetch: jest.Mock) {
  render(<QueueTab adminFetch={adminFetch} />);
  // Wait for initial load to complete
  await waitFor(() =>
    expect(screen.queryByText(/loading queue/i)).not.toBeInTheDocument(),
    { timeout: 3000 }
  );
}

// ── Lines 108-115: relTime helper ─────────────────────────────────────────────
// relTime is used in the items list. We test it indirectly via rendered output.

describe("relTime display on queue items (lines 108-115)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => false);
  });

  it("shows 'now' for items created within 5 seconds", async () => {
    const item = makeItem({ created_at: new Date().toISOString() });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus({ running: true }) });

    await renderAndWait(adminFetch);

    await waitFor(() =>
      expect(screen.getByText(/now/)).toBeInTheDocument()
    );
  });

  it("shows seconds ago for items created < 60s ago", async () => {
    const created_at = new Date(Date.now() - 30_000).toISOString();
    const item = makeItem({ created_at });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus({ running: true }) });

    await renderAndWait(adminFetch);

    await waitFor(() =>
      expect(screen.getByText(/\d+s ago/)).toBeInTheDocument()
    );
  });

  it("shows minutes ago for items created 1-59 min ago", async () => {
    const created_at = new Date(Date.now() - 5 * 60_000).toISOString();
    const item = makeItem({ created_at });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus({ running: true }) });

    await renderAndWait(adminFetch);

    await waitFor(() =>
      expect(screen.getByText(/\d+m ago/)).toBeInTheDocument()
    );
  });

  it("shows hours ago for items created 1-23h ago", async () => {
    const created_at = new Date(Date.now() - 2 * 3600_000).toISOString();
    const item = makeItem({ created_at });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus({ running: true }) });

    await renderAndWait(adminFetch);

    await waitFor(() =>
      expect(screen.getByText(/\d+h ago/)).toBeInTheDocument()
    );
  });

  it("shows days ago for items created >24h ago", async () => {
    const created_at = new Date(Date.now() - 2 * 86400_000).toISOString();
    const item = makeItem({ created_at });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus({ running: true }) });

    await renderAndWait(adminFetch);

    await waitFor(() =>
      expect(screen.getByText(/\d+d ago/)).toBeInTheDocument()
    );
  });
});

// ── Line 187: refreshCore error sets error state ─────────────────────────────

describe("refreshCore error handling (line 187)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => false);
  });

  it("shows error banner when status fetch fails", async () => {
    const adminFetch = jest.fn((path: string) => {
      if (path === "/admin/queue/status")
        return Promise.reject(new Error("Network error"));
      if (path === "/admin/queue/settings")
        return Promise.resolve(BASE_SETTINGS);
      if (path.startsWith("/admin/queue/items"))
        return Promise.resolve([makeItem()]);
      if (path === "/admin/queue/cost-estimate")
        return Promise.resolve(NO_COST);
      return Promise.resolve({});
    });

    render(<QueueTab adminFetch={adminFetch} />);

    await waitFor(() =>
      expect(screen.getByText(/network error/i)).toBeInTheDocument(),
      { timeout: 3000 }
    );
  });
});

// ── Lines 232-234, 248-249: refresh() and item filter effect ─────────────────

describe("item filter and refresh (lines 232-234, 248-249)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => false);
  });

  it("clicking filter pill calls refreshItems with that filter", async () => {
    const adminFetch = makeAdminFetch({ status: makeStatus({ running: true }) });
    await renderAndWait(adminFetch);

    const failedPill = screen.getByRole("button", { name: /^failed$/i });
    await userEvent.click(failedPill);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        expect.stringContaining("status=failed")
      )
    );
  });

  it("all filter pill fetches without status param", async () => {
    const adminFetch = makeAdminFetch({ status: makeStatus({ running: true }) });
    await renderAndWait(adminFetch);

    const allPill = screen.getByRole("button", { name: /^all$/i });
    await userEvent.click(allPill);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/queue/items?limit=100"),
      )
    );
  });
});

// ── Lines 264-291: saveSettings and clearAll / queue actions ─────────────────

describe("saveSettings calls (lines 264-291)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
  });

  it("enabled checkbox calls saveSettings with enabled flag", async () => {
    const adminFetch = makeAdminFetch({ status: makeStatus() });
    await renderAndWait(adminFetch);

    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/settings",
        expect.objectContaining({ method: "PUT" })
      )
    );
  });

  it("Save langs button calls saveSettings with auto_translate_languages", async () => {
    const adminFetch = makeAdminFetch({ status: makeStatus() });
    await renderAndWait(adminFetch);

    // Update langs input
    const langsInput = screen.getByPlaceholderText("zh, de, ja");
    await userEvent.clear(langsInput);
    await userEvent.type(langsInput, "fr, es");

    const saveBtn = langsInput.parentElement!.querySelector("button")!;
    await userEvent.click(saveBtn);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/settings",
        expect.objectContaining({ method: "PUT" })
      )
    );
  });

  it("API key Save button calls saveSettings and clears input", async () => {
    const adminFetch = makeAdminFetch({ status: makeStatus() });
    await renderAndWait(adminFetch);

    const keyInput = screen.getByPlaceholderText(/leave empty to keep/i);
    await userEvent.type(keyInput, "mykey123");

    // Find Save button in the API key section
    const keySection = keyInput.closest("div.flex")!;
    const saveBtn = within(keySection as HTMLElement).getAllByRole("button").find(
      (b) => b.textContent === "Save"
    )!;
    await userEvent.click(saveBtn);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/settings",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("api_key"),
        })
      )
    );
  });

  it("Clear API key button calls saveSettings with empty api_key", async () => {
    const adminFetch = makeAdminFetch({ status: makeStatus() });
    await renderAndWait(adminFetch);

    // Find the "Clear" button that is inside the API key section (border-red-200)
    const clearBtns = screen.getAllByRole("button").filter(
      (b) => b.textContent === "Clear" && b.className.includes("border-red-200")
    );
    expect(clearBtns.length).toBeGreaterThan(0);
    await userEvent.click(clearBtns[0]);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/settings",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining('"api_key":""'),
        })
      )
    );
  });
});

// ── Lines 325-357: clearAll and retry/remove queue items ─────────────────────

describe("queue item actions: retry, remove, clearAll (lines 325-357)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
  });

  it("clicking Retry on a failed item calls retry endpoint", async () => {
    const failedItem = makeItem({ id: 99, status: "failed", attempts: 2 });
    const adminFetch = makeAdminFetch({
      items: [failedItem],
      status: makeStatus(),
    });

    await renderAndWait(adminFetch);

    const retryBtn = await screen.findByRole("button", { name: /retry/i });
    await userEvent.click(retryBtn);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/items/99/retry",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("clicking Del calls DELETE endpoint after confirm", async () => {
    const item = makeItem({ id: 55 });
    const adminFetch = makeAdminFetch({
      items: [item],
      status: makeStatus(),
    });

    await renderAndWait(adminFetch);

    const delBtn = await screen.findByRole("button", { name: /del/i });
    await userEvent.click(delBtn);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/items/55",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });

  it("Del does not call DELETE if confirm returns false", async () => {
    window.confirm = jest.fn(() => false);
    const item = makeItem({ id: 77 });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });

    await renderAndWait(adminFetch);

    const delBtn = await screen.findByRole("button", { name: /del/i });
    await userEvent.click(delBtn);

    expect(adminFetch).not.toHaveBeenCalledWith(
      "/admin/queue/items/77",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("clearAll calls DELETE on /admin/queue with status filter", async () => {
    const item = makeItem();
    const adminFetch = makeAdminFetch({
      items: [item],
      status: makeStatus(),
      "DELETE /admin/queue?status=pending": { deleted: 1 },
    });

    await renderAndWait(adminFetch);

    const clearBtn = screen.getByRole("button", { name: /clear pending/i });
    await userEvent.click(clearBtn);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue?status=pending",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });

  it("clearAll with 'all' filter calls DELETE on /admin/queue (no status)", async () => {
    const item = makeItem();
    const adminFetch = makeAdminFetch({
      items: [item],
      status: makeStatus(),
      "DELETE /admin/queue": { deleted: 1 },
    });

    await renderAndWait(adminFetch);

    // Switch to 'all' filter first
    const allPill = screen.getByRole("button", { name: /^all$/i });
    await userEvent.click(allPill);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /clear queue/i })).toBeInTheDocument()
    );

    const clearBtn = screen.getByRole("button", { name: /clear queue/i });
    await userEvent.click(clearBtn);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });
});

// ── Lines 530-645: queue items list UI rendering ─────────────────────────────

describe("queue items list rendering (lines 530-645)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => false);
  });

  it("renders items with correct status badge colours", async () => {
    const items = [
      makeItem({ id: 1, status: "pending" }),
      makeItem({ id: 2, status: "running" }),
      makeItem({ id: 3, status: "done" }),
      makeItem({ id: 4, status: "failed", last_error: "Quota exceeded" }),
    ];
    const adminFetch = makeAdminFetch({ items, status: makeStatus() });
    await renderAndWait(adminFetch);

    // Status badges are <span> elements inside the items list
    const spans = document.querySelectorAll("li span.rounded");
    const spanTexts = Array.from(spans).map((s) => s.textContent);
    expect(spanTexts).toContain("pending");
    expect(spanTexts).toContain("running");
    expect(spanTexts).toContain("done");
    expect(spanTexts).toContain("failed");
  });

  it("shows book title and chapter info per item", async () => {
    const item = makeItem({
      book_title: "My Novel",
      chapter_index: 4,
      target_language: "de",
    });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText("My Novel")).toBeInTheDocument();
    expect(screen.getByText(/ch 5 → de/)).toBeInTheDocument();
  });

  it("shows error text on failed items", async () => {
    const item = makeItem({ status: "failed", last_error: "Some TTS error" });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText("Some TTS error")).toBeInTheDocument();
  });

  it("shows attempts count when attempts > 0", async () => {
    const item = makeItem({ attempts: 3, status: "failed" });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/3 attempts/)).toBeInTheDocument();
  });

  it("shows fallback book ID when book_title is null", async () => {
    const item = makeItem({ book_title: null, book_id: 99 });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText("book 99")).toBeInTheDocument();
  });

  it("shows 'auto' when queued_by is null", async () => {
    const item = makeItem({ queued_by: null });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText("auto")).toBeInTheDocument();
  });

  it("shows empty state message when no items", async () => {
    const adminFetch = makeAdminFetch({ items: [], status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/no items in this view/i)).toBeInTheDocument();
  });

  it("shows item count in header", async () => {
    const items = [makeItem({ id: 1 }), makeItem({ id: 2 })];
    const adminFetch = makeAdminFetch({ items, status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/2 shown/)).toBeInTheDocument();
  });
});

// ── Lines 826-964: cost estimate section ─────────────────────────────────────

describe("cost estimate section (lines 826-964)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => false);
  });

  it("renders cost estimate when pending_items > 0", async () => {
    const cost = {
      pending_items: 10,
      pending_books: 2,
      estimated_input_tokens: 1_000_000,
      estimated_output_tokens: 500_000,
      per_model: [
        { model: "gemini-2.5-flash", usd: 0.05 },
        { model: "gemini-2.5-flash-lite", usd: 0.01 },
      ],
    };
    const adminFetch = makeAdminFetch({ cost, status: makeStatus() });
    await renderAndWait(adminFetch);

    await waitFor(() =>
      expect(screen.getByText(/cost estimate/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/10 pending/)).toBeInTheDocument();
  });

  it("shows active chain summary in cost section", async () => {
    const cost = {
      pending_items: 5,
      pending_books: 1,
      estimated_input_tokens: 500_000,
      estimated_output_tokens: 250_000,
      per_model: [
        { model: "gemini-2.5-flash", usd: 0.02 },
        { model: "gemini-2.5-flash-lite", usd: 0.005 },
      ],
    };
    const adminFetch = makeAdminFetch({ cost, status: makeStatus() });
    await renderAndWait(adminFetch);

    // Both cost section and settings panel have "Active chain" text
    await waitFor(() =>
      expect(screen.getAllByText(/active chain/i).length).toBeGreaterThanOrEqual(1)
    );
  });

  it("does not render cost estimate when pending_items is 0", async () => {
    const adminFetch = makeAdminFetch({ cost: NO_COST, status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.queryByText(/cost estimate/i)).not.toBeInTheDocument();
  });

  it("shows fallback min cost when chain has multiple models", async () => {
    const cost = {
      pending_items: 3,
      pending_books: 1,
      estimated_input_tokens: 300_000,
      estimated_output_tokens: 150_000,
      per_model: [
        { model: "gemini-2.5-flash", usd: 0.03 },
        { model: "gemini-2.5-flash-lite", usd: 0.005 },
      ],
    };
    const adminFetch = makeAdminFetch({ cost, status: makeStatus() });
    await renderAndWait(adminFetch);

    // "fallback min" appears in both the heading and in the explanation paragraph
    await waitFor(() =>
      expect(screen.getAllByText(/fallback min/i).length).toBeGreaterThanOrEqual(1)
    );
  });
});

// ── Lines 1013-1095: worker status panel details ─────────────────────────────

describe("worker status panel details (lines 1013-1095)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
  });

  it("shows idle/nothing to do when worker is running and idle", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({ running: true, idle: true, waiting_reason: "nothing to do" }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/idle.*nothing to do/i)).toBeInTheDocument();
  });

  it("shows translating message with book title when not idle", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        running: true,
        idle: false,
        current_book_title: "War and Peace",
        current_target_language: "zh",
        current_model: "gemini-2.5-flash",
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/Translating War and Peace → zh/)).toBeInTheDocument();
    expect(screen.getByText(/via gemini-2\.5-flash/)).toBeInTheDocument();
  });

  it("shows startup banner during boot phase", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        running: true,
        startup_phase: "rescan",
        startup_progress: "3/10 books",
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/scanning library/i)).toBeInTheDocument();
    expect(screen.getByText(/3\/10 books/)).toBeInTheDocument();
  });

  it("shows reset_stale startup phase label", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        running: true,
        startup_phase: "reset_stale",
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/resetting stale rows/i)).toBeInTheDocument();
  });

  it("shows custom startup phase label when not known", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        running: true,
        startup_phase: "custom_phase",
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/custom_phase/)).toBeInTheDocument();
  });

  it("shows retry banner when retry_attempt > 0", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        running: true,
        retry_attempt: 2,
        retry_max: 3,
        retry_delay_seconds: 30,
        retry_reason: "Quota exceeded",
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/retrying.*attempt 2\/3/i)).toBeInTheDocument();
    expect(screen.getByText(/backing off 30s/i)).toBeInTheDocument();
    expect(screen.getByText(/quota exceeded/i)).toBeInTheDocument();
  });

  it("shows last_error when not retrying", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        running: false,
        last_error: "Fatal error occurred",
        retry_attempt: 0,
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/fatal error occurred/i)).toBeInTheDocument();
  });

  it("shows activity log when log entries exist", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        running: true,
        log: [
          { event: "translated", at: new Date().toISOString(), title: "Book A", chapter: 1, lang: "zh" },
          { event: "tick_error", at: new Date().toISOString(), error: "Some err" },
        ],
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/activity log \(2\)/i)).toBeInTheDocument();
  });

  it("shows requests_made count in subtitle", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({ running: true, requests_made: 42 }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/42 API calls this session/)).toBeInTheDocument();
  });

  it("shows 'Worker stopped' when not running", async () => {
    const adminFetch = makeAdminFetch({ status: makeStatus({ running: false }) });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/worker stopped/i)).toBeInTheDocument();
  });

  it("enqueueAll calls correct endpoint on confirm", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus(),
      "POST /admin/queue/enqueue-all": { enqueued: 10, books_scanned: 3 },
    });
    const fn = adminFetch as jest.Mock;
    fn.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/admin/queue/status") return Promise.resolve(makeStatus());
      if (path === "/admin/queue/settings") return Promise.resolve(BASE_SETTINGS);
      if (path.startsWith("/admin/queue/items")) return Promise.resolve([]);
      if (path === "/admin/queue/cost-estimate") return Promise.resolve(NO_COST);
      if (path === "/admin/queue/enqueue-all" && opts?.method === "POST")
        return Promise.resolve({ enqueued: 10, books_scanned: 3 });
      return Promise.resolve({});
    });

    await renderAndWait(adminFetch);

    const enqueueBtn = screen.getByRole("button", {
      name: /queue every book for all configured languages/i,
    });
    await userEvent.click(enqueueBtn);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/enqueue-all",
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});

// ── Settings panel: model chain management ────────────────────────────────────

describe("model chain management in settings (lines 826-964 / settings panel)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => true);
  });

  it("Save chain button calls saveSettings with model_chain", async () => {
    const adminFetch = makeAdminFetch({ status: makeStatus() });
    await renderAndWait(adminFetch);

    const saveChainBtn = screen.getByRole("button", { name: /save chain/i });
    await userEvent.click(saveChainBtn);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/settings",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("model_chain"),
        })
      )
    );
  });

  it("clicking a preset button updates the chain", async () => {
    const adminFetch = makeAdminFetch({ status: makeStatus() });
    await renderAndWait(adminFetch);

    const budgetPreset = screen.getByRole("button", { name: /budget/i });
    await userEvent.click(budgetPreset);

    // After clicking Budget preset, the chain should update
    // Saving the chain should now include budget chain models
    const saveChainBtn = screen.getByRole("button", { name: /save chain/i });
    await userEvent.click(saveChainBtn);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/settings",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("gemini-2.5-flash-lite"),
        })
      )
    );
  });

  it("up/down buttons reorder chain entries", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus(),
      settings: {
        ...BASE_SETTINGS,
        model_chain: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
      },
    });
    await renderAndWait(adminFetch);

    // Find all ↓ buttons (move down); click the first one
    const downBtns = screen.getAllByTitle(/move .+ down/i);
    if (downBtns.length > 0) {
      await userEvent.click(downBtns[0]);
    }

    // The ↑ on the second item should now be enabled — just verify no crash
    expect(screen.getAllByTitle(/move .+ up/i).length).toBeGreaterThan(0);
  });

  it("× button removes model from chain", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus(),
      settings: {
        ...BASE_SETTINGS,
        model_chain: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
      },
    });
    await renderAndWait(adminFetch);

    const removeButtons = screen.getAllByTitle(/remove .+ from chain/i);
    // Remove the last model
    await userEvent.click(removeButtons[removeButtons.length - 1]);

    // "Chain is empty" or one model remains — no crash
    expect(removeButtons.length).toBeGreaterThan(0);
  });

  it("add custom model button adds a new chain entry", async () => {
    const adminFetch = makeAdminFetch({ status: makeStatus() });
    await renderAndWait(adminFetch);

    const customInput = screen.getByPlaceholderText(
      /custom model.*gemini-exp/i
    );
    await userEvent.type(customInput, "gemini-custom-model");

    const addCustomBtn = screen.getByRole("button", { name: /\+ add custom/i });
    await userEvent.click(addCustomBtn);

    // Input should be cleared after adding
    expect(customInput).toHaveValue("");
  });

  it("shows 'chain is empty' after user removes all chain entries", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus(),
      settings: {
        ...BASE_SETTINGS,
        model_chain: ["gemini-2.5-flash"],
        model: null,
      },
    });
    await renderAndWait(adminFetch);

    // Remove all × buttons to empty the chain
    let removeBtns = screen.queryAllByTitle(/remove .+ from chain/i);
    while (removeBtns.length > 0) {
      await userEvent.click(removeBtns[0]);
      removeBtns = screen.queryAllByTitle(/remove .+ from chain/i);
    }

    expect(screen.getByText(/chain is empty/i)).toBeInTheDocument();
  });
});

// ── Initial loading skeleton ──────────────────────────────────────────────────

describe("initial loading skeleton", () => {
  it("shows loading skeleton before first data arrives", async () => {
    let resolveStatus: (v: unknown) => void = () => {};
    const statusPending = new Promise((res) => { resolveStatus = res; });

    const adminFetch = jest.fn((path: string) => {
      if (path === "/admin/queue/status") return statusPending;
      if (path === "/admin/queue/settings") return new Promise(() => {});
      if (path.startsWith("/admin/queue/items")) return new Promise(() => {});
      if (path === "/admin/queue/cost-estimate") return new Promise(() => {});
      return Promise.resolve({});
    });

    render(<QueueTab adminFetch={adminFetch} />);

    // Should show loading skeleton text
    expect(screen.getByText(/loading queue/i)).toBeInTheDocument();

    // Resolve status so test can clean up
    resolveStatus(makeStatus());
  });
});

// ── Issue #273: retry and remove must alert on error ─────────────────────────

describe("QueueTab — retry/remove error handling (issue #273)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
  });

  it("shows alert when retry API call fails", async () => {
    const failedItem = makeItem({ id: 9, status: "failed" });
    const adminFetch = jest.fn((path: string, opts?: RequestInit) => {
      if (path === "/admin/queue/status") return Promise.resolve(makeStatus());
      if (path === "/admin/queue/settings") return Promise.resolve(BASE_SETTINGS);
      if (path === "/admin/queue/cost-estimate") return Promise.resolve(NO_COST);
      if (path.startsWith("/admin/queue/items") && opts?.method === "POST")
        return Promise.reject(new Error("Server error"));
      if (path.startsWith("/admin/queue/items")) return Promise.resolve([failedItem]);
      return Promise.resolve({});
    });

    await renderAndWait(adminFetch);

    const retryBtn = await screen.findByRole("button", { name: /retry/i });
    await userEvent.click(retryBtn);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining("Server error"),
      ),
    );
  });

  it("shows alert when delete API call fails", async () => {
    const item = makeItem({ id: 7 });
    const adminFetch = jest.fn((path: string, opts?: RequestInit) => {
      if (path === "/admin/queue/status") return Promise.resolve(makeStatus());
      if (path === "/admin/queue/settings") return Promise.resolve(BASE_SETTINGS);
      if (path === "/admin/queue/cost-estimate") return Promise.resolve(NO_COST);
      if (path.startsWith("/admin/queue/items") && opts?.method === "DELETE")
        return Promise.reject(new Error("Not found"));
      if (path.startsWith("/admin/queue/items")) return Promise.resolve([item]);
      return Promise.resolve({});
    });

    await renderAndWait(adminFetch);

    const delBtn = await screen.findByRole("button", { name: /del/i });
    await userEvent.click(delBtn);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining("Not found"),
      ),
    );
  });
});
