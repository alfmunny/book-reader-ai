/**
 * Regression tests for #2003 — coverage gaps in vocabulary/flashcards/page.tsx:
 *   line  30: readLastDeckId catch block (localStorage.getItem throws)
 *   line  37: persistLastDeckId catch block (localStorage.setItem throws)
 *   line 149: Back button onClick → router.push("/vocabulary")
 *   line 251: card onKeyDown handler — Enter / Space flip
 *
 * The existing FlashcardsCoverage.test.tsx covers keyboard via
 * card.focus() + userEvent.keyboard("{Enter}"), but userEvent converts
 * Enter to a synthetic click on role="button" divs, leaving the onKeyDown
 * callback uninvoked. fireEvent.keyDown is used here to hit line 251 directly.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";

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
const mockStats = api.getFlashcardStats as jest.MockedFunction<typeof api.getFlashcardStats>;
const mockListDecks = api.listDecks as jest.MockedFunction<typeof api.listDecks>;

const STATS = { reviewed_today: 0, due_today: 1, total: 1 };
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

const DECKS = [{ id: 1, name: "German", due_today: 3, total_cards: 10 }];

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockListDecks.mockResolvedValue([]);
  mockGetDue.mockResolvedValue([CARD]);
  mockStats.mockResolvedValue(STATS);
});

// ── line 149: Back button → router.push("/vocabulary") ───────────────────────

test("Back button calls router.push('/vocabulary') (line 149, #2003)", async () => {
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));

  await userEvent.click(screen.getByRole("button", { name: /back to vocabulary/i }));
  expect(mockPush).toHaveBeenCalledWith("/vocabulary");
});

// ── line 251: card onClick — clicking the card div flips it ─────────────────

test("clicking the card div directly toggles flipped state via onClick (line 251, #2003)", async () => {
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));

  // Click the card div itself (not the "Show answer" button) to flip it via onClick
  const card = screen.getByRole("button", { name: /press to reveal definition/i });
  await userEvent.click(card);

  // After click, grade buttons appear (flipped=true)
  await waitFor(() => screen.getByRole("button", { name: "Good" }));
});

// ── line 252: card onKeyDown — Enter / Space flip card back ──────────────────

test("Enter keydown on card div invokes onKeyDown handler and flips card (line 251, #2003)", async () => {
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));

  // Flip to the definition side first via "Show answer" button so the card is in flipped=true state
  await userEvent.click(screen.getByText("Show answer"));
  await waitFor(() => screen.getByRole("button", { name: "Good" }));

  // Now the card is flipped — pressing Enter should flip it back via onKeyDown
  const card = screen.getByRole("button", { name: /press to flip back/i });
  fireEvent.keyDown(card, { key: "Enter" });

  // Card flipped back — grade buttons gone, "Show answer" visible again
  await waitFor(() => screen.getByText("Show answer"));
  expect(screen.queryByRole("button", { name: "Good" })).not.toBeInTheDocument();
});

test("Space keydown on card div invokes onKeyDown handler and flips card (line 251, #2003)", async () => {
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));

  await userEvent.click(screen.getByText("Show answer"));
  await waitFor(() => screen.getByRole("button", { name: "Good" }));

  const card = screen.getByRole("button", { name: /press to flip back/i });
  fireEvent.keyDown(card, { key: " " });

  await waitFor(() => screen.getByText("Show answer"));
});

test("non-activating key on card does not flip it (line 251 branch, #2003)", async () => {
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));

  const card = screen.getByRole("button", { name: /press to reveal definition/i });
  fireEvent.keyDown(card, { key: "Tab" });

  // Grade buttons should NOT appear — card stays unflipped
  expect(screen.queryByRole("button", { name: "Good" })).not.toBeInTheDocument();
  expect(screen.getByText("Show answer")).toBeInTheDocument();
});

// ── line 30: readLastDeckId catch block ──────────────────────────────────────

test("readLastDeckId returns undefined when localStorage.getItem throws (line 30, #2003)", async () => {
  mockListDecks.mockResolvedValue(DECKS);
  const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Private browsing");
  });

  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));

  // getDueFlashcards should be called with undefined (no deck restored due to error)
  expect(mockGetDue).toHaveBeenCalledWith(undefined);
  spy.mockRestore();
});

// ── line 37: persistLastDeckId(undefined) → localStorage.removeItem ──────────

test("switching to 'All decks' calls persistLastDeckId(undefined) → removeItem (line 37, #2003)", async () => {
  // Seed a saved deck id so the component starts with deck 1 selected
  localStorage.setItem("flashcards.lastDeckId", "1");
  mockListDecks.mockResolvedValue(DECKS);
  mockGetDue.mockResolvedValue([CARD]);
  mockStats.mockResolvedValue(STATS);

  render(<FlashcardsPage />);
  await waitFor(() => screen.getByRole("combobox", { name: /deck/i }), { timeout: 3000 });

  const select = screen.getByRole("combobox", { name: /deck/i });
  // Selecting "All decks" (value="") triggers persistLastDeckId(undefined) → removeItem → line 37
  fireEvent.change(select, { target: { value: "" } });

  // localStorage key should be removed
  await waitFor(() => expect(localStorage.getItem("flashcards.lastDeckId")).toBeNull());
});

// ── line 37: persistLastDeckId catch — swallowed error ────────────────────────

test("persistLastDeckId does not propagate localStorage errors (catch block, #2003)", async () => {
  mockListDecks.mockResolvedValue(DECKS);
  mockGetDue.mockResolvedValue([CARD]);
  mockStats.mockResolvedValue(STATS);

  render(<FlashcardsPage />);
  await waitFor(() => screen.getByRole("combobox", { name: /deck/i }), { timeout: 3000 });

  const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Private browsing");
  });

  const select = screen.getByRole("combobox", { name: /deck/i });
  // setItem throws → catch runs → no propagation
  expect(() => fireEvent.change(select, { target: { value: "1" } })).not.toThrow();
  spy.mockRestore();
});
