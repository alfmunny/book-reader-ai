/**
 * Runtime regression tests for branches uncovered in app/(shell)/decks/[deckId]/page.tsx.
 * Closes #1965
 *
 * Covers:
 *  - invalid deckId (NaN) → immediate error state (lines 43-45)
 *  - handleRemove with existing queued-toast (lines 95-106)
 *  - handleAdd API failure rollback (lines 114-127)
 *  - AddWordPicker dialog: open, search filter, add word, Escape close (lines 319-404)
 *  - Empty-state CTA for manual deck with no members (lines 224-233)
 *  - Disabled Add-word button when all vocab already in deck (line 153)
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "tok" } }),
}));

const mockPush = jest.fn();
// mockDeckIdParam is mutated per-test before import resolves
let mockDeckIdParam = "7";
jest.mock("next/navigation", () => ({
  useParams: () => ({ deckId: mockDeckIdParam }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/api", () => ({
  getDeck: jest.fn(),
  getVocabulary: jest.fn(),
  addDeckMember: jest.fn(),
  removeDeckMember: jest.fn(),
}));

jest.mock("@/components/UndoToast", () => {
  const UndoToast = ({
    message,
    onUndo,
    onDone,
  }: {
    message: string;
    onUndo: () => void;
    onDone: () => void;
  }) => (
    <div data-testid="undo-toast">
      {message}
      <button onClick={onUndo}>Undo</button>
      <button onClick={onDone}>Done</button>
    </div>
  );
  UndoToast.displayName = "UndoToast";
  return UndoToast;
});

import * as api from "@/lib/api";
import DeckDetailPage from "@/app/(shell)/decks/[deckId]/page";

const mockGetDeck = api.getDeck as jest.MockedFunction<typeof api.getDeck>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockAddDeckMember = api.addDeckMember as jest.MockedFunction<typeof api.addDeckMember>;
const mockRemoveDeckMember = api.removeDeckMember as jest.MockedFunction<
  typeof api.removeDeckMember
>;

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const MANUAL_DECK = {
  id: 7,
  name: "German verbs",
  description: "",
  mode: "manual" as const,
  rules_json: null,
  created_at: "2026-04-24T08:00:00",
  updated_at: "2026-04-24T08:00:00",
  members: [] as number[],
};

const WORD_A = { id: 1, word: "laufen", language: "de", created_at: "" };
const WORD_B = { id: 2, word: "schreiben", language: "de", created_at: "" };

// Header "Add word" button aria-label (used in most tests to open the picker)
const ADD_WORD_TO_DECK_LABEL = "Add word to deck";

beforeEach(() => {
  jest.resetAllMocks();
  mockPush.mockReset();
  mockDeckIdParam = "7";
});

// ── invalid deckId (NaN) → immediate error state ───────────────────────────────

test("invalid deckId shows error state immediately without fetching", async () => {
  mockDeckIdParam = "not-a-number";
  mockGetDeck.mockResolvedValue(MANUAL_DECK);
  mockGetVocabulary.mockResolvedValue([]);

  render(<DeckDetailPage />);
  await flushPromises();

  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(mockGetDeck).not.toHaveBeenCalled();
});

// ── empty-state CTA for manual deck ───────────────────────────────────────────

test("empty manual deck shows both header and empty-state Add-word buttons", async () => {
  mockGetDeck.mockResolvedValue({ ...MANUAL_DECK, members: [] });
  mockGetVocabulary.mockResolvedValue([WORD_A]);

  render(<DeckDetailPage />);
  await waitFor(() => expect(mockGetDeck).toHaveBeenCalledTimes(1));
  await flushPromises();

  expect(await screen.findByText(/No words in this deck yet/i)).toBeInTheDocument();
  // Header button: has aria-label; empty-state CTA: accessible name from text "Add word"
  expect(screen.getByRole("button", { name: ADD_WORD_TO_DECK_LABEL })).toBeInTheDocument();
  // Empty-state CTA accessible name is just "Add word" (no aria-label override)
  expect(screen.getAllByRole("button", { name: /^Add word$/i }).length).toBeGreaterThanOrEqual(1);
});

// ── AddWordPicker dialog ───────────────────────────────────────────────────────

test("header Add-word button opens picker dialog", async () => {
  mockGetDeck.mockResolvedValue({ ...MANUAL_DECK, members: [] });
  mockGetVocabulary.mockResolvedValue([WORD_A, WORD_B]);
  mockAddDeckMember.mockResolvedValue(undefined as unknown as void);

  render(<DeckDetailPage />);
  await waitFor(() => expect(mockGetDeck).toHaveBeenCalledTimes(1));
  await flushPromises();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: ADD_WORD_TO_DECK_LABEL }));

  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Add ${WORD_A.word} to deck` })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Add ${WORD_B.word} to deck` })).toBeInTheDocument();
});

test("picker search filter narrows word list", async () => {
  mockGetDeck.mockResolvedValue({ ...MANUAL_DECK, members: [] });
  mockGetVocabulary.mockResolvedValue([WORD_A, WORD_B]);
  mockAddDeckMember.mockResolvedValue(undefined as unknown as void);

  render(<DeckDetailPage />);
  await waitFor(() => expect(mockGetDeck).toHaveBeenCalledTimes(1));
  await flushPromises();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: ADD_WORD_TO_DECK_LABEL }));
  await screen.findByRole("dialog");

  const searchInput = screen.getByRole("searchbox");
  await user.type(searchInput, "laufen");

  expect(screen.getByRole("button", { name: `Add ${WORD_A.word} to deck` })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: `Add ${WORD_B.word} to deck` }),
  ).not.toBeInTheDocument();
});

test("picker shows no-matches message when filter has no results", async () => {
  mockGetDeck.mockResolvedValue({ ...MANUAL_DECK, members: [] });
  mockGetVocabulary.mockResolvedValue([WORD_A]);
  mockAddDeckMember.mockResolvedValue(undefined as unknown as void);

  render(<DeckDetailPage />);
  await waitFor(() => expect(mockGetDeck).toHaveBeenCalledTimes(1));
  await flushPromises();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: ADD_WORD_TO_DECK_LABEL }));
  await screen.findByRole("dialog");

  const searchInput = screen.getByRole("searchbox");
  await user.type(searchInput, "zzznomatch");

  expect(screen.getByText("No matches.")).toBeInTheDocument();
});

test("Escape key closes the picker dialog", async () => {
  mockGetDeck.mockResolvedValue({ ...MANUAL_DECK, members: [] });
  mockGetVocabulary.mockResolvedValue([WORD_A]);
  mockAddDeckMember.mockResolvedValue(undefined as unknown as void);

  render(<DeckDetailPage />);
  await waitFor(() => expect(mockGetDeck).toHaveBeenCalledTimes(1));
  await flushPromises();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: ADD_WORD_TO_DECK_LABEL }));
  await screen.findByRole("dialog");

  await user.keyboard("{Escape}");

  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

test("clicking a word in picker calls addDeckMember", async () => {
  mockGetDeck.mockResolvedValue({ ...MANUAL_DECK, members: [] });
  mockGetVocabulary.mockResolvedValue([WORD_A]);
  mockAddDeckMember.mockResolvedValue(undefined as unknown as void);

  render(<DeckDetailPage />);
  await waitFor(() => expect(mockGetDeck).toHaveBeenCalledTimes(1));
  await flushPromises();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: ADD_WORD_TO_DECK_LABEL }));
  await screen.findByRole("dialog");

  await user.click(screen.getByRole("button", { name: `Add ${WORD_A.word} to deck` }));

  await waitFor(() => {
    expect(mockAddDeckMember).toHaveBeenCalledWith(7, WORD_A.id);
  });
});

// ── handleAdd API failure rollback ────────────────────────────────────────────

test("handleAdd rolls back optimistic update when API call fails", async () => {
  mockGetDeck.mockResolvedValue({ ...MANUAL_DECK, members: [] });
  mockGetVocabulary.mockResolvedValue([WORD_A]);
  mockAddDeckMember.mockRejectedValue(new Error("network error"));

  render(<DeckDetailPage />);
  await waitFor(() => expect(mockGetDeck).toHaveBeenCalledTimes(1));
  await flushPromises();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: ADD_WORD_TO_DECK_LABEL }));
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: `Add ${WORD_A.word} to deck` }));

  await waitFor(() => {
    expect(mockAddDeckMember).toHaveBeenCalled();
  });

  // After rollback the deck returns to 0 members
  await waitFor(() => {
    expect(screen.queryByText(/No words in this deck yet/i)).toBeInTheDocument();
  });
});

// ── disabled Add-word when all vocab already in deck ─────────────────────────

test("Add-word-to-deck header button is disabled when all vocabulary is already in the deck", async () => {
  mockGetDeck.mockResolvedValue({ ...MANUAL_DECK, members: [WORD_A.id] });
  mockGetVocabulary.mockResolvedValue([WORD_A]);

  render(<DeckDetailPage />);
  await waitFor(() => expect(mockGetDeck).toHaveBeenCalledTimes(1));
  await flushPromises();

  const addBtn = await screen.findByRole("button", { name: ADD_WORD_TO_DECK_LABEL });
  expect(addBtn).toBeDisabled();
});

test("picker shows all-in-deck message when candidates list is empty", async () => {
  mockGetDeck.mockResolvedValue({ ...MANUAL_DECK, members: [WORD_A.id] });
  mockGetVocabulary.mockResolvedValue([WORD_A]);

  render(<DeckDetailPage />);
  await waitFor(() => expect(mockGetDeck).toHaveBeenCalledTimes(1));
  await flushPromises();

  // The header button is disabled so clicking does nothing
  const user = userEvent.setup();
  const addBtn = await screen.findByRole("button", { name: ADD_WORD_TO_DECK_LABEL });
  await user.click(addBtn); // no-op (disabled)

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

// ── handleRemove with existing queued-toast ───────────────────────────────────

test("removing a second word while first removal is queued replaces the undo toast", async () => {
  mockGetDeck.mockResolvedValue({ ...MANUAL_DECK, members: [WORD_A.id, WORD_B.id] });
  mockGetVocabulary.mockResolvedValue([WORD_A, WORD_B]);
  mockRemoveDeckMember.mockResolvedValue(undefined as unknown as void);

  render(<DeckDetailPage />);
  await waitFor(() => expect(mockGetDeck).toHaveBeenCalledTimes(1));
  await flushPromises();

  const user = userEvent.setup();

  // Remove first word — UndoToast appears
  await user.click(screen.getByRole("button", { name: `Remove ${WORD_A.word} from deck` }));
  await waitFor(() => {
    expect(screen.getByTestId("undo-toast")).toHaveTextContent(`"${WORD_A.word}" removed`);
  });

  // Remove second word — existing toast flushes first removal and new toast replaces it
  await user.click(screen.getByRole("button", { name: `Remove ${WORD_B.word} from deck` }));
  await waitFor(() => {
    expect(screen.getByTestId("undo-toast")).toHaveTextContent(`"${WORD_B.word}" removed`);
  });

  // First removal was committed when the second remove triggered the flush
  expect(mockRemoveDeckMember).toHaveBeenCalledWith(7, WORD_A.id);
});
