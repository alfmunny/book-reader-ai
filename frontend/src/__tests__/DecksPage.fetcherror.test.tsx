/**
 * Regression test for #1941: decks page must show a proper error state
 * (with a retry button) when listDecks() fails — not the empty-decks state.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "token" } }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/api", () => ({
  listDecks: jest.fn(),
  deleteDeck: jest.fn(),
}));

import * as api from "@/lib/api";
import DecksPage from "@/app/decks/page";

const mockListDecks = api.listDecks as jest.MockedFunction<typeof api.listDecks>;

beforeEach(() => {
  jest.clearAllMocks();
});

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

test("shows error state with retry button on fetch failure — not empty-decks state", async () => {
  mockListDecks.mockRejectedValue(new Error("network error"));
  render(<DecksPage />);
  await flushPromises();

  // Should NOT show the "no decks" empty state
  expect(screen.queryByTestId("decks-empty-state")).not.toBeInTheDocument();

  // Should show an error UI with a retry CTA
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
});

test("retry button re-fetches and shows decks on success", async () => {
  const DECKS = [
    {
      id: 1,
      name: "German verbs",
      description: "",
      mode: "manual" as const,
      rules_json: null,
      created_at: "2026-04-24T08:00:00",
      updated_at: "2026-04-24T08:00:00",
      member_count: 5,
      due_today: 0,
    },
  ];

  mockListDecks
    .mockRejectedValueOnce(new Error("network error"))
    .mockResolvedValueOnce(DECKS);

  render(<DecksPage />);
  await flushPromises();

  const retryBtn = await screen.findByRole("button", { name: /try again/i });
  const user = userEvent.setup();
  await user.click(retryBtn);

  await waitFor(() => {
    expect(screen.getByText("German verbs")).toBeInTheDocument();
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("empty state still shows when decks list is genuinely empty", async () => {
  mockListDecks.mockResolvedValue([]);
  render(<DecksPage />);

  expect(await screen.findByTestId("decks-empty-state")).toBeInTheDocument();
  // No error UI
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
});
