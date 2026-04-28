/**
 * Regression test for #1951: admin pages (audio, users, books, uploads)
 * must show AlertCircleIcon + Retry button on initial fetch failure, not
 * just a bare red text banner.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── shared mocks ─────────────────────────────────────────────────────────────

const mockAdminFetch = jest.fn();
const mockGetMe = jest.fn();

jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

jest.mock("@/lib/api", () => ({
  getMe: (...args: unknown[]) => mockGetMe(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({}),
}));

// admin/books imports SeedPopularButton — stub it out
jest.mock("@/components/SeedPopularButton", () => {
  const Seed = () => <button>Seed</button>;
  Seed.displayName = "SeedPopularButton";
  return { __esModule: true, default: Seed };
});

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.resetAllMocks();
  mockGetMe.mockResolvedValue({ id: 99 });
});

// ─── admin/audio ──────────────────────────────────────────────────────────────

describe("AdminAudioPage error state", () => {
  let AudioPage: React.ComponentType;
  beforeAll(async () => {
    const mod = await import("@/app/admin/audio/page");
    AudioPage = mod.default;
  });

  it("shows alert with Retry button on load failure", async () => {
    mockAdminFetch.mockRejectedValue(new Error("network error"));
    render(<AudioPage />);
    await flushPromises();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("Retry re-fetches and clears error on success", async () => {
    mockAdminFetch
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce([]);
    render(<AudioPage />);
    await flushPromises();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});

// ─── admin/users ──────────────────────────────────────────────────────────────

describe("AdminUsersPage error state", () => {
  let UsersPage: React.ComponentType;
  beforeAll(async () => {
    const mod = await import("@/app/admin/users/page");
    UsersPage = mod.default;
  });

  it("shows alert with Retry button on load failure", async () => {
    mockAdminFetch.mockRejectedValue(new Error("network error"));
    render(<UsersPage />);
    await flushPromises();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("Retry re-fetches and clears error on success", async () => {
    mockAdminFetch
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce([]);
    render(<UsersPage />);
    await flushPromises();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});

// ─── admin/books (inline error banner) ───────────────────────────────────────
// admin/books calls adminFetch twice concurrently in Promise.all

describe("AdminBooksPage error state", () => {
  let BooksPage: React.ComponentType;
  beforeAll(async () => {
    const mod = await import("@/app/admin/books/page");
    BooksPage = mod.default;
  });

  it("shows alert with Retry button on load failure", async () => {
    mockAdminFetch.mockRejectedValue(new Error("network error"));
    render(<BooksPage />);
    await flushPromises();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("Retry re-fetches and clears error on success", async () => {
    mockAdminFetch
      .mockRejectedValueOnce(new Error("fail")) // initial /admin/books
      .mockRejectedValueOnce(new Error("fail")) // initial /admin/translations (concurrent)
      .mockResolvedValueOnce([])  // retry /admin/books
      .mockResolvedValueOnce({}); // retry /admin/translations
    render(<BooksPage />);
    await flushPromises();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});

// ─── admin/uploads (inline error banner) ─────────────────────────────────────

describe("AdminUploadsPage error state", () => {
  let UploadsPage: React.ComponentType;
  beforeAll(async () => {
    const mod = await import("@/app/admin/uploads/page");
    UploadsPage = mod.default;
  });

  it("shows alert with Retry button on load failure", async () => {
    mockAdminFetch.mockRejectedValue(new Error("network error"));
    render(<UploadsPage />);
    await flushPromises();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("Retry re-fetches and clears error on success", async () => {
    mockAdminFetch
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce([]);
    render(<UploadsPage />);
    await flushPromises();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
