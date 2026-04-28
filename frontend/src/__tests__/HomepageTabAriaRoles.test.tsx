/**
 * Regression test for homepage tab bar ARIA roles (closes #2035).
 *
 * Verifies that:
 *  - The tab container has role="tablist"
 *  - Each tab button has role="tab" and aria-selected
 *  - The active tab has aria-selected="true", inactive has "false"
 *  - Each panel has role="tabpanel" and aria-labelledby pointing to its tab
 *  - Clicking a tab updates aria-selected and shows the correct panel
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/",
}));

jest.mock("@/lib/api", () => ({
  searchBooks: jest.fn().mockResolvedValue([]),
  getPopularBooks: jest.fn().mockResolvedValue({ books: [], total: 0 }),
  getMe: jest.fn().mockResolvedValue(null),
  getReadingProgress: jest.fn().mockResolvedValue([]),
  getUserStats: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: () => ({ insightLang: "en", ttsGender: "female", translationEnabled: false }),
  saveSettings: jest.fn(),
}));

jest.mock("next/link", () => {
  const Link = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  );
  Link.displayName = "Link";
  return { __esModule: true, default: Link };
});

jest.mock("@/components/BookDetailModal", () => {
  const BookDetailModal = () => null;
  BookDetailModal.displayName = "BookDetailModal";
  return BookDetailModal;
});

import HomePage from "@/app/page";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

test("tab bar has role=tablist", async () => {
  render(<HomePage />);
  await flushPromises();
  expect(document.querySelector('[role="tablist"]')).toBeInTheDocument();
});

test("Home and Discover buttons have role=tab", async () => {
  render(<HomePage />);
  await flushPromises();
  const tabs = screen.getAllByRole("tab");
  const labels = tabs.map((t) => t.textContent?.trim());
  expect(labels).toContain("Home");
  expect(labels).toContain("Discover");
});

test("active tab has aria-selected=true, inactive has false", async () => {
  render(<HomePage />);
  await flushPromises();

  // Wait for effects to settle (unauthenticated → Discover tab becomes active)
  await waitFor(() => {
    const discoverTab = screen.getByRole("tab", { name: /discover/i });
    expect(discoverTab).toHaveAttribute("aria-selected", "true");
  });
  expect(screen.getByRole("tab", { name: /home/i })).toHaveAttribute("aria-selected", "false");
});

test("clicking a tab updates aria-selected", async () => {
  render(<HomePage />);
  await flushPromises();

  const homeTab = screen.getByRole("tab", { name: /home/i });
  await userEvent.click(homeTab);

  await waitFor(() => {
    expect(homeTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /discover/i })).toHaveAttribute("aria-selected", "false");
  });
});

test("active panel has role=tabpanel and aria-labelledby pointing to active tab", async () => {
  render(<HomePage />);
  await flushPromises();

  // Wait for panel to appear after effects settle
  await waitFor(() => {
    expect(document.querySelector('[role="tabpanel"]')).toBeInTheDocument();
  });

  const panel = document.querySelector('[role="tabpanel"]')!;
  const labelledBy = panel.getAttribute("aria-labelledby");
  expect(labelledBy).toBeTruthy();

  const labellingTab = document.getElementById(labelledBy!);
  expect(labellingTab).toBeInTheDocument();
  expect(labellingTab?.getAttribute("aria-selected")).toBe("true");
});
