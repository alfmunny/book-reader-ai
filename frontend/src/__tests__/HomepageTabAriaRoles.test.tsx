/**
 * Primary navigation exposes correct semantics to assistive tech.
 *
 * Originally asserted the Home/Discover tab strip (role=tablist / role=tab /
 * aria-selected). With #2711 the strip became real navigation — Home and Your
 * Bookshelf are separate routes — so the correct semantics are a <nav> landmark
 * with links, and aria-current marking the active one. Tabs would now be wrong:
 * they promise in-page panels that no longer exist.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getMe: () => Promise.resolve({ role: "user" }),
}));

import SiteHeader from "@/components/SiteHeader";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({
    data: { backendUser: { name: "User", picture: "" } },
    status: "authenticated",
  });
});

test("primary navigation is a labelled nav landmark", async () => {
  render(<SiteHeader current="home" />);
  await flushPromises();
  expect(screen.getByRole("navigation", { name: /main navigation/i })).toBeInTheDocument();
});

test("Home and Your Bookshelf are links, not tabs", async () => {
  render(<SiteHeader current="home" />);
  await flushPromises();
  const labels = screen.getAllByRole("link").map((l) => l.textContent?.trim());
  expect(labels).toContain("Home");
  expect(labels).toContain("Your Bookshelf");
  // Tabs promise in-page panels; these navigate to real routes.
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
});

test("the active destination is marked with aria-current=page", async () => {
  render(<SiteHeader current="bookshelf" />);
  await flushPromises();
  const current = screen.getByRole("link", { current: "page" });
  expect(current).toHaveTextContent("Your Bookshelf");
});

test("only one destination is current at a time", async () => {
  render(<SiteHeader current="home" />);
  await flushPromises();
  const marked = screen.getAllByRole("link").filter(
    (l) => l.getAttribute("aria-current") === "page",
  );
  expect(marked).toHaveLength(1);
  expect(marked[0]).toHaveTextContent("Home");
});

test("Your Bookshelf is hidden from signed-out visitors", async () => {
  mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
  render(<SiteHeader current="home" />);
  await flushPromises();
  const labels = screen.getAllByRole("link").map((l) => l.textContent?.trim());
  expect(labels).not.toContain("Your Bookshelf");
});
