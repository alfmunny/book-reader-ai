/**
 * Coverage tests for app/admin/users/page.tsx — functions not covered by existing tests.
 * Closes #1987 — targets: Dismiss error onClick (line 86), getMe .catch (line 46).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAdminFetch = jest.fn();
const mockGetMe = jest.fn();

jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));
jest.mock("@/lib/api", () => ({
  getMe: (...args: unknown[]) => mockGetMe(...args),
}));

let UsersPage: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/admin/users/page");
  UsersPage = mod.default;
});

const USERS = [
  {
    id: 1,
    email: "alice@example.com",
    name: "Alice",
    picture: "",
    role: "user",
    approved: 1,
    created_at: "2024-01-01",
  },
];

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMe.mockResolvedValue({ id: 99 });
  mockAdminFetch.mockResolvedValue(USERS);
});

// ── Dismiss actError ──────────────────────────────────────────────────────────

test("clicking Dismiss error clears the actError alert", async () => {
  // First load, then action fails, then reload
  mockAdminFetch
    .mockResolvedValueOnce(USERS)          // initial load
    .mockRejectedValueOnce(new Error("Delete failed")); // action throws

  render(<UsersPage />);
  await flushPromises();

  // Trigger an inline error via delete
  const delBtn = await screen.findByRole("button", { name: /^Delete Alice/i });
  await userEvent.click(delBtn);
  const yesBtn = await screen.findByRole("button", { name: /confirm delete/i });
  await userEvent.click(yesBtn);

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Delete failed"),
  );

  // Dismiss the error
  await userEvent.click(screen.getByRole("button", { name: /dismiss error/i }));

  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});

// ── getMe .catch silences rejection ──────────────────────────────────────────

test("getMe rejection on mount is silently swallowed", async () => {
  mockGetMe.mockRejectedValue(new Error("Token expired"));
  mockAdminFetch.mockResolvedValue(USERS);

  render(<UsersPage />);
  await flushPromises();

  // Page renders normally — the getMe error did not propagate
  expect(await screen.findByText("Alice")).toBeInTheDocument();
});
