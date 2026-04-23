/**
 * Regression test for #602: QueueTab filter pills and Clear queue button
 * must meet the 44px minimum touch target height.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import QueueTab from "@/components/QueueTab";

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

const STATUS = {
  running: false,
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
  counts: { pending: 3, running: 1, done: 5, failed: 0 },
};

const NO_COST = {
  pending_items: 0,
  pending_books: 0,
  estimated_input_tokens: 0,
  estimated_output_tokens: 0,
  per_model: [],
};

function makeAdminFetch() {
  return jest.fn((path: string) => {
    if (path === "/admin/queue/status") return Promise.resolve(STATUS);
    if (path === "/admin/queue/settings") return Promise.resolve(BASE_SETTINGS);
    if (path.startsWith("/admin/queue/items")) return Promise.resolve([]);
    if (path === "/admin/queue/cost-estimate") return Promise.resolve(NO_COST);
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

describe("QueueTab filter pills — touch targets (#602)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => false);
  });

  it("filter pill buttons have min-h-[44px]", async () => {
    await renderAndWait(makeAdminFetch());

    // The filter pills are buttons with text "pending", "running", "done", "failed", "all"
    for (const label of ["pending", "running", "done", "failed", "all"]) {
      const btn = screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
      expect(btn.className).toContain("min-h-[44px]");
    }
  });

  it("Clear queue button has min-h-[44px]", async () => {
    await renderAndWait(makeAdminFetch());

    const clearBtn = screen.getByRole("button", { name: /clear pending/i });
    expect(clearBtn.className).toContain("min-h-[44px]");
  });
});
