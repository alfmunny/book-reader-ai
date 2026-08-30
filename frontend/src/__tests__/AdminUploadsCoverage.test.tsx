/**
 * Coverage tests for app/(shell)/admin/uploads/page.tsx — functions not covered by existing tests.
 * Closes #1987 — targets: clearFilter (lines 70-74), Open button router.push (line 172).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAdminFetch = jest.fn();
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
  usePathname: () => "/admin/uploads",
}));

jest.mock("@/lib/api", () => ({
  getMe: () => Promise.resolve({ id: 1, role: "admin" }),
  getAuthToken: () => "test-token",
  awaitSession: () => Promise.resolve(),
}));

import UploadsPage from "@/app/(shell)/admin/uploads/page";

const UPLOAD = {
  book_id: 42,
  title: "Dune",
  filename: "dune.epub",
  file_size: 524288,
  format: "epub",
  uploaded_at: "2026-04-01T12:00:00",
  uploader_email: "alice@example.com",
  uploader_name: "Alice",
};

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
  mockAdminFetch.mockResolvedValue([UPLOAD]);
});

// ── clearFilter ───────────────────────────────────────────────────────────────

test("clicking Clear filter resets filter and reloads without user_id", async () => {
  mockAdminFetch.mockImplementation((path: string) => {
    if (path.includes("user_id=")) return Promise.resolve([UPLOAD]);
    return Promise.resolve([UPLOAD]);
  });

  await renderPage();

  // Apply a filter first so activeFilter is set and Clear button appears
  const input = screen.getByLabelText("User ID filter");
  await userEvent.type(input, "7");
  await userEvent.click(screen.getByRole("button", { name: /filter uploads/i }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /clear filter/i })).toBeInTheDocument(),
  );

  mockAdminFetch.mockClear();
  await userEvent.click(screen.getByRole("button", { name: /clear filter/i }));

  // Should call adminFetch with plain /admin/uploads (no user_id)
  await waitFor(() =>
    expect(mockAdminFetch).toHaveBeenCalledWith("/admin/uploads"),
  );

  // Clear filter button disappears after clearing
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /clear filter/i })).not.toBeInTheDocument(),
  );
});

// ── Open link ─────────────────────────────────────────────────────────────────

test("Open link navigates to /reader/:book_id", async () => {
  await renderPage();

  const link = screen.getByRole("link", { name: /Open Dune/i });
  expect(link).toHaveAttribute("href", "/reader/42");
});
