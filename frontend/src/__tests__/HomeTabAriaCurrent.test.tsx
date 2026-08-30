/**
 * Primary nav marks the active destination with aria-current=page. Closes #1121.
 *
 * Was a static source-regex assertion against the old implementation, which
 * passed `current="home" | "bookshelf" | "discover"` down from each page. That
 * mechanism is gone — SiteHeader now derives the active tab from the pathname —
 * so this asserts the behaviour instead of the source text.
 *
 * The extra coverage matters: under the old prop, Upload / Your Notes / Your
 * Word List / Admin were hardcoded `linkClass(false)` and could never be marked
 * current, because no page in those sections rendered the nav at all.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

const mockNav = { pathname: "/" };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => mockNav.pathname,
}));

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

jest.mock("@/lib/api", () => ({
  getMe: () => Promise.resolve({ role: "admin" }),
}));

import SiteHeader, { isActiveNav } from "@/components/SiteHeader";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockNav.pathname = "/";
  mockUseSession.mockReturnValue({
    data: { backendUser: { name: "User", picture: "" } },
    status: "authenticated",
  });
});

describe("primary nav — aria-current", () => {
  test.each([
    ["/", "Home"],
    ["/bookshelf", "Your Bookshelf"],
    ["/upload", "Upload"],
    ["/discover", "Discover"],
    ["/notes", "Your Notes"],
    ["/vocabulary", "Your Word List"],
  ])("%s marks %s as current", async (pathname, label) => {
    mockNav.pathname = pathname;
    render(<SiteHeader />);
    await flushPromises();
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent(label);
  });

  test("exactly one destination is current at a time", async () => {
    mockNav.pathname = "/notes";
    render(<SiteHeader />);
    await flushPromises();
    const marked = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(marked).toHaveLength(1);
  });

  test("a nested route keeps its section marked current", async () => {
    // /notes/42 is still the Notes section — the tab must stay lit.
    mockNav.pathname = "/notes/42";
    render(<SiteHeader />);
    await flushPromises();
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent("Your Notes");
  });

  test("an unrelated route marks nothing current", async () => {
    mockNav.pathname = "/some/other/place";
    render(<SiteHeader />);
    await flushPromises();
    const marked = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(marked).toHaveLength(0);
  });
});

describe("isActiveNav", () => {
  test('"/" matches only itself, never every route', () => {
    expect(isActiveNav("/", "/")).toBe(true);
    expect(isActiveNav("/notes", "/")).toBe(false);
    expect(isActiveNav("/bookshelf", "/")).toBe(false);
  });

  test("a section matches itself and its descendants", () => {
    expect(isActiveNav("/notes", "/notes")).toBe(true);
    expect(isActiveNav("/notes/42", "/notes")).toBe(true);
  });

  test("a prefix that is not a path boundary does not match", () => {
    // /notesomething must not light up the Notes tab.
    expect(isActiveNav("/notesomething", "/notes")).toBe(false);
  });

  test("null pathname is inactive rather than throwing", () => {
    expect(isActiveNav(null, "/notes")).toBe(false);
  });
});
