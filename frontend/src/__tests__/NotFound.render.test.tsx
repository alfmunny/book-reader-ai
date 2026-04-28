/**
 * Regression tests for #2016 — app/not-found.tsx has 0% runtime coverage.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/link", () => {
  const Link = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  );
  Link.displayName = "Link";
  return { __esModule: true, default: Link };
});

import NotFound from "@/app/not-found";

test("renders the Page not found heading", () => {
  render(<NotFound />);
  expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
});

test("renders a link to the library (Browse books → /)", () => {
  render(<NotFound />);
  const link = screen.getByRole("link", { name: /browse books/i });
  expect(link).toHaveAttribute("href", "/");
});

test("has a main landmark", () => {
  render(<NotFound />);
  expect(screen.getByRole("main")).toBeInTheDocument();
});
