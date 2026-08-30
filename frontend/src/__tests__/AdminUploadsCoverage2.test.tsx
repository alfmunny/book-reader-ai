/**
 * Coverage tests for app/(shell)/admin/uploads/page.tsx — closes #2027.
 *
 * Covers:
 *  - line 52: non-Error thrown value falls back to "Failed to load uploads"
 *  - line 67: trimmed="" → load(undefined) (user clicks Filter with blank input)
 *  - line 109: non-Enter keydown does NOT trigger handleFilter
 *  - line 137: empty-state message when activeFilter is set — "No uploads found for user N"
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";

const mockAdminFetch = jest.fn();
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/admin/uploads",
}));

jest.mock("@/lib/api", () => ({
  getMe: () => Promise.resolve({ id: 1, role: "admin" }),
  getAuthToken: () => "test-token",
  awaitSession: () => Promise.resolve(),
}));

import UploadsPage from "@/app/(shell)/admin/uploads/page";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

async function renderPage() {
  render(<UploadsPage />);
  await flushPromises();
  await waitFor(() =>
    expect(screen.queryByRole("status", { name: "Loading uploads" })).not.toBeInTheDocument(),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminFetch.mockResolvedValue([]);
});

test("non-Error thrown value shows generic fallback error message (line 52)", async () => {
  mockAdminFetch.mockRejectedValue("plain string error");
  render(<UploadsPage />);
  await flushPromises();
  expect(await screen.findByText("Failed to load uploads")).toBeInTheDocument();
});

test("clicking Filter with blank input calls load(undefined) — no user_id param (line 67)", async () => {
  await renderPage();

  const input = screen.getByLabelText("User ID filter");
  // Leave input blank (default "")
  await userEvent.click(screen.getByRole("button", { name: /filter uploads/i }));

  await waitFor(() =>
    expect(mockAdminFetch).toHaveBeenLastCalledWith("/admin/uploads"),
  );
});

test("non-Enter keydown on filter input does not trigger handleFilter (line 109)", async () => {
  await renderPage();

  const input = screen.getByLabelText("User ID filter");
  await userEvent.type(input, "5");
  const callCountBefore = mockAdminFetch.mock.calls.length;

  // Press a key that is NOT Enter
  fireEvent.keyDown(input, { key: "Tab" });

  // adminFetch should NOT have been called again
  expect(mockAdminFetch.mock.calls.length).toBe(callCountBefore);
});

test("empty state with active filter shows user-specific message (line 137 true branch)", async () => {
  mockAdminFetch.mockResolvedValue([]);
  await renderPage();

  const input = screen.getByLabelText("User ID filter");
  await userEvent.type(input, "42");
  await userEvent.click(screen.getByRole("button", { name: /filter uploads/i }));

  await waitFor(() =>
    expect(screen.getByText(/No uploads found for user 42/)).toBeInTheDocument(),
  );
});
