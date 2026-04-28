/**
 * Coverage tests for app/upload/page.tsx — functions not covered by existing tests.
 * Closes #1993 — targets:
 *   FN:24  .catch(() => {}) on getUploadQuota rejection
 *   FN:151 drop-zone div onClick handler
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({}),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "tok" } }),
}));

const mockGetUploadQuota = jest.fn();
const mockUploadBook = jest.fn();
jest.mock("@/lib/api", () => ({
  getUploadQuota: (...args: unknown[]) => mockGetUploadQuota(...args),
  uploadBook: (...args: unknown[]) => mockUploadBook(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "ApiError";
    }
  },
}));

import UploadPage from "@/app/upload/page";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));
const QUOTA = { used: 0, max: 10 };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUploadQuota.mockResolvedValue(QUOTA);
  mockUploadBook.mockResolvedValue({ book_id: 1 });
});

// ── getUploadQuota .catch (FN:24) ─────────────────────────────────────────────

test("getUploadQuota rejection is silently swallowed — component renders without throw", async () => {
  mockGetUploadQuota.mockRejectedValue(new Error("Network error"));

  render(<UploadPage />);
  await flushPromises();

  // If .catch(() => {}) is missing this throws an unhandled rejection.
  // Component should still render the upload UI.
  expect(screen.getByRole("button", { name: /upload a book file/i })).toBeInTheDocument();
});

// ── drop-zone onClick (FN:151) ────────────────────────────────────────────────

test("clicking the drop-zone button triggers the hidden file input click", async () => {
  render(<UploadPage />);
  await flushPromises();

  // Spy on HTMLInputElement.prototype.click so we can verify it's called
  const clickSpy = jest.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});

  const dropZone = screen.getByRole("button", { name: /upload a book file/i });
  await userEvent.click(dropZone);

  expect(clickSpy).toHaveBeenCalled();
  clickSpy.mockRestore();
});

test("clicking the drop-zone does nothing when uploading is in progress", async () => {
  // Make upload take a long time so uploading stays true
  mockUploadBook.mockReturnValue(new Promise(() => {}));

  render(<UploadPage />);
  await flushPromises();

  // Upload a file to put component in uploading state
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], "book.txt", { type: "text/plain" });
  await userEvent.upload(fileInput, file);

  // Now the component is in uploading state — drop-zone onClick is guarded by !uploading
  const clickSpy = jest.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  const dropZone = screen.getByRole("button", { name: /upload a book file/i });
  await userEvent.click(dropZone);

  // click() should NOT be called because the guard `!uploading` is false
  expect(clickSpy).not.toHaveBeenCalled();
  clickSpy.mockRestore();
});
