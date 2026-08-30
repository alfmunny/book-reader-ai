/**
 * Coverage tests for app/(shell)/admin/audio/page.tsx — functions not covered by existing tests.
 * Closes #1989 — targets: Dismiss error onClick (line 84).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAdminFetch = jest.fn();
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

const AUDIO = [
  {
    book_id: 1,
    chapter_index: 0,
    provider: "google",
    voice: "en-US-Standard-A",
    chunks: 5,
    size_mb: 2.1,
    created_at: "2026-01-01T00:00:00Z",
  },
];

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

let AudioPage: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/(shell)/admin/audio/page");
  AudioPage = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminFetch.mockResolvedValue(AUDIO);
});

async function renderPage() {
  render(<AudioPage />);
  await flushPromises();
  await waitFor(() =>
    expect(screen.queryByRole("status", { name: "Loading audio jobs" })).not.toBeInTheDocument(),
  );
}

test("clicking Dismiss error clears the actError alert", async () => {
  // First call: initial load; second call (delete action): reject; third call would be reload
  mockAdminFetch
    .mockResolvedValueOnce(AUDIO)
    .mockRejectedValueOnce(new Error("Delete failed"))
    .mockResolvedValueOnce([]);

  await renderPage();

  // Trigger an inline error by attempting to delete a chapter
  const deleteBtn = screen.getByRole("button", { name: /delete audio for book 1/i });
  await userEvent.click(deleteBtn);

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Delete failed"),
  );

  // Dismiss the error
  await userEvent.click(screen.getByRole("button", { name: /dismiss error/i }));

  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});
