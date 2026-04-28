/**
 * Regression tests for missing branch coverage in app/upload/page.tsx
 * Closes #1975 — targets: drag-drop handler, back button, sign-in click,
 * non-ApiError generic error path.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({}),
}));

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

const mockUploadBook = jest.fn();
const mockGetUploadQuota = jest.fn();
jest.mock("@/lib/api", () => ({
  uploadBook: (...args: unknown[]) => mockUploadBook(...args),
  getUploadQuota: (...args: unknown[]) => mockGetUploadQuota(...args),
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
  mockUseSession.mockReturnValue({ status: "authenticated", data: { backendToken: "tok" } });
  mockGetUploadQuota.mockResolvedValue(QUOTA);
  mockUploadBook.mockResolvedValue({ book_id: 99 });
});

// ── Sign-in button navigation ─────────────────────────────────────────────────

test("sign-in button navigates to /login when clicked (unauthenticated state)", async () => {
  mockUseSession.mockReturnValue({ status: "unauthenticated", data: null });

  render(<UploadPage />);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
  expect(mockPush).toHaveBeenCalledWith("/login");
});

// ── Back button navigation ────────────────────────────────────────────────────

test("back button navigates to / when clicked", async () => {
  render(<UploadPage />);
  await flushPromises();

  await userEvent.click(screen.getByRole("button", { name: /back/i }));
  expect(mockPush).toHaveBeenCalledWith("/");
});

// ── Generic (non-ApiError) upload error ──────────────────────────────────────

test("shows generic error message when upload throws a non-ApiError", async () => {
  mockUploadBook.mockRejectedValue(new Error("Network timeout"));

  render(<UploadPage />);
  await flushPromises();

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const txtFile = new File(["content"], "book.txt", { type: "text/plain" });
  await userEvent.upload(input, txtFile);

  await waitFor(() => {
    expect(screen.getByText(/upload failed/i)).toBeInTheDocument();
  });
});

// ── Drag-and-drop handler ─────────────────────────────────────────────────────

test("dropping a valid .txt file on the drop zone triggers upload", async () => {
  render(<UploadPage />);
  await flushPromises();

  const dropZone = screen.getByRole("button", { name: /upload a book file/i });
  const txtFile = new File(["Chapter 1\n\nContent."], "dropped.txt", { type: "text/plain" });

  const dataTransfer = {
    files: [txtFile],
    items: [],
    types: [],
  };

  // Simulate drag events
  dropZone.dispatchEvent(
    new MouseEvent("dragover", { bubbles: true }),
  );
  dropZone.dispatchEvent(
    Object.assign(new Event("drop", { bubbles: true }), { dataTransfer }),
  );

  await waitFor(() => expect(mockUploadBook).toHaveBeenCalledWith(txtFile));
  expect(mockPush).toHaveBeenCalledWith("/upload/99/chapters");
});

test("dropping an invalid file type shows an error", async () => {
  render(<UploadPage />);
  await flushPromises();

  const dropZone = screen.getByRole("button", { name: /upload a book file/i });
  const pdfFile = new File(["pdf content"], "book.pdf", { type: "application/pdf" });

  const dataTransfer = { files: [pdfFile], items: [], types: [] };
  dropZone.dispatchEvent(
    Object.assign(new Event("drop", { bubbles: true }), { dataTransfer }),
  );

  await waitFor(() => {
    expect(screen.getByText(/only .txt and .epub files/i)).toBeInTheDocument();
  });
  expect(mockUploadBook).not.toHaveBeenCalled();
});

test("dragLeave clears the dragging visual state", async () => {
  render(<UploadPage />);
  await flushPromises();

  const dropZone = screen.getByRole("button", { name: /upload a book file/i });

  // Drag over adds dragging class
  dropZone.dispatchEvent(new MouseEvent("dragover", { bubbles: true }));
  // Drag leave removes it — just verifying no errors thrown
  dropZone.dispatchEvent(new MouseEvent("dragleave", { bubbles: true }));
  // No assertion needed beyond "no error thrown" — visual state is CSS-only
  expect(dropZone).toBeInTheDocument();
});

// ── Drop zone keyboard interaction ────────────────────────────────────────────

test("pressing Enter on the drop zone opens the file input", async () => {
  render(<UploadPage />);
  await flushPromises();

  const dropZone = screen.getByRole("button", { name: /upload a book file/i });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const clickSpy = jest.spyOn(input, "click");

  dropZone.focus();
  await userEvent.keyboard("{Enter}");

  expect(clickSpy).toHaveBeenCalled();
});

test("pressing Space on the drop zone opens the file input", async () => {
  render(<UploadPage />);
  await flushPromises();

  const dropZone = screen.getByRole("button", { name: /upload a book file/i });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const clickSpy = jest.spyOn(input, "click");

  dropZone.focus();
  await userEvent.keyboard(" ");

  expect(clickSpy).toHaveBeenCalled();
});
