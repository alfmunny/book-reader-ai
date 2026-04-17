/**
 * Tests for the Worker Start / Stop button loading feedback.
 *
 * The backend /admin/queue/stop PUT can take up to 20 seconds because the
 * worker waits for the in-flight batch to wind down. Without a spinner the
 * button looks broken. This verifies the button swaps to "Stopping…" while
 * the PUT is in flight and "Starting…" during the start call.
 */

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QueueTab from "@/components/QueueTab";

function makeStatus(running: boolean) {
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
      last_completed_at: null,
      last_error: "",
      started_at: null,
      requests_made: 0,
      chapters_done: 0,
      chapters_failed: 0,
      waiting_reason: "",
      log: [],
    },
    counts: {},
  };
}

const SETTINGS = {
  enabled: true,
  has_api_key: true,
  auto_translate_languages: [],
  rpm: null,
  rpd: null,
  model: null,
  model_chain: ["gemini-2.5-flash"],
  max_output_tokens: null,
};

const COST = {
  pending_items: 0,
  pending_books: 0,
  estimated_input_tokens: 0,
  estimated_output_tokens: 0,
  per_model: [],
};

describe("QueueTab worker start/stop button", () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => true);
  });

  it('shows "Stopping…" while the stop PUT is in flight', async () => {
    let workerRunning = true;
    let resolveStop: (v: unknown) => void = () => {};
    const stopPending = new Promise((resolve) => {
      resolveStop = resolve;
    });

    const adminFetch = jest.fn((path: string, opts?: RequestInit) => {
      if (path === "/admin/queue/status") return Promise.resolve(makeStatus(workerRunning));
      if (path === "/admin/queue/settings") return Promise.resolve(SETTINGS);
      if (path.startsWith("/admin/queue/items")) return Promise.resolve([]);
      if (path === "/admin/queue/cost-estimate") return Promise.resolve(COST);
      if (path === "/admin/queue/stop" && opts?.method === "POST") return stopPending;
      return Promise.resolve({});
    });

    render(<QueueTab adminFetch={adminFetch} />);
    const stopBtn = await screen.findByRole("button", { name: /^stop$/i });
    await userEvent.click(stopBtn);

    // While the PUT is in flight we should see "Stopping…" and the button
    // should be disabled.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /stopping…/i })).toBeDisabled(),
    );

    // Let the PUT resolve and verify the button recovers.
    workerRunning = false;
    await act(async () => {
      resolveStop({ ok: true });
      await stopPending;
    });
    await waitFor(() =>
      expect(screen.queryByText(/stopping…/i)).not.toBeInTheDocument(),
    );
  });

  it('shows "Starting…" while the start POST is in flight', async () => {
    let workerRunning = false;
    let resolveStart: (v: unknown) => void = () => {};
    const startPending = new Promise((resolve) => {
      resolveStart = resolve;
    });

    const adminFetch = jest.fn((path: string, opts?: RequestInit) => {
      if (path === "/admin/queue/status") return Promise.resolve(makeStatus(workerRunning));
      if (path === "/admin/queue/settings") return Promise.resolve(SETTINGS);
      if (path.startsWith("/admin/queue/items")) return Promise.resolve([]);
      if (path === "/admin/queue/cost-estimate") return Promise.resolve(COST);
      if (path === "/admin/queue/start" && opts?.method === "POST") return startPending;
      return Promise.resolve({});
    });

    render(<QueueTab adminFetch={adminFetch} />);
    const startBtn = await screen.findByRole("button", { name: /^start$/i });
    await userEvent.click(startBtn);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /starting…/i })).toBeDisabled(),
    );

    workerRunning = true;
    await act(async () => {
      resolveStart({ ok: true });
      await startPending;
    });
    await waitFor(() =>
      expect(screen.queryByText(/starting…/i)).not.toBeInTheDocument(),
    );
  });
});
