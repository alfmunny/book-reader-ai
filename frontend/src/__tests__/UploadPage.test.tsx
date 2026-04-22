/**
 * Tests for the book upload page (/upload).
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("UploadPage", () => {
  it("shows sign-in message for unauthenticated users", () => {
    mockUseSession.mockReturnValue({ status: "unauthenticated", data: null });
    render(<UploadPage />);
    expect(screen.getByText(/sign in to upload books/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows loading spinner while session loads", () => {
    mockUseSession.mockReturnValue({ status: "loading", data: null });
    render(<UploadPage />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders upload zone for authenticated users", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated", data: { backendToken: "tok" } });
    mockGetUploadQuota.mockResolvedValue({ used: 2, max: 10 });
    render(<UploadPage />);
    await flushPromises();
    expect(screen.getByRole("button", { name: /upload a book file/i })).toBeInTheDocument();
    expect(screen.getByText(/\.txt.*3 MB/i)).toBeInTheDocument();
  });

  it("shows quota bar with usage", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated", data: { backendToken: "tok" } });
    mockGetUploadQuota.mockResolvedValue({ used: 3, max: 10 });
    render(<UploadPage />);
    await flushPromises();
    expect(await screen.findByText("3 / 10")).toBeInTheDocument();
  });

  it("shows full quota warning when at limit", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated", data: { backendToken: "tok" } });
    mockGetUploadQuota.mockResolvedValue({ used: 10, max: 10 });
    render(<UploadPage />);
    await flushPromises();
    expect(await screen.findByText(/upload limit reached/i)).toBeInTheDocument();
  });

  it("shows error for non-txt/epub files", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated", data: { backendToken: "tok" } });
    mockGetUploadQuota.mockResolvedValue({ used: 0, max: 10 });
    render(<UploadPage />);
    await flushPromises();

    // Override the accept attribute so JSDOM doesn't filter the file
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    input.removeAttribute("accept");
    const pdfFile = new File(["content"], "story.pdf", { type: "application/pdf" });
    await userEvent.upload(input, pdfFile);

    await waitFor(() => {
      expect(screen.getByText(/only .txt and .epub files are supported/i)).toBeInTheDocument();
    });
    expect(mockUploadBook).not.toHaveBeenCalled();
  });

  it("uploads file and redirects to chapter editor on success", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated", data: { backendToken: "tok" } });
    mockGetUploadQuota.mockResolvedValue({ used: 0, max: 10 });
    mockUploadBook.mockResolvedValue({
      book_id: 42,
      title: "My Book",
      author: "Unknown",
      format: "txt",
      detected_chapters: [{ index: 0, title: "Chapter 1", preview: "Some text", word_count: 200 }],
    });

    render(<UploadPage />);
    await flushPromises();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const txtFile = new File(["Chapter 1\n\nSome text here."], "book.txt", { type: "text/plain" });
    await userEvent.upload(input, txtFile);

    await waitFor(() => {
      expect(mockUploadBook).toHaveBeenCalledWith(txtFile);
      expect(mockPush).toHaveBeenCalledWith("/upload/42/chapters");
    });
  });

  it("shows error message when upload fails", async () => {
    const { ApiError } = jest.requireMock("@/lib/api");
    mockUseSession.mockReturnValue({ status: "authenticated", data: { backendToken: "tok" } });
    mockGetUploadQuota.mockResolvedValue({ used: 0, max: 10 });
    mockUploadBook.mockRejectedValue(new ApiError(413, "File too large"));

    render(<UploadPage />);
    await flushPromises();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(["x".repeat(100)], "big.txt", { type: "text/plain" });
    await userEvent.upload(input, bigFile);

    await waitFor(() => {
      expect(screen.getByText(/file too large/i)).toBeInTheDocument();
    });
  });
});
