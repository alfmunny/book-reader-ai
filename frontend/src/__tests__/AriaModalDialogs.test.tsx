/**
 * Regression test for #1995 — confirmation dialogs in admin/books and QueueTab
 * must include aria-modal="true" so screen readers treat them as modal.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── admin/books confirmation dialog ──────────────────────────────────────────

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

let AdminBooksPage: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/admin/books/page");
  AdminBooksPage = mod.default;
});

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

test("admin/books confirm dialog has aria-modal='true'", async () => {
  mockAdminFetch.mockResolvedValue([BOOK]);

  render(<AdminBooksPage />);
  await flushPromises();
  await waitFor(() => screen.getByText("Moby Dick"));

  // Click the Delete button to open the confirmation dialog
  await userEvent.click(screen.getByRole("button", { name: /delete moby dick/i }));

  const dialog = screen.getByRole("dialog", { name: /confirm action/i });
  expect(dialog).toHaveAttribute("aria-modal", "true");
});
