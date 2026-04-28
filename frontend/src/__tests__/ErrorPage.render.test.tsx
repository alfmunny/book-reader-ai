/**
 * Regression tests for #2013 — app/error.tsx has 0% runtime coverage.
 * The existing ErrorPage.test.ts only reads the file as a string; these
 * tests actually render the component so Istanbul tracks the branches.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/link", () => {
  const Link = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  );
  Link.displayName = "Link";
  return { __esModule: true, default: Link };
});

import ErrorPage from "@/app/error";

test("renders the error message from the error prop", () => {
  const reset = jest.fn();
  render(<ErrorPage error={new Error("Something exploded")} reset={reset} />);
  expect(screen.getByText("Something exploded")).toBeInTheDocument();
});

test("falls back to default text when error.message is empty (line 17 branch)", () => {
  const reset = jest.fn();
  render(<ErrorPage error={new Error("")} reset={reset} />);
  expect(screen.getByText(/unexpected error occurred/i)).toBeInTheDocument();
});

test("Try again button calls reset()", async () => {
  const reset = jest.fn();
  const user = userEvent.setup();
  render(<ErrorPage error={new Error("oops")} reset={reset} />);
  await user.click(screen.getByRole("button", { name: /try again/i }));
  expect(reset).toHaveBeenCalledTimes(1);
});

test("Library link points to /", () => {
  const reset = jest.fn();
  render(<ErrorPage error={new Error("oops")} reset={reset} />);
  expect(screen.getByRole("link", { name: /library/i })).toHaveAttribute("href", "/");
});

test("error block has role=alert", () => {
  const reset = jest.fn();
  render(<ErrorPage error={new Error("oops")} reset={reset} />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
});
