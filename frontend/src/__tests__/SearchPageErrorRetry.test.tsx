/**
 * Regression test for #2479: search error state must include a Retry button
 * so users can re-run the same query without having to retype it.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSearchParams = { get: (k: string) => (k === "q" ? "hamlet" : null) };

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn() }),
}));

const mockSearchFn = jest.fn();
jest.mock("@/lib/api", () => ({
  searchInAppContent: (...args: unknown[]) => mockSearchFn(...args),
}));

import SearchPage from "@/app/(shell)/search/page";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockSearchFn.mockReset();
});

describe("search error state — retry button (closes #2479)", () => {
  it("shows a Retry button inside the error alert", async () => {
    mockSearchFn.mockRejectedValue(new Error("network error"));
    render(<SearchPage />);
    await flushPromises();

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("clicking Retry re-runs the search and clears the error on success", async () => {
    mockSearchFn
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ query: "hamlet", total: 0, results: [] });

    render(<SearchPage />);
    await flushPromises();

    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    await flushPromises();

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(mockSearchFn).toHaveBeenCalledTimes(2);
  });
});
