/**
 * Coverage tests for app/providers.tsx — functions not covered by existing tests.
 * Closes #1987 — targets: anonymous .catch(() => {}) on getMe rejection (line 31).
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/",
}));

const mockSetAuthToken = jest.fn();
const mockMarkSessionSettled = jest.fn();
const mockGetMe = jest.fn();
jest.mock("@/lib/api", () => ({
  setAuthToken: (...args: unknown[]) => mockSetAuthToken(...args),
  markSessionSettled: (...args: unknown[]) => mockMarkSessionSettled(...args),
  getMe: (...args: unknown[]) => mockGetMe(...args),
}));

let Providers: React.ComponentType<{ children: React.ReactNode }>;
beforeAll(async () => {
  const mod = await import("@/app/providers");
  Providers = mod.Providers;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({
    data: { backendToken: "tok", backendUser: { id: 1 } },
    status: "authenticated",
  });
});

test("getMe rejection is silently swallowed — no unhandled promise rejection", async () => {
  mockGetMe.mockRejectedValue(new Error("Network failure"));

  // Should not throw
  render(
    <Providers>
      <span>child</span>
    </Providers>,
  );

  // Give the rejected promise a tick to settle
  await waitFor(() => expect(mockGetMe).toHaveBeenCalled());

  // No redirect — the catch swallowed the error
  expect(mockReplace).not.toHaveBeenCalled();
});
