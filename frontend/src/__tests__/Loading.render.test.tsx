/**
 * Regression tests for #2016 — app/loading.tsx has 0% runtime coverage.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import Loading from "@/app/loading";

test("renders a loading status region", () => {
  render(<Loading />);
  expect(screen.getByRole("status")).toBeInTheDocument();
});

test("has an accessible label for the loading state", () => {
  render(<Loading />);
  expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading page");
});

test("has sr-only text for screen readers", () => {
  render(<Loading />);
  expect(screen.getByText(/loading page/i)).toBeInTheDocument();
});
