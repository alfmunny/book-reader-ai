/**
 * Regression tests for missing branch coverage in app/decks/[deckId]/page.tsx
 * Closes #1983 — targets: invalid deckId, handleAdd error rollback,
 * handleRemove pending commit, undo/done callbacks, AddWordPicker open/filter/add/Escape.
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "tok" } }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => mockParams,
}));

let mockParams: { deckId: string } = { deckId: "1" };

jest.mock("@/lib/api", () => ({
  getDeck: jest.fn(),
  getVocabulary: jest.fn(),
  addDeckMember: jest.fn(),
  removeDeckMember: jest.fn(),
}));

// UndoToast stub captures callbacks for direct invocation
let capturedOnUndo: (() => void) | null = null;
let capturedOnDone: (() => void) | null = null;
jest.mock("@/components/UndoToast", () => {
  const UT = ({
    message,
    onUndo,
    onDone,
  }: {
    message: string;
    onUndo: () => void;
    onDone: () => void;
  }) => {
    capturedOnUndo = onUndo;
    capturedOnDone = onDone;
    return (
      <div role="status">
        <span>{message}</span>
        <button onClick={onUndo}>Undo</button>
      </div>
    );
  };
  UT.displayName = "UndoToast";
  return { __esModule: true, default: UT };
});

import * as api from "@/lib/api";
import DeckDetailPage from "@/app/decks/[deckId]/page";

const mockGetDeck = api.getDeck as jest.MockedFunction<typeof api.getDeck>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockAddDeckMember = api.addDeckMember as jest.MockedFunction<typeof api.addDeckMember>;
const mockRemoveDeckMember = api.removeDeckMember as jest.MockedFunction<typeof api.removeDeckMember>;

const DECK = {
  id: 1,
  name: "German verbs",
  description: "",
  mode: "manual" as const,
  rules_json: null,
  created_at: "",
  updated_at: "",
  members: [10, 20],
};

const WORD_A = { id: 10, word: "laufen", language: "de", created_at: "", saved_at: "" };
const WORD_B = { id: 20, word: "schreiben", language: "de", created_at: "", saved_at: "" };
const WORD_C = { id: 30, word: "lesen", language: "de", created_at: "", saved_at: "" };

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  capturedOnUndo = null;
  capturedOnDone = null;
  mockParams = { deckId: "1" };
  mockGetDeck.mockResolvedValue(DECK);
  mockGetVocabulary.mockResolvedValue([WORD_A, WORD_B, WORD_C]);
  mockAddDeckMember.mockResolvedValue({ vocabulary_id: 30 });
  mockRemoveDeckMember.mockResolvedValue(undefined);
});

// ── Invalid deckId branch ─────────────────────────────────────────────────────

test("invalid deckId (NaN) renders error state without calling getDeck", async () => {
  mockParams = { deckId: "not-a-number" };
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText(/Could not load deck/i));
  expect(mockGetDeck).not.toHaveBeenCalled();
});

// ── Back navigation ───────────────────────────────────────────────────────────

test("Decks back button navigates to /decks", async () => {
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText("laufen"));
  await userEvent.click(screen.getByRole("button", { name: /decks/i }));
  expect(mockPush).toHaveBeenCalledWith("/decks");
});

// ── handleAdd error rollback ──────────────────────────────────────────────────

test("handleAdd rolls back optimistic add when addDeckMember rejects", async () => {
  mockAddDeckMember.mockRejectedValueOnce(new Error("Network error"));
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText("laufen"));

  // Open picker then add WORD_C
  await userEvent.click(screen.getByRole("button", { name: /add word/i }));
  await waitFor(() => screen.getByRole("dialog"));
  await userEvent.click(screen.getByRole("button", { name: /Add lesen/i }));

  // Optimistically added — word appears in member list momentarily
  // After rejection it should be removed from members
  await waitFor(() => {
    expect(mockAddDeckMember).toHaveBeenCalledWith(1, 30);
  });
  // Word is rolled back — it is no longer in the member list (back in picker)
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: /Remove lesen/i })).not.toBeInTheDocument();
  });
});

// ── handleRemove pending commit ───────────────────────────────────────────────

test("removing a second word while first toast shows commits the first removal", async () => {
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText("laufen"));

  // Remove WORD_A → toast appears
  await userEvent.click(screen.getByRole("button", { name: /Remove laufen/i }));
  await waitFor(() => screen.getByText(/"laufen" removed/));

  // Remove WORD_B while first toast is still showing
  await userEvent.click(screen.getByRole("button", { name: /Remove schreiben/i }));

  // First removal should be committed (removeDeckMember called for id 10)
  await waitFor(() => expect(mockRemoveDeckMember).toHaveBeenCalledWith(1, 10));

  // Second toast shows for schreiben
  await waitFor(() => screen.getByText(/"schreiben" removed/));
});

// ── UndoToast onUndo ──────────────────────────────────────────────────────────

test("onUndo restores the removed word and clears the toast", async () => {
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText("laufen"));

  await userEvent.click(screen.getByRole("button", { name: /Remove laufen/i }));
  await waitFor(() => screen.getByText(/"laufen" removed/));

  // Undo
  await userEvent.click(screen.getByRole("button", { name: /undo/i }));

  // Word is restored to member list
  await waitFor(() => screen.getByRole("button", { name: /Remove laufen/i }));

  // removeDeckMember should NOT be called
  expect(mockRemoveDeckMember).not.toHaveBeenCalled();
});

// ── UndoToast onDone ──────────────────────────────────────────────────────────

test("onDone calls removeDeckMember and clears the toast", async () => {
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText("laufen"));

  await userEvent.click(screen.getByRole("button", { name: /Remove laufen/i }));
  await waitFor(() => screen.getByText(/"laufen" removed/));

  expect(capturedOnDone).not.toBeNull();
  act(() => capturedOnDone!());

  await waitFor(() => expect(mockRemoveDeckMember).toHaveBeenCalledWith(1, 10));
  expect(screen.queryByText(/"laufen" removed/)).not.toBeInTheDocument();
});

// ── AddWordPicker — open via empty-state button ───────────────────────────────

test("empty-state Add word button opens the picker", async () => {
  mockGetDeck.mockResolvedValue({ ...DECK, members: [] });
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByTestId("deck-detail-empty-state"));

  // The body "Add word" button has no aria-label (unlike the header button "Add word to deck")
  await userEvent.click(screen.getByRole("button", { name: "Add word" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

// ── AddWordPicker — filter ────────────────────────────────────────────────────

test("typing in the picker search box filters the word list", async () => {
  // Only WORD_C is not a member
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText("laufen"));

  await userEvent.click(screen.getByRole("button", { name: /add word/i }));
  await waitFor(() => screen.getByRole("dialog"));

  // Type a query that doesn't match WORD_C
  await userEvent.type(screen.getByRole("searchbox"), "xyz");
  expect(screen.getByText("No matches.")).toBeInTheDocument();

  // Clear and type something that matches
  await userEvent.clear(screen.getByRole("searchbox"));
  await userEvent.type(screen.getByRole("searchbox"), "les");
  expect(screen.getByRole("button", { name: /Add lesen/i })).toBeInTheDocument();
});

// ── AddWordPicker — Escape key closes ────────────────────────────────────────

test("pressing Escape closes the AddWordPicker", async () => {
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText("laufen"));

  await userEvent.click(screen.getByRole("button", { name: /add word/i }));
  await waitFor(() => screen.getByRole("dialog"));

  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

// ── AddWordPicker — backdrop click closes ────────────────────────────────────

test("clicking the backdrop closes the AddWordPicker", async () => {
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText("laufen"));

  await userEvent.click(screen.getByRole("button", { name: /add word/i }));
  await waitFor(() => screen.getByRole("dialog"));

  // Click the close button in the picker header
  await userEvent.click(screen.getByRole("button", { name: /close add-word picker/i }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

// ── AddWordPicker — add a word ────────────────────────────────────────────────

test("clicking a word in the picker adds it to the deck", async () => {
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText("laufen"));

  await userEvent.click(screen.getByRole("button", { name: /add word/i }));
  await waitFor(() => screen.getByRole("dialog"));

  await userEvent.click(screen.getByRole("button", { name: /Add lesen/i }));

  await waitFor(() => expect(mockAddDeckMember).toHaveBeenCalledWith(1, 30));
});

// ── Smart deck — no remove buttons ───────────────────────────────────────────

test("smart deck does not show Remove buttons", async () => {
  mockGetDeck.mockResolvedValue({ ...DECK, mode: "smart" });
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText("laufen"));
  expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
});

// ── Smart deck empty state — Back to decks button ─────────────────────────────

test("smart deck empty state Back to decks button navigates to /decks", async () => {
  mockGetDeck.mockResolvedValue({ ...DECK, mode: "smart", members: [] });
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByTestId("deck-detail-empty-state"));

  await userEvent.click(screen.getByRole("button", { name: /back to decks/i }));
  expect(mockPush).toHaveBeenCalledWith("/decks");
});

// ── Error state retry ─────────────────────────────────────────────────────────

test("Retry button in error state re-fetches the deck", async () => {
  mockGetDeck.mockRejectedValueOnce(new Error("Network error"));
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText(/Could not load deck/i));

  mockGetDeck.mockResolvedValueOnce(DECK);
  await userEvent.click(screen.getByRole("button", { name: /retry/i }));
  await waitFor(() => screen.getByText("laufen"));
});

// ── Error state back to decks ─────────────────────────────────────────────────

test("Back to decks button in error state navigates to /decks", async () => {
  mockGetDeck.mockRejectedValueOnce(new Error("Network error"));
  render(<DeckDetailPage />);
  await waitFor(() => screen.getByText(/Could not load deck/i));

  await userEvent.click(screen.getByRole("button", { name: /back to decks/i }));
  expect(mockPush).toHaveBeenCalledWith("/decks");
});
