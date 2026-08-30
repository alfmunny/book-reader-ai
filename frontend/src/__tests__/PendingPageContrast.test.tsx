/**
 * Regression test for #2128 — pending page hint text must not use
 * text-stone-400 (contrast ~2.1:1 on parchment — fails WCAG AA).
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/api", () => ({
  getMe: jest.fn(() => new Promise(() => {})),
}));

import PendingApprovalPage from "@/app/(shell)/pending/page";

test("hint text does not use text-stone-400 (WCAG AA contrast failure)", () => {
  const { container } = render(<PendingApprovalPage />);
  const hint = screen.getByText(/checking automatically/i);
  expect(hint.className).not.toContain("text-stone-400");
});

test("hint text uses a color class with sufficient contrast", () => {
  render(<PendingApprovalPage />);
  const hint = screen.getByText(/checking automatically/i);
  // stone-500 (3.88:1 on white) or darker passes WCAG AA for supplementary text
  // stone-600 (~6.6:1 on parchment) is the preferred choice
  expect(hint.className).toMatch(/text-stone-[5-9]00|text-amber-[7-9]00|text-ink/);
});
