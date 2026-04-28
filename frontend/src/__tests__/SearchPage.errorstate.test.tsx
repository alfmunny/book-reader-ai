/**
 * Regression test for #1953: in-app search page error banner must include
 * AlertCircleIcon (SVG), not just bare red text.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

const mockSearchParams = { get: (k: string) => (k === "q" ? "hamlet" : null) };

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn() }),
}));

const mockSearchFn = jest.fn();
jest.mock("@/lib/api", () => ({
  searchInAppContent: (...args: unknown[]) => mockSearchFn(...args),
}));

import SearchPage from "@/app/search/page";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockSearchFn.mockReset();
});

test("search error alert contains an SVG icon (AlertCircleIcon)", async () => {
  mockSearchFn.mockRejectedValue(new Error("network error"));
  render(<SearchPage />);
  await flushPromises();

  const alert = await screen.findByRole("alert");
  expect(alert).toBeInTheDocument();
  const svg = alert.querySelector("svg");
  expect(svg).not.toBeNull();
});

test("search error alert is gone after re-render with successful response", async () => {
  mockSearchFn
    .mockRejectedValueOnce(new Error("fail"))
    .mockResolvedValueOnce({ query: "hamlet", total: 0, results: [] });

  const { rerender } = render(<SearchPage />);
  await flushPromises();

  expect(await screen.findByRole("alert")).toBeInTheDocument();

  // Change search params to trigger re-fetch
  mockSearchParams.get = (k: string) => (k === "q" ? "othello" : null);
  rerender(<SearchPage />);
  await flushPromises();

  await waitFor(() => {
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
