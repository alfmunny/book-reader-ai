/**
 * Admins have no upload limit — `GET /upload/quota` returns `max: null` for
 * them. The page treated that as a number, and `used >= null` coerces to
 * `used >= 0`, so the quota read as permanently full: the dropzone was
 * disabled and "Upload limit reached" was shown to the one role with no limit.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({}),
}));

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

const mockGetUploadQuota = jest.fn();
jest.mock("@/lib/api", () => ({
  uploadBook: jest.fn(),
  getUploadQuota: (...args: unknown[]) => mockGetUploadQuota(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  },
}));

import UploadPage from "@/app/(shell)/upload/page";

const flush = () => new Promise((r) => setTimeout(r, 0));

async function renderWithQuota(quota: { used: number; max: number | null }) {
  mockUseSession.mockReturnValue({ status: "authenticated", data: { backendToken: "t" } });
  mockGetUploadQuota.mockResolvedValue(quota);
  render(<UploadPage />);
  await flush();
}

beforeEach(() => jest.clearAllMocks());

test("an admin is not told the limit is reached", async () => {
  await renderWithQuota({ used: 3, max: null });

  expect(screen.queryByText(/upload limit reached/i)).not.toBeInTheDocument();
});

test("an admin's dropzone stays enabled", async () => {
  await renderWithQuota({ used: 3, max: null });

  const dropzone = screen.getByRole("button", { name: /upload|choose|drag/i });
  expect(dropzone).not.toHaveAttribute("aria-disabled", "true");
});

test("an unlimited quota says so instead of rendering a blank denominator", async () => {
  await renderWithQuota({ used: 3, max: null });

  expect(await screen.findByText(/no limit/i)).toBeInTheDocument();
  // "3 / " with nothing after it was what null rendered as.
  expect(screen.queryByText(/3 \/\s*$/)).not.toBeInTheDocument();
});

test("no progress bar is drawn for an unlimited quota", async () => {
  await renderWithQuota({ used: 3, max: null });

  // 3/null is Infinity, which clamped to a permanently full bar.
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

test("a limited quota still shows its bar and numbers", async () => {
  await renderWithQuota({ used: 2, max: 10 });

  expect(await screen.findByText("2 / 10")).toBeInTheDocument();
  const bar = await screen.findByRole("progressbar");
  expect(bar).toHaveAttribute("aria-valuenow", "20");
});

test("a full limited quota still warns", async () => {
  await renderWithQuota({ used: 10, max: 10 });

  expect(await screen.findByText(/upload limit reached/i)).toBeInTheDocument();
});

test("a limited quota below the cap does not warn", async () => {
  await renderWithQuota({ used: 9, max: 10 });

  expect(screen.queryByText(/upload limit reached/i)).not.toBeInTheDocument();
});
