/**
 * Tests for src/app/providers.tsx
 * Covers the Providers wrapper and TokenSync inner component.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

// ─── next-auth ────────────────────────────────────────────────────────────────
const mockUseSession = jest.fn();

jest.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  ),
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

// ─── next/navigation ─────────────────────────────────────────────────────────
const mockReplace = jest.fn();
const mockUsePathname = jest.fn(() => "/");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: (...args: unknown[]) => mockUsePathname(...args),
}));

// ─── @/lib/api ────────────────────────────────────────────────────────────────
const mockSetAuthToken = jest.fn();
const mockMarkSessionSettled = jest.fn();
const mockGetMe = jest.fn();

jest.mock("@/lib/api", () => ({
  setAuthToken: (...args: unknown[]) => mockSetAuthToken(...args),
  markSessionSettled: (...args: unknown[]) => mockMarkSessionSettled(...args),
  getMe: (...args: unknown[]) => mockGetMe(...args),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
let Providers: React.ComponentType<{ children: React.ReactNode }>;

beforeAll(async () => {
  const mod = await import("@/app/providers");
  Providers = mod.Providers;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMe.mockResolvedValue({ approved: true, role: "user" });
  mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
  mockUsePathname.mockReturnValue("/");
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Providers — renders children", () => {
  it("renders children inside the SessionProvider", () => {
    render(
      <Providers>
        <div data-testid="child">Hello</div>
      </Providers>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("wraps children in SessionProvider", () => {
    render(
      <Providers>
        <span>test</span>
      </Providers>,
    );
    expect(screen.getByTestId("session-provider")).toBeInTheDocument();
  });

  it("renders multiple children", () => {
    render(
      <Providers>
        <div data-testid="a">A</div>
        <div data-testid="b">B</div>
      </Providers>,
    );
    expect(screen.getByTestId("a")).toBeInTheDocument();
    expect(screen.getByTestId("b")).toBeInTheDocument();
  });
});

describe("Providers — TokenSync: setAuthToken on session change", () => {
  it("calls setAuthToken(null) when unauthenticated", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    render(
      <Providers>
        <span>child</span>
      </Providers>,
    );
    await waitFor(() => {
      expect(mockSetAuthToken).toHaveBeenCalledWith(null);
    });
  });

  it("calls markSessionSettled when status is not loading", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    render(
      <Providers>
        <span>child</span>
      </Providers>,
    );
    await waitFor(() => {
      expect(mockMarkSessionSettled).toHaveBeenCalled();
    });
  });

  it("does not call setAuthToken while session is loading", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "loading" });
    render(
      <Providers>
        <span>child</span>
      </Providers>,
    );
    // Give effects a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSetAuthToken).not.toHaveBeenCalled();
  });

  it("calls setAuthToken with backendToken when authenticated", async () => {
    mockUseSession.mockReturnValue({
      data: { backendToken: "my-token", backendUser: { id: 1 } },
      status: "authenticated",
    });
    render(
      <Providers>
        <span>child</span>
      </Providers>,
    );
    await waitFor(() => {
      expect(mockSetAuthToken).toHaveBeenCalledWith("my-token");
    });
  });
});

describe("Providers — TokenSync: approval redirect", () => {
  it("redirects to /pending when user is not approved", async () => {
    mockGetMe.mockResolvedValue({ approved: false, role: "user" });
    mockUseSession.mockReturnValue({
      data: { backendToken: "my-token", backendUser: { id: 1 } },
      status: "authenticated",
    });
    mockUsePathname.mockReturnValue("/");
    render(
      <Providers>
        <span>child</span>
      </Providers>,
    );
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/pending");
    });
  });

  it("does NOT redirect when user is approved", async () => {
    mockGetMe.mockResolvedValue({ approved: true, role: "user" });
    mockUseSession.mockReturnValue({
      data: { backendToken: "my-token", backendUser: { id: 1 } },
      status: "authenticated",
    });
    render(
      <Providers>
        <span>child</span>
      </Providers>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does NOT redirect to /pending when already on /pending", async () => {
    mockGetMe.mockResolvedValue({ approved: false, role: "user" });
    mockUseSession.mockReturnValue({
      data: { backendToken: "my-token", backendUser: { id: 1 } },
      status: "authenticated",
    });
    mockUsePathname.mockReturnValue("/pending");
    render(
      <Providers>
        <span>child</span>
      </Providers>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does NOT call getMe when no backendToken", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    render(
      <Providers>
        <span>child</span>
      </Providers>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGetMe).not.toHaveBeenCalled();
  });
});
