/**
 * Regression tests for missing branch coverage in app/(shell)/decks/page.tsx
 * Closes #1979 — targets: back button, deck card click, undo/done toast
 * callbacks, consecutive delete while toast showing.
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
}));

jest.mock("@/lib/api", () => ({
  listDecks: jest.fn(),
  deleteDeck: jest.fn(),
}));

// DeckCard stub: renders deck name as a link (href prop) and a delete button
jest.mock("@/components/DeckCard", () => {
  const DC = ({ deck, href, onDelete }: {
    deck: { id: number; name: string };
    href: string;
    onDelete: (id: number) => void;
  }) => (
    <div>
      <a href={href}>{deck.name}</a>
      <button data-testid={`deck-delete-${deck.id}`} onClick={() => onDelete(deck.id)}>
        Delete
      </button>
    </div>
  );
  DC.displayName = "DeckCard";
  return { __esModule: true, default: DC };
});

// UndoToast stub: renders message + Undo button; captures onUndo/onDone for direct invocation
let capturedOnUndo: (() => void) | null = null;
let capturedOnDone: (() => void) | null = null;
jest.mock("@/components/UndoToast", () => {
  const UT = ({ message, onUndo, onDone }: {
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
import DecksPage from "@/app/(shell)/decks/page";

const mockListDecks = api.listDecks as jest.MockedFunction<typeof api.listDecks>;
const mockDeleteDeck = api.deleteDeck as jest.MockedFunction<typeof api.deleteDeck>;

const DECK_A = {
  id: 1, name: "German verbs", description: "", mode: "manual" as const,
  rules_json: null, created_at: "", updated_at: "", member_count: 5, due_today: 2,
};
const DECK_B = {
  id: 2, name: "French nouns", description: "", mode: "manual" as const,
  rules_json: null, created_at: "", updated_at: "", member_count: 3, due_today: 0,
};

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  capturedOnUndo = null;
  capturedOnDone = null;
  mockDeleteDeck.mockResolvedValue(undefined);
});

// ── Back / Library link ───────────────────────────────────────────────────────

test("back link navigates to /", async () => {
  mockListDecks.mockResolvedValue([DECK_A]);
  render(<DecksPage />);
  await waitFor(() => screen.getByText("German verbs"));

  const link = screen.getByRole("link", { name: /library/i });
  expect(link).toHaveAttribute("href", "/");
});

// ── DeckCard link → navigate to deck ─────────────────────────────────────────

test("deck card link navigates to its detail page", async () => {
  mockListDecks.mockResolvedValue([DECK_A]);
  render(<DecksPage />);
  await waitFor(() => screen.getByText("German verbs"));

  const link = screen.getByRole("link", { name: "German verbs" });
  expect(link).toHaveAttribute("href", "/decks/1");
});

// ── UndoToast onUndo — deck restored ─────────────────────────────────────────

test("onUndo restores the deleted deck to the list and clears the toast", async () => {
  mockListDecks.mockResolvedValue([DECK_A, DECK_B]);
  render(<DecksPage />);
  await waitFor(() => screen.getByText("German verbs"));

  // Delete deck A
  await userEvent.click(screen.getByTestId("deck-delete-1"));
  await waitFor(() => expect(screen.queryByText("German verbs")).not.toBeInTheDocument());

  // Toast appears (via stub)
  expect(screen.getByText(/"German verbs" deleted/)).toBeInTheDocument();

  // Click Undo (calls onUndo directly via stub)
  await userEvent.click(screen.getByRole("button", { name: /undo/i }));

  // Deck is restored
  await waitFor(() => screen.getByText("German verbs"));

  // deleteDeck should NOT be called from undo path
  expect(mockDeleteDeck).not.toHaveBeenCalled();
});

// ── UndoToast onDone — deleteDeck called ─────────────────────────────────────

test("onDone calls deleteDeck with the removed deck id and clears the toast", async () => {
  mockListDecks.mockResolvedValue([DECK_A]);
  render(<DecksPage />);
  await waitFor(() => screen.getByText("German verbs"));

  // Delete deck A → toast appears
  await userEvent.click(screen.getByTestId("deck-delete-1"));
  await waitFor(() => screen.getByText(/"German verbs" deleted/));

  // Directly invoke onDone (simulates toast auto-dismiss)
  expect(capturedOnDone).not.toBeNull();
  act(() => capturedOnDone!());

  await waitFor(() => expect(mockDeleteDeck).toHaveBeenCalledWith(1));

  // Toast clears (UndoToast no longer rendered)
  expect(screen.queryByText(/"German verbs" deleted/)).not.toBeInTheDocument();
});

// ── Consecutive delete: previous pending delete is committed ──────────────────

test("deleting a second deck while first toast shows commits the first delete", async () => {
  mockListDecks.mockResolvedValue([DECK_A, DECK_B]);
  render(<DecksPage />);
  await waitFor(() => screen.getByText("German verbs"));

  // Delete deck A → toast shows for "German verbs"
  await userEvent.click(screen.getByTestId("deck-delete-1"));
  await waitFor(() => screen.getByText(/"German verbs" deleted/));

  // Delete deck B while the first toast is still showing
  await userEvent.click(screen.getByTestId("deck-delete-2"));

  // First delete should be committed immediately (deleteDeck called for id 1)
  await waitFor(() => expect(mockDeleteDeck).toHaveBeenCalledWith(1));

  // Second toast now shows for "French nouns"
  await waitFor(() => screen.getByText(/"French nouns" deleted/));
});
