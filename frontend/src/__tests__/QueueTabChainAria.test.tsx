/**
 * Regression tests for #595: QueueTab chain ordering buttons (↑ ↓ ×)
 * must have aria-label for screen reader accessibility.
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
  model_chain: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
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
  counts: { pending: 0, running: 0, done: 0, failed: 0 },
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

describe("QueueTab chain buttons accessibility (#595)", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => false);
  });

  it("move-up buttons have aria-label", async () => {
    await renderAndWait(makeAdminFetch());
    const upBtns = screen.getAllByTitle(/move .+ up/i);
    expect(upBtns.length).toBeGreaterThan(0);
    upBtns.forEach((btn) => {
      expect(btn.getAttribute("aria-label")).toMatch(/^Move .+ up$/);
    });
  });

  it("move-down buttons have aria-label", async () => {
    await renderAndWait(makeAdminFetch());
    const downBtns = screen.getAllByTitle(/move .+ down/i);
    expect(downBtns.length).toBeGreaterThan(0);
    downBtns.forEach((btn) => {
      expect(btn.getAttribute("aria-label")).toMatch(/^Move .+ down$/);
    });
  });

  it("remove-from-chain buttons have aria-label", async () => {
    await renderAndWait(makeAdminFetch());
    const removeBtns = screen.getAllByTitle(/remove .+ from chain/i);
    expect(removeBtns.length).toBeGreaterThan(0);
    removeBtns.forEach((btn) => {
      expect(btn.getAttribute("aria-label")).toMatch(/^Remove .+ from chain$/);
    });
  });

  it("remove-from-chain buttons do not use × raw character as content", async () => {
    const { container } = render(<QueueTab adminFetch={makeAdminFetch()} />);
    await waitFor(
      () => expect(screen.queryByText(/loading queue/i)).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
    const xBtns = Array.from(container.querySelectorAll("button")).filter(
      (btn) => btn.textContent?.trim() === "×"
    );
    expect(xBtns.length).toBe(0);
  });
});
