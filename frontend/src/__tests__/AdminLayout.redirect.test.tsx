/**
 * AdminLayout — auth guards: non-admin redirect and API error redirect.
 */
import React from "react";
import { render, waitFor, screen, fireEvent } from "@testing-library/react";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  usePathname: () => "/admin/users",
}));
jest.mock("next/link", () => {
  const MockLink = ({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  );
  MockLink.displayName = "MockLink";
  return { __esModule: true, default: MockLink };
});

const mockGetMe = jest.fn();
jest.mock("@/lib/api", () => ({
  getMe: (...args: any[]) => mockGetMe(...args),
  getAuthToken: () => "test-token",
  awaitSession: () => Promise.resolve(),
}));
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: () => Promise.resolve({ users_total: 0, users_approved: 0, users_pending: 0, books_cached: 0, audio_chunks_cached: 0, audio_cache_mb: 0, translations_cached: 0 }),
}));

import AdminLayout from "@/app/admin/layout";

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.mockReset();
});

test("redirects to / when user is not admin", async () => {
  mockGetMe.mockResolvedValue({ id: 1, email: "u@x.com", role: "user" });
  render(<AdminLayout><div>child</div></AdminLayout>);
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
});

test("redirects to / when getMe throws", async () => {
  mockGetMe.mockRejectedValue(new Error("Unauthorized"));
  render(<AdminLayout><div>child</div></AdminLayout>);
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
});

test("shows spinner while loading (before getMe resolves)", () => {
  mockGetMe.mockReturnValue(new Promise(() => {})); // never resolves
  const { container } = render(<AdminLayout><div>child</div></AdminLayout>);
  expect(container.querySelector(".animate-spin")).toBeTruthy();
});

test("renders authenticated layout with tabs when user is admin", async () => {
  mockGetMe.mockResolvedValue({ id: 1, email: "admin@x.com", role: "admin" });
  render(<AdminLayout><div>child content</div></AdminLayout>);
  await waitFor(() => screen.getByText("child content"));
  expect(screen.getByText("← Library")).toBeInTheDocument();
  expect(screen.getByText("Users")).toBeInTheDocument();
});

test("clicking ← Library navigates to / (line 76)", async () => {
  mockGetMe.mockResolvedValue({ id: 1, email: "admin@x.com", role: "admin" });
  render(<AdminLayout><div>child</div></AdminLayout>);
  await waitFor(() => screen.getByText("← Library"));
  fireEvent.click(screen.getByText("← Library"));
  expect(mockPush).toHaveBeenCalledWith("/");
});

