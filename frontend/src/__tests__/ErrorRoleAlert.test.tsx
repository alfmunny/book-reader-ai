/**
 * Regression test for #1228: error display elements in upload/page,
 * QueueTab, and SeedPopularButton must have role="alert".
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Hoisted mocks
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: {} } }),
}));
jest.mock("@/lib/api", () => ({
  uploadBook: jest.fn().mockRejectedValue(new Error("Upload failed")),
  getUploadQuota: jest.fn().mockResolvedValue({ used: 0, max: 5, remaining: 5 }),
  ApiError: class ApiError extends Error {},
}));

// --- QueueTab: adminFetch failure on initial load ---
import QueueTab from "@/components/QueueTab";

test("QueueTab error has role=alert", async () => {
  const adminFetch = jest.fn().mockRejectedValue(new Error("Network error"));
  render(<QueueTab adminFetch={adminFetch} />);
  await waitFor(() => {
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
  expect(screen.getByRole("alert").textContent).toMatch(/network error/i);
});

// --- SeedPopularButton: start() failure when fetch for start call rejects ---
import SeedPopularButton from "@/components/SeedPopularButton";

const IDLE_STATE = {
  status: "idle",
  total: 0,
  current: 0,
  downloaded: 0,
  failed: 0,
  already_cached: 0,
  current_book_id: null,
  current_book_title: "",
  last_error: "",
  started_at: null,
  ended_at: null,
  log: [],
};

const RUNNING_STATE = {
  ...IDLE_STATE,
  status: "running",
  total: 5,
  current: 1,
  started_at: "2026-01-01T00:00:00Z",
};

test("SeedPopularButton error has role=alert when start fails", async () => {
  // First call (refresh on mount) succeeds so state is populated
  // Second call (start) rejects to trigger setError
  const adminFetch = jest.fn()
    .mockResolvedValueOnce({ running: false, state: RUNNING_STATE })
    .mockRejectedValueOnce(new Error("Start failed"));

  window.confirm = jest.fn().mockReturnValue(true);

  render(<SeedPopularButton adminFetch={adminFetch} />);

  // Wait for initial status load (makes Start button not disabled and state non-null)
  await waitFor(() => {
    expect(adminFetch).toHaveBeenCalledWith("/admin/books/seed-popular/status");
  });

  const startBtn = screen.getByRole("button", { name: /seed all popular books/i });
  fireEvent.click(startBtn);

  await waitFor(() => {
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

// --- upload/page: unsupported file type triggers error ---
import UploadPage from "@/app/upload/page";

test("upload/page error has role=alert when unsupported file type chosen", async () => {
  render(<UploadPage />);

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();

  const file = new File(["content"], "test.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => {
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
  expect(screen.getByRole("alert").textContent).toMatch(/only.*\.txt.*\.epub/i);
});
