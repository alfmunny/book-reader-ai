/**
 * Regression test for #1949: flashcards page must show an error state + retry
 * button when getDueFlashcards fails — not a blank card area.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "tok" } }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getDueFlashcards: jest.fn(),
  getFlashcardStats: jest.fn(),
  reviewFlashcard: jest.fn(),
  listDecks: jest.fn(),
}));

import * as api from "@/lib/api";
import FlashcardsPage from "@/app/vocabulary/flashcards/page";

const mockGetDueFlashcards = api.getDueFlashcards as jest.MockedFunction<typeof api.getDueFlashcards>;
const mockGetFlashcardStats = api.getFlashcardStats as jest.MockedFunction<typeof api.getFlashcardStats>;
const mockListDecks = api.listDecks as jest.MockedFunction<typeof api.listDecks>;

const STATS = { reviewed_today: 0, due_today: 1, total_words: 5 };
const CARD = {
  vocabulary_id: 1,
  word: "Schadenfreude",
  definition: "pleasure from others' misfortune",
  context: "Er empfand Schadenfreude.",
  language: "de",
  next_review: new Date().toISOString(),
  interval_days: 1,
  ease_factor: 2.5,
};

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.resetAllMocks();
  mockListDecks.mockResolvedValue([]);
});

test("shows error state when getDueFlashcards fails — not a blank card area", async () => {
  mockGetDueFlashcards.mockRejectedValue(new Error("network error"));
  mockGetFlashcardStats.mockRejectedValue(new Error("network error"));
  render(<FlashcardsPage />);
  await flushPromises();

  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  // No blank region — error is visible, not silent
  expect(screen.queryByText(/tap to reveal/i)).not.toBeInTheDocument();
});

test("Retry button re-fetches and shows cards on success", async () => {
  mockGetDueFlashcards
    .mockRejectedValueOnce(new Error("network error"))
    .mockResolvedValueOnce([CARD]);
  mockGetFlashcardStats
    .mockRejectedValueOnce(new Error("network error"))
    .mockResolvedValueOnce(STATS);

  render(<FlashcardsPage />);
  await flushPromises();

  const retryBtn = await screen.findByRole("button", { name: /retry/i });
  const user = userEvent.setup();
  await user.click(retryBtn);

  await waitFor(() => {
    expect(screen.getByText("Schadenfreude")).toBeInTheDocument();
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("genuine empty queue still shows All-done state — not error", async () => {
  mockGetDueFlashcards.mockResolvedValue([]);
  mockGetFlashcardStats.mockResolvedValue(STATS);
  render(<FlashcardsPage />);

  expect(await screen.findByText(/all done for today/i)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
});
