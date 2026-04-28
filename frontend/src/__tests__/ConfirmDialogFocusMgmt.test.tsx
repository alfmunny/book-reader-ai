/**
 * Regression tests for #2001 — confirmation dialogs in admin/books and QueueTab
 * must move keyboard focus into the dialog container when opened (WCAG 2.1 SC 2.4.3)
 * and restore it to the triggering element when closed.
 *
 * The dialog container uses tabIndex={-1} (not the Confirm button) so that
 * pressing Enter to open the dialog does NOT accidentally auto-confirm.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockAdminFetch = jest.fn();
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/components/SeedPopularButton", () => {
  const Seed = () => <button>Seed popular</button>;
  Seed.displayName = "SeedPopularButton";
  return { __esModule: true, default: Seed };
});

const BOOK = {
  id: 1,
  title: "Moby Dick",
  authors: ["Herman Melville"],
  languages: ["en"],
  download_count: 100,
  text_length: 50000,
  word_count: 9000,
  translations: {},
  queue: {},
};

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

// ── admin/books focus management ─────────────────────────────────────────────

let AdminBooksPage: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/admin/books/page");
  AdminBooksPage = mod.default;
});

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

test("admin/books: opening confirm dialog moves focus into dialog container (#2001)", async () => {
  mockAdminFetch.mockResolvedValue([BOOK]);

  render(<AdminBooksPage />);
  await flushPromises();
  await waitFor(() => screen.getByText("Moby Dick"));

  const deleteBtn = screen.getByRole("button", { name: /delete moby dick/i });
  await userEvent.click(deleteBtn);

  // Dialog container must have focus — not the button inside it
  const dialog = screen.getByRole("alertdialog", { name: /confirm action/i });
  expect(dialog).toHaveFocus();
});

test("admin/books: cancelling confirm dialog restores focus to trigger (#2001)", async () => {
  mockAdminFetch.mockResolvedValue([BOOK]);

  render(<AdminBooksPage />);
  await flushPromises();
  await waitFor(() => screen.getByText("Moby Dick"));

  const deleteBtn = screen.getByRole("button", { name: /delete moby dick/i });
  await userEvent.click(deleteBtn);

  // Cancel — focus should return to Delete button
  await userEvent.click(screen.getByRole("button", { name: /cancel action/i }));
  expect(deleteBtn).toHaveFocus();
});

// ── QueueTab focus management ─────────────────────────────────────────────────

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

const RUNNING_STATUS = {
  running: true,
  state: {
    enabled: true,
    idle: false,
    current_book_id: null,
    current_book_title: "",
    current_target_language: "",
    current_batch_size: 0,
    last_completed_at: null,
    last_error: "",
    started_at: null,
    requests_made: 0,
    chapters_done: 0,
    chapters_failed: 0,
    waiting_reason: "",
    log: [],
  },
  counts: { pending: 2, running: 0, done: 5, failed: 1 },
};

const NO_COST = {
  pending_items: 0,
  pending_books: 0,
  estimated_input_tokens: 0,
  estimated_output_tokens: 0,
  per_model: [],
};

function makeQueueFetch(overrides: Record<string, unknown> = {}) {
  return jest.fn((path: string) => {
    if (path === "/admin/queue/status") return Promise.resolve(overrides.status ?? RUNNING_STATUS);
    if (path === "/admin/queue/settings") return Promise.resolve(BASE_SETTINGS);
    if (path.startsWith("/admin/queue/items")) return Promise.resolve([]);
    if (path === "/admin/queue/cost-estimate") return Promise.resolve(NO_COST);
    return Promise.resolve({});
  });
}

test("QueueTab: opening confirm dialog moves focus into dialog container (#2001)", async () => {
  const adminFetch = makeQueueFetch();
  render(<QueueTab adminFetch={adminFetch} />);
  await waitFor(() => expect(screen.queryByText(/loading queue/i)).not.toBeInTheDocument(), { timeout: 3000 });

  const stopBtn = screen.getByRole("button", { name: /^stop$/i });
  await userEvent.click(stopBtn);

  const dialog = screen.getByRole("alertdialog", { name: /confirm action/i });
  expect(dialog).toHaveFocus();
});

test("QueueTab: cancelling confirm dialog restores focus to trigger (#2001)", async () => {
  const adminFetch = makeQueueFetch();
  render(<QueueTab adminFetch={adminFetch} />);
  await waitFor(() => expect(screen.queryByText(/loading queue/i)).not.toBeInTheDocument(), { timeout: 3000 });

  const stopBtn = screen.getByRole("button", { name: /^stop$/i });
  await userEvent.click(stopBtn);

  await userEvent.click(screen.getByRole("button", { name: /cancel action/i }));
  expect(stopBtn).toHaveFocus();
});
