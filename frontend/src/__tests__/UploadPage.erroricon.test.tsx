/**
 * Regression test for #1953: upload page error banner must include
 * AlertCircleIcon (SVG), not just bare red text.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
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
  jest.resetAllMocks();
  mockUseSession.mockReturnValue({ status: "authenticated", data: { backendToken: "tok" } });
  mockGetUploadQuota.mockResolvedValue({ used: 0, max: 10 });
});

test("upload error alert contains an SVG icon (AlertCircleIcon)", async () => {
  const { ApiError } = jest.requireMock("@/lib/api");
  mockUploadBook.mockRejectedValue(new ApiError(413, "File too large"));

  render(<UploadPage />);
  await flushPromises();

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const bigFile = new File(["x".repeat(100)], "big.txt", { type: "text/plain" });
  await userEvent.upload(input, bigFile);

  await waitFor(() => {
    const alert = screen.queryByRole("alert");
    expect(alert).not.toBeNull();
    const svg = alert!.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
