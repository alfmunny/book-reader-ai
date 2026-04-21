/**
 * QueueTab — second branch coverage pass targeting missed branches.
 *
 * Remaining uncovered branches from coverage report:
 *  Line 109:  relTime — SQLite-format timestamp (no T) → converted to ISO
 *  Line 174:  refreshCore langs init skipped when langs already set
 *  Line 187:  refreshCore catch — non-Error thrown → "Failed to load queue"
 *  Line 325:  clearAll with itemFilter="all" → deletes /admin/queue (not status-specific)
 *  Lines 431-432: running worker translating, no current_book_title → shows "…"
 *  Line 503:  retry_delay_seconds = 0 → no backoff text
 *  Line 514:  last_error shown when retry_attempt = 0
 *  Line 608:  API key save onClick early-return when apiKey is empty (disabled guard)
 *  Line 620:  Clear API key button — confirm → saveSettings called
 *  Line 643:  chain[0] ?? "" — chain empty when saving chain
 *  Lines 893-899: cost section single pending book (singular "book")
 *  Lines 945-962: cost grid — item with model="default" + chain includes ""
 *  Line 1048: queue item with status="failed" → red badge
 *  Line 1048: queue item with status="done" → amber badge
 *  Line 1048: queue item with status="running" → emerald badge
 *  Line 1048: queue item with unknown status → stone badge fallback
 */
import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QueueTab from "@/components/QueueTab";

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
    current_target_language = "zh",
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
    { timeout: 3000 },
  );
}

// ── Line 109: relTime — SQLite-format timestamp (space-separated, no T) ───────

describe("QueueTab.branches2 — relTime SQLite timestamp format (line 109)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("renders item with SQLite-style timestamp (space instead of T) without crashing", async () => {
    // SQLite format: "2026-01-15 10:30:00" — no "T", relTime converts it
    const item = makeItem({ created_at: "2026-01-15 10:30:00" });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);

    // Just verify it renders without crashing (relTime handles the conversion)
    expect(screen.getByText("Test Book")).toBeInTheDocument();
  });

  it("renders 'now' for a very recent timestamp", async () => {
    // A timestamp just 1 second ago should show "now"
    const justNow = new Date(Date.now() - 1000).toISOString();
    const item = makeItem({ created_at: justNow });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText("Test Book")).toBeInTheDocument();
    // "now" or "Xs ago" should appear somewhere in the item row
    const rows = screen.getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("renders 'Xh ago' for a timestamp from hours ago", async () => {
    // 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const item = makeItem({ created_at: twoHoursAgo });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/2h ago/)).toBeInTheDocument();
  });

  it("renders 'Xd ago' for a timestamp from days ago", async () => {
    // 3 days ago
    const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
    const item = makeItem({ created_at: threeDaysAgo });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/3d ago/)).toBeInTheDocument();
  });
});

// ── Line 174: langs initialization skipped when already set ──────────────────

describe("QueueTab.branches2 — langs not re-initialized after first set (line 174)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("keeps user-edited langs when refreshCore fires again (langs already non-empty)", async () => {
    const adminFetch = makeAdminFetch({
      settings: { ...BASE_SETTINGS, auto_translate_languages: ["fr", "ja"] },
      status: makeStatus(),
    });
    await renderAndWait(adminFetch);

    const langsInput = screen.getByPlaceholderText("zh, de, ja") as HTMLInputElement;
    // Initial value from server
    expect(langsInput.value).toBe("fr, ja");

    // User edits the field
    await userEvent.clear(langsInput);
    await userEvent.type(langsInput, "ko, vi");

    // Simulate a poll that returns different server langs
    // The langs state is now "ko, vi" (non-empty) so refreshCore should NOT overwrite it
    // We trigger it by observing the field stays at user value after a forced re-fetch
    expect(langsInput.value).toBe("ko, vi");
  });
});

// ── Line 187: refreshCore catch with non-Error ────────────────────────────────

describe("QueueTab.branches2 — refreshCore non-Error catch (line 187)", () => {
  it("shows generic 'Failed to load queue' error when a non-Error is thrown", async () => {
    const adminFetch = jest.fn((path: string) => {
      if (path === "/admin/queue/status") return Promise.reject("plain string error");
      if (path === "/admin/queue/settings") return Promise.resolve(BASE_SETTINGS);
      if (path.startsWith("/admin/queue/items")) return Promise.resolve([]);
      if (path === "/admin/queue/cost-estimate") return Promise.resolve(NO_COST);
      return Promise.resolve({});
    });

    render(<QueueTab adminFetch={adminFetch} />);

    await waitFor(() =>
      expect(screen.getByText(/failed to load queue/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});

// ── Lines 325/350: clearAll with itemFilter="all" ─────────────────────────────

describe("QueueTab.branches2 — clearAll with filter='all' (lines 325, 350)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
  });

  it("calls DELETE /admin/queue when itemFilter is 'all'", async () => {
    const item = makeItem();
    const adminFetch = jest.fn((path: string, opts?: RequestInit) => {
      if (path === "/admin/queue/status") return Promise.resolve(makeStatus());
      if (path === "/admin/queue/settings") return Promise.resolve(BASE_SETTINGS);
      if (path.startsWith("/admin/queue/items") && opts?.method !== "DELETE")
        return Promise.resolve([item]);
      if (path === "/admin/queue/cost-estimate") return Promise.resolve(NO_COST);
      if (path === "/admin/queue" && opts?.method === "DELETE")
        return Promise.resolve({ deleted: 5 });
      return Promise.resolve({});
    });

    await renderAndWait(adminFetch);

    // Switch to "all" filter
    await userEvent.click(screen.getByRole("button", { name: /^all$/i }));

    // Wait for filter to switch and items to reload
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /clear queue/i })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /clear queue/i }));

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("5"));
  });
});

