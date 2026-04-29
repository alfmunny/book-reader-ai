/**
 * Regression tests for missing branch coverage in vocabulary/flashcards/page.tsx
 * Closes #1973 — targets: multi-card advance, deck selector rendering,
 * localStorage saved-deck restore, and persistLastDeckId(undefined).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "tok" } }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
const mockReview = api.reviewFlashcard as jest.MockedFunction<typeof api.reviewFlashcard>;
const mockStats = api.getFlashcardStats as jest.MockedFunction<typeof api.getFlashcardStats>;
const mockListDecks = api.listDecks as jest.MockedFunction<typeof api.listDecks>;

const STATS = { reviewed_today: 0, due_today: 2, total: 2 };
const CARD_A = {
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
const CARD_B = {
  vocabulary_id: 2,
  word: "stoic",
  context: "A stoic philosopher.",
  due_date: "2026-04-28",
  interval_days: 1,
  ease_factor: 2.5,
  repetitions: 0,
  last_reviewed_at: null,
  saved_at: "2026-04-21T10:00:00",
};
const DECKS = [
  { id: 1, name: "German", due_today: 3, total_cards: 10 },
  { id: 2, name: "French", due_today: 0, total_cards: 5 },
];

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockListDecks.mockResolvedValue([]);
  mockReview.mockResolvedValue({
    vocabulary_id: 1,
    interval_days: 1,
    ease_factor: 2.36,
    repetitions: 1,
    next_due: "2026-04-29",
  });
});

// ── Multi-card advance ────────────────────────────────────────────────────────

test("grading first card of two advances to second card instead of showing done", async () => {
  mockGetDue.mockResolvedValue([CARD_A, CARD_B]);
  mockStats.mockResolvedValue(STATS);

  render(<FlashcardsPage />);
  await waitFor(() => screen.getAllByText("ephemeral")[0]);

  // Flip and grade first card
  await userEvent.click(screen.getByText("Show answer"));
  await userEvent.click(screen.getByRole("button", { name: /Good/i }));

  // Should advance to second card, not show "All done"
  await waitFor(() => screen.getAllByText("stoic")[0]);
  expect(screen.queryByText(/all done for today/i)).not.toBeInTheDocument();
  // Now on card index 1 → "2 of 2 remaining"
  expect(screen.getByText(/2 of 2 remaining/i)).toBeInTheDocument();
});

test("card counter shows correct position after advancing", async () => {
  mockGetDue.mockResolvedValue([CARD_A, CARD_B]);
  mockStats.mockResolvedValue(STATS);

  render(<FlashcardsPage />);
  await waitFor(() => screen.getAllByText("ephemeral")[0]);

  // Initially shows card 1 of 2
  expect(screen.getByRole("status", { name: "" })).toBeInTheDocument();
  const counter = screen.getByText(/1 of 2 remaining/);
  expect(counter).toBeInTheDocument();

  await userEvent.click(screen.getByText("Show answer"));
  await userEvent.click(screen.getByRole("button", { name: /Again/i }));

  // Now showing card 2 of 2
  await waitFor(() => screen.getAllByText("stoic")[0]);
  expect(screen.getByText(/2 of 2 remaining/)).toBeInTheDocument();
});

// ── Deck selector ─────────────────────────────────────────────────────────────

test("deck selector renders when listDecks returns decks", async () => {
  mockListDecks.mockResolvedValue(DECKS);
  mockGetDue.mockResolvedValue([]);
  mockStats.mockResolvedValue({ reviewed_today: 0, due_today: 0, total: 0 });

  render(<FlashcardsPage />);
  await flushPromises();
  await screen.findByText(/all done for today/i);

  // Deck selector appears with "All decks" default + deck options
  const select = await screen.findByRole("combobox", { name: /deck/i });
  expect(select).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /german/i })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /french/i })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /all decks/i })).toBeInTheDocument();
});

test("changing deck selector triggers re-fetch with new deck id", async () => {
  mockListDecks.mockResolvedValue(DECKS);
  mockGetDue.mockResolvedValue([]);
  mockStats.mockResolvedValue({ reviewed_today: 0, due_today: 0, total: 0 });

  render(<FlashcardsPage />);
  await flushPromises();
  await screen.findByText(/all done for today/i);

  const select = await screen.findByRole("combobox", { name: /deck/i });
  await userEvent.selectOptions(select, "1");

  // getDueFlashcards should be called again with deck id 1
  await waitFor(() => expect(mockGetDue).toHaveBeenCalledWith(1));
});

test("selecting 'All decks' calls getDueFlashcards with undefined", async () => {
  mockListDecks.mockResolvedValue(DECKS);
  mockGetDue.mockResolvedValue([]);
  mockStats.mockResolvedValue({ reviewed_today: 0, due_today: 0, total: 0 });

  render(<FlashcardsPage />);
  await flushPromises();
  await screen.findByText(/all done for today/i);

  const select = await screen.findByRole("combobox", { name: /deck/i });

  // First select a deck
  await userEvent.selectOptions(select, "1");
  await waitFor(() => expect(mockGetDue).toHaveBeenCalledWith(1));

  // Then revert to "All decks" (value "")
  await userEvent.selectOptions(select, "");
  await waitFor(() => expect(mockGetDue).toHaveBeenCalledWith(undefined));
});

// ── localStorage saved-deck restore ──────────────────────────────────────────

test("restores saved deck id from localStorage when deck exists in loaded list", async () => {
  localStorage.setItem("flashcards.lastDeckId", "1");
  mockListDecks.mockResolvedValue(DECKS);
  mockGetDue.mockResolvedValue([]);
  mockStats.mockResolvedValue({ reviewed_today: 0, due_today: 0, total: 0 });

  render(<FlashcardsPage />);
  await flushPromises();
  await screen.findByText(/all done for today/i);

  // getDueFlashcards should be called with the restored deck id
  await waitFor(() => expect(mockGetDue).toHaveBeenCalledWith(1));

  // The select should show deck 1 as selected
  const select = await screen.findByRole("combobox", { name: /deck/i }) as HTMLSelectElement;
  expect(select.value).toBe("1");
});

test("ignores localStorage deck id when it does not match any loaded deck", async () => {
  localStorage.setItem("flashcards.lastDeckId", "999");
  mockListDecks.mockResolvedValue(DECKS);
  mockGetDue.mockResolvedValue([]);
  mockStats.mockResolvedValue({ reviewed_today: 0, due_today: 0, total: 0 });

  render(<FlashcardsPage />);
  await flushPromises();
  await screen.findByText(/all done for today/i);

  // Should fall back to "All decks" (undefined)
  const select = await screen.findByRole("combobox", { name: /deck/i }) as HTMLSelectElement;
  expect(select.value).toBe("");
});

// ── Card keyboard flip ────────────────────────────────────────────────────────

test("pressing Enter on card flips it to reveal answer side", async () => {
  mockGetDue.mockResolvedValue([CARD_A]);
  mockStats.mockResolvedValue(STATS);

  render(<FlashcardsPage />);
  await waitFor(() => screen.getAllByText("ephemeral")[0]);

  const card = screen.getByRole("button", { name: /press to reveal definition/i });
  card.focus();
  await userEvent.keyboard("{Enter}");

  // Grade buttons now visible
  await waitFor(() => screen.getByRole("button", { name: /Good/i }));
  expect(screen.queryByText("Show answer")).not.toBeInTheDocument();
});

test("pressing Space on card flips it to reveal answer side", async () => {
  mockGetDue.mockResolvedValue([CARD_A]);
  mockStats.mockResolvedValue(STATS);

  render(<FlashcardsPage />);
  await waitFor(() => screen.getAllByText("ephemeral")[0]);

  const card = screen.getByRole("button", { name: /press to reveal definition/i });
  card.focus();
  await userEvent.keyboard(" ");

  await waitFor(() => screen.getByRole("button", { name: /Good/i }));
});

// ── Done state with selected deck ─────────────────────────────────────────────

test("done state shows deck-specific message when a deck is selected", async () => {
  mockListDecks.mockResolvedValue(DECKS);
  mockGetDue.mockResolvedValue([CARD_A]);
  mockStats.mockResolvedValue(STATS);
  mockReview.mockResolvedValue({
    vocabulary_id: 1,
    interval_days: 1,
    ease_factor: 2.36,
    repetitions: 1,
    next_due: "2026-04-29",
  });
  mockStats
    .mockResolvedValueOnce(STATS)
    .mockResolvedValue({ reviewed_today: 1, due_today: 0, total: 1 });

  render(<FlashcardsPage />);
  await flushPromises();
  await screen.findAllByText("ephemeral").then(els => els[0]);

  // Select a specific deck
  const select = await screen.findByRole("combobox", { name: /deck/i });
  await userEvent.selectOptions(select, "1");

  // Drain the reload
  await waitFor(() => screen.getAllByText("ephemeral")[0]);

  // Grade the card
  await userEvent.click(screen.getByText("Show answer"));
  await userEvent.click(screen.getByRole("button", { name: /Easy/i }));

  // Done state should show deck-specific message
  await waitFor(() => screen.getByText(/all done for today/i));
  expect(screen.getByText(/no more cards due in/i)).toBeInTheDocument();
});
