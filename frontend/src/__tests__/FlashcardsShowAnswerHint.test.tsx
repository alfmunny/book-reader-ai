/**
 * Regression test for #2126 — 'Show answer' button must display a
 * Space/Enter keyboard shortcut hint consistent with the grade buttons.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "tok" } }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/api", () => ({
  getDueFlashcards: jest.fn(),
  reviewFlashcard: jest.fn(),
  getFlashcardStats: jest.fn(),
  listDecks: jest.fn(),
}));

import * as api from "@/lib/api";
import FlashcardsPage from "@/app/vocabulary/flashcards/page";

const mockGetDue = api.getDueFlashcards as jest.MockedFunction<typeof api.getDueFlashcards>;
const mockStats = api.getFlashcardStats as jest.MockedFunction<typeof api.getFlashcardStats>;
const mockListDecks = api.listDecks as jest.MockedFunction<typeof api.listDecks>;

const CARD = {
  vocabulary_id: 1,
  word: "ephemeral",
  context: "An ephemeral moment.",
  due_date: "2026-04-28",
  interval_days: 1,
  ease_factor: 2.5,
  repetitions: 0,
  last_reviewed_at: null,
  saved_at: "2026-04-20T10:00:00",
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockListDecks.mockResolvedValue([]);
  mockGetDue.mockResolvedValue([CARD]);
  mockStats.mockResolvedValue({ reviewed_today: 0, due_today: 1, total: 1 });
});

test("Show answer button displays a Space keyboard shortcut hint", async () => {
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));

  const btn = screen.getByRole("button", { name: /show answer/i });
  expect(btn.textContent).toMatch(/space|enter|⎵/i);
});

test("Show answer button aria-label includes keyboard shortcut context", async () => {
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));

  const btn = screen.getByRole("button", { name: /show answer/i });
  // Either visible text or aria-label should mention Space/Enter
  const label = btn.getAttribute("aria-label") ?? btn.textContent ?? "";
  expect(label).toMatch(/space|enter/i);
});