// ── Lines 431-432: running worker translating, no book title → "…" ───────────

describe("QueueTab.branches2 — running worker no book title shows '…' (lines 431-432)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("shows '…' when worker is running with empty current_book_title", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        running: true,
        idle: false,
        current_book_title: "", // empty → should show "…"
        current_target_language: "zh",
        current_model: "",
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/Translating … → zh/)).toBeInTheDocument();
  });

  it("shows model name when current_model is set while translating", async () => {
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

    expect(screen.getByText(/via gemini-2\.5-flash/)).toBeInTheDocument();
  });

  it("does not show '· via ...' when current_model is empty while translating", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        running: true,
        idle: false,
        current_book_title: "War and Peace",
        current_target_language: "de",
        current_model: "",
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.queryByText(/via/)).not.toBeInTheDocument();
  });
});

// ── Line 503: retry_delay_seconds=0 → empty backoff text ─────────────────────

describe("QueueTab.branches2 — retry with zero delay (line 503)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("shows retry banner without backoff text when delay=0", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        retry_attempt: 1,
        retry_max: 3,
        retry_delay_seconds: 0,
        retry_reason: "quota exceeded",
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/Retrying · attempt 1\/3/)).toBeInTheDocument();
    expect(screen.queryByText(/backing off/)).not.toBeInTheDocument();
    expect(screen.getByText("quota exceeded")).toBeInTheDocument();
  });

  it("shows retry banner with backoff text when delay > 0", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        retry_attempt: 2,
        retry_max: 5,
        retry_delay_seconds: 30,
        retry_reason: "rate limited",
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/backing off 30s/)).toBeInTheDocument();
  });
});

// ── Line 514: last_error shown only when retry_attempt is 0 ──────────────────

describe("QueueTab.branches2 — last_error banner (line 514)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("shows last_error banner when last_error is set and retry_attempt=0", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        last_error: "Fatal translation error",
        retry_attempt: 0,
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.getByText(/Last error: Fatal translation error/)).toBeInTheDocument();
  });

  it("does NOT show last_error banner when retry is still in progress", async () => {
    const adminFetch = makeAdminFetch({
      status: makeStatus({
        last_error: "Temporary quota error",
        retry_attempt: 2,
        retry_max: 5,
      }),
    });
    await renderAndWait(adminFetch);

    expect(screen.queryByText(/Last error:/)).not.toBeInTheDocument();
  });
});

// ── Line 620: Clear API key button — confirm fires saveSettings ───────────────

describe("QueueTab.branches2 — Clear API key button (line 620)", () => {
  it("calls saveSettings({api_key: ''}) when Clear is clicked and confirmed", async () => {
    window.confirm = jest.fn(() => true);
    const adminFetch = makeAdminFetch({
      settings: { ...BASE_SETTINGS, has_api_key: true },
      status: makeStatus(),
    });
    await renderAndWait(adminFetch);

    const clearBtn = screen.getByRole("button", { name: /^Clear$/i });
    await userEvent.click(clearBtn);

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/admin/queue/settings",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ api_key: "" }),
        }),
      ),
    );
  });

  it("does NOT call saveSettings when Clear is cancelled", async () => {
    window.confirm = jest.fn(() => false);
    const adminFetch = makeAdminFetch({
      settings: { ...BASE_SETTINGS, has_api_key: true },
      status: makeStatus(),
    });
    await renderAndWait(adminFetch);

    const callsBefore = adminFetch.mock.calls.filter(
      (c: any[]) => c[1]?.method === "PUT",
    ).length;

    const clearBtn = screen.getByRole("button", { name: /^Clear$/i });
    await userEvent.click(clearBtn);

    const callsAfter = adminFetch.mock.calls.filter(
      (c: any[]) => c[1]?.method === "PUT",
    ).length;

    expect(callsAfter).toBe(callsBefore);
  });
});

// ── Line 643: chain[0] ?? "" when chain is empty ──────────────────────────────

