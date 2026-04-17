/**
 * The admin layout shows Overview Stats that change per tab.
 * Previous behaviour: always-on Users/Pending/Books/Audio cards on every tab,
 * including Queue and Bulk where those numbers are meaningless.
 * New behaviour: stats card set is driven by the active sub-route.
 *
 * Guards against regressions that would re-introduce the all-tabs banner.
 */

import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import AdminLayout from "@/app/admin/layout";

let currentPath = "/admin/users";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => currentPath,
}));
jest.mock("next/link", () => {
  const MockLink = ({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  MockLink.displayName = "MockLink";
  return { __esModule: true, default: MockLink };
});

jest.mock("@/lib/api", () => ({
  getMe: () => Promise.resolve({ id: 1, role: "admin" }),
  getAuthToken: () => "test-token",
  awaitSession: () => Promise.resolve(),
}));

jest.mock("@/lib/adminFetch", () => ({
  adminFetch: () =>
    Promise.resolve({
      users_total: 3,
      users_approved: 2,
      users_pending: 1,
      books_cached: 42,
      audio_chunks_cached: 100,
      audio_cache_mb: 12,
      translations_cached: 210,
    }),
}));

async function renderAt(path: string) {
  currentPath = path;
  render(
    <AdminLayout>
      <div data-testid="child">child</div>
    </AdminLayout>,
  );
  await waitFor(() => expect(screen.getByTestId("child")).toBeInTheDocument());
}

function statsLabels(): string[] {
  const grid = screen.queryByTestId("admin-stats-grid");
  if (!grid) return [];
  // Each card's label is a small amber div; just collect all text.
  return Array.from(grid.querySelectorAll("div.text-xs")).map((n) => n.textContent?.trim() || "");
}

describe("admin layout contextual stats", () => {
  it("shows Users + Pending on /admin/users", async () => {
    await renderAt("/admin/users");
    await waitFor(() => expect(screen.getByTestId("admin-stats-grid")).toBeInTheDocument());
    const grid = screen.getByTestId("admin-stats-grid");
    expect(within(grid).getByText("Users")).toBeInTheDocument();
    expect(within(grid).getByText("Pending")).toBeInTheDocument();
    expect(statsLabels()).toEqual(["Users", "Pending"]);
  });

  it("shows Books + Translations on /admin/books", async () => {
    await renderAt("/admin/books");
    await waitFor(() => expect(screen.getByTestId("admin-stats-grid")).toBeInTheDocument());
    expect(statsLabels()).toEqual(["Books", "Translations"]);
  });

  it("shows Audio + Chunks on /admin/audio", async () => {
    await renderAt("/admin/audio");
    await waitFor(() => expect(screen.getByTestId("admin-stats-grid")).toBeInTheDocument());
    expect(statsLabels()).toEqual(["Audio", "Chunks"]);
  });

  it("renders no overview cards on /admin/queue", async () => {
    await renderAt("/admin/queue");
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId("admin-stats-grid")).toBeNull();
  });

  it("renders no overview cards on /admin/bulk", async () => {
    await renderAt("/admin/bulk");
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId("admin-stats-grid")).toBeNull();
  });
});
