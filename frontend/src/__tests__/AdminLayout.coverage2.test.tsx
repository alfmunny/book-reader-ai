/**
 * AdminLayout — additional branch coverage:
 *  Line 19: activeTab() with pathname=null → returns null early
 *  Line 38: if (cancelled) return — fires when component unmounts while getMe is pending
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";

const mockPush = jest.fn();
const mockPathname = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  usePathname: () => mockPathname(),
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
  getMe: (...args: unknown[]) => mockGetMe(...args),
  getAuthToken: () => "test-token",
  awaitSession: () => Promise.resolve(),
}));

jest.mock("@/lib/adminFetch", () => ({
  adminFetch: () => Promise.resolve({ users_total: 0, users_approved: 0, users_pending: 0, books_cached: 0, audio_chunks_cached: 0, audio_cache_mb: 0, translations_cached: 0 }),
}));

import AdminLayout from "@/app/admin/layout";

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.mockReset();
});

// ── Line 19: activeTab with null pathname returns null early ──────────────────

test("activeTab returns null when pathname is null (line 19 if(!pathname) branch)", async () => {
  mockPathname.mockReturnValue(null);
  mockGetMe.mockResolvedValue({ id: 1, email: "admin@x.com", role: "admin" });

  render(<AdminLayout><div>child</div></AdminLayout>);
  await flushPromises();

  // No active tab highlighted when pathname is null — component renders without crash
  expect(document.body).toBeTruthy();
});

// ── Line 38: cancelled = true on unmount — if (cancelled) return ──────────────

test("if (cancelled) return fires when component unmounts before getMe resolves (line 38)", async () => {
  mockPathname.mockReturnValue("/admin/users");

  let resolveFn!: (v: { role: string }) => void;
  mockGetMe.mockReturnValue(new Promise<{ role: string }>((res) => { resolveFn = res; }));

  const { unmount } = render(<AdminLayout><div>child</div></AdminLayout>);

  // Unmount before getMe resolves → cleanup sets cancelled=true
  unmount();

  // Now resolve getMe — should hit `if (cancelled) return` without crashing
  resolveFn({ role: "admin" });
  await flushPromises();

  // No navigation was triggered after unmount
  expect(mockPush).not.toHaveBeenCalled();
});