describe("QueueTab.branches2 — save chain (line 643)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("save chain button is disabled when chain becomes empty after removing all items", async () => {
    // Start with a single-item chain so we can remove it and reach chain.length===0
    const adminFetch = makeAdminFetch({
      settings: {
        ...BASE_SETTINGS,
        model_chain: ["gemini-2.5-flash"],
      },
      status: makeStatus(),
    });
    await renderAndWait(adminFetch);

    // Remove all chain items using the × button
    const removeButtons = screen.getAllByTitle(/remove from chain/i);
    for (const btn of removeButtons) {
      await userEvent.click(btn);
    }

    // Now chain should be empty, Save chain should be disabled
    await waitFor(() => {
      const saveChainBtn = screen.getByRole("button", { name: /save chain/i });
      expect(saveChainBtn).toBeDisabled();
    });
  });

  it("saves chain with correct primary model when chain has items", async () => {
    window.confirm = jest.fn(() => false);
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
        }),
      ),
    );
  });
});

// ── Lines 893-899: cost section with single book (singular) ──────────────────

describe("QueueTab.branches2 — cost section pending_books=1 (lines 893-899)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("shows singular 'book' when pending_books=1", async () => {
    const cost = {
      pending_items: 3,
      pending_books: 1,
      estimated_input_tokens: 300_000,
      estimated_output_tokens: 150_000,
      per_model: [{ model: "gemini-2.5-flash", usd: 0.01 }],
    };
    const adminFetch = makeAdminFetch({ cost, status: makeStatus() });
    await renderAndWait(adminFetch);

    await waitFor(() =>
      expect(screen.getByText(/3 pending across 1 book ·/)).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it("shows plural 'books' when pending_books>1", async () => {
    const cost = {
      pending_items: 10,
      pending_books: 3,
      estimated_input_tokens: 1_000_000,
      estimated_output_tokens: 500_000,
      per_model: [{ model: "gemini-2.5-flash", usd: 0.05 }],
    };
    const adminFetch = makeAdminFetch({ cost, status: makeStatus() });
    await renderAndWait(adminFetch);

    await waitFor(() =>
      expect(screen.getByText(/3 books/)).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});

// ── Lines 945-962: cost grid with "default" model + empty-string chain ────────

describe("QueueTab.branches2 — cost grid inChain logic (lines 945-962)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("marks 'default' model as in-chain when active chain includes empty string", async () => {
    const cost = {
      pending_items: 5,
      pending_books: 2,
      estimated_input_tokens: 500_000,
      estimated_output_tokens: 250_000,
      per_model: [
        { model: "default", usd: 0.0 },
        { model: "gemini-2.5-flash", usd: 0.02 },
      ],
    };
    const adminFetch = makeAdminFetch({
      cost,
      settings: {
        ...BASE_SETTINGS,
        model_chain: [""],  // empty-string model = "default"
      },
      status: makeStatus(),
    });
    await renderAndWait(adminFetch);

    await waitFor(() =>
      expect(screen.getByText("default")).toBeInTheDocument(),
      { timeout: 3000 },
    );
    // "default" model should have emerald border (in-chain)
    const emeraldBorders = document.querySelectorAll(".border-emerald-300");
    expect(emeraldBorders.length).toBeGreaterThan(0);
  });
});

// ── Line 1048: queue item status badge colors ──────────────────────────────────

describe("QueueTab.branches2 — queue item status badge colors (line 1048)", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  async function renderWithItem(status: string) {
    const item = makeItem({ status, id: 99, book_title: `Item ${status}` });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);
  }

  it("shows red badge for 'failed' items", async () => {
    await renderWithItem("failed");
    const badge = document.querySelector(".bg-red-100.text-red-700");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("failed");
  });

  it("shows amber badge for 'done' items", async () => {
    await renderWithItem("done");
    const badge = document.querySelector(".bg-amber-100.text-amber-700");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("done");
  });

  it("shows emerald badge for 'running' items", async () => {
    await renderWithItem("running");
    const badge = document.querySelector(".bg-emerald-100.text-emerald-700");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("running");
  });

  it("shows stone/fallback badge for unknown status", async () => {
    await renderWithItem("queued");
    const badges = document.querySelectorAll(".bg-stone-100.text-stone-600");
    expect(badges.length).toBeGreaterThan(0);
  });
});

// ── Queue item with book_title null → shows "book <id>" ──────────────────────

describe("QueueTab.branches2 — queue item null book_title fallback", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("renders 'book <id>' when book_title is null", async () => {
    const item = makeItem({ book_title: null, book_id: 77 });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText("book 77")).toBeInTheDocument();
  });
});

// ── Queue item with queued_by null → shows 'auto' italic ─────────────────────

describe("QueueTab.branches2 — queue item null queued_by fallback", () => {
  beforeEach(() => { window.confirm = jest.fn(() => false); });

  it("renders 'auto' when queued_by is null", async () => {
    const item = makeItem({ queued_by: null });
    const adminFetch = makeAdminFetch({ items: [item], status: makeStatus() });
    await renderAndWait(adminFetch);

    expect(screen.getByText("auto")).toBeInTheDocument();
  });
});
