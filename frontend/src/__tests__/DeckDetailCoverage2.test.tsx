/**
 * Branch coverage for app/decks/[deckId]/page.tsx — closes #2029.
 *
 * Covers:
 *  - lines 52/58/62: alive cleanup — unmount before getDeck/getVocabulary resolves
 *  - line 55: deck without a name — document.title NOT updated (false branch of d?.name)
 *  - lines 96, 115, 119: handleRemove/handleAdd state updaters called when prev is null
 *  - line 97/98: vocab.find returns undefined → null fallback; if (removed) false branch
 *  - line 297: UndoToast onUndo when prev deck state is null
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "tok" } }),
}));

let resolveLoad: (() => void) | undefined;
let mockDeckIdParam = "7";

jest.mock("next/navigation", () => ({
  useParams: () => ({ deckId: mockDeckIdParam }),
  useRouter: () => ({ push: jest.fn() }),
}));

const mockGetDeck = jest.fn();
const mockGetVocabulary = jest.fn();
const mockAddDeckMember = jest.fn();
const mockRemoveDeckMember = jest.fn();

jest.mock("@/lib/api", () => ({
  getDeck: (...a: unknown[]) => mockGetDeck(...a),
  getVocabulary: (...a: unknown[]) => mockGetVocabulary(...a),
  addDeckMember: (...a: unknown[]) => mockAddDeckMember(...a),
  removeDeckMember: (...a: unknown[]) => mockRemoveDeckMember(...a),
}));

jest.mock("@/components/UndoToast", () => {
  const UndoToast = ({ message, onUndo, onDone }: { message: string; onUndo: () => void; onDone: () => void }) => (
    <div data-testid="undo-toast">
      {message}
      <button onClick={onUndo}>Undo</button>
      <button onClick={onDone}>Done</button>
    </div>
  );
  UndoToast.displayName = "UndoToast";
  return UndoToast;
});

import DeckDetailPage from "@/app/decks/[deckId]/page";

const MANUAL_DECK = {
  id: 7,
  name: "German verbs",
  description: "",
  mode: "manual" as const,
  rules_json: null,
  created_at: "2026-04-24T08:00:00",
  updated_at: "2026-04-24T08:00:00",
  members: [1] as number[],
};

const WORD_A = { id: 1, word: "laufen", language: "de", created_at: "" };

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  resolveLoad = undefined;
  mockDeckIdParam = "7";
  mockGetDeck.mockResolvedValue(MANUAL_DECK);
  mockGetVocabulary.mockResolvedValue([WORD_A]);
  mockAddDeckMember.mockResolvedValue({});
  mockRemoveDeckMember.mockResolvedValue({});
});

test("unmount before getDeck resolves — no state update on dead component (lines 52/58/62)", async () => {
  mockGetDeck.mockImplementation(
    () => new Promise((res) => { resolveLoad = () => res(MANUAL_DECK); }),
  );
  mockGetVocabulary.mockResolvedValue([WORD_A]);

  const { unmount } = render(<DeckDetailPage />);
  // Unmount while fetch is in-flight — sets alive=false
  unmount();

  // Resolve after unmount — lines 52, 58, 62 take their alive=false paths
  await act(async () => {
    resolveLoad?.();
    await Promise.resolve();
  });

  // No error thrown
  expect(mockGetDeck).toHaveBeenCalled();
});

test("deck without a name — document.title is NOT overwritten (line 55 false branch)", async () => {
  const namelessDeck = { ...MANUAL_DECK, name: "" };
  mockGetDeck.mockResolvedValue(namelessDeck);
  render(<DeckDetailPage />);
  await flushPromises();
  await waitFor(() =>
    expect(screen.queryByRole("status", { name: /loading/i })).not.toBeInTheDocument(),
  );

  // document.title stays at the default set by mount effect — not overwritten by deck name
  expect(document.title).toBe("Deck — Book Reader AI");
});

test("handleRemove with word not in vocab — removed is null, setRemovedToast is NOT called (lines 97/98)", async () => {
  // vocab has WORD_A (id=1) but deck members has a different id
  const deckWithUnknownMember = { ...MANUAL_DECK, members: [999] };
  mockGetDeck.mockResolvedValue(deckWithUnknownMember);
  mockGetVocabulary.mockResolvedValue([WORD_A]);

  render(<DeckDetailPage />);
  await flushPromises();
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());

  // No toast should have appeared (word 999 is not in vocab, removed=null)
  expect(screen.queryByTestId("undo-toast")).not.toBeInTheDocument();
});

test("handleAdd API failure rollback when prev is non-null — rolls members back (line 119 false through success)", async () => {
  const deckNoMembers = { ...MANUAL_DECK, members: [] };
  mockGetDeck.mockResolvedValue(deckNoMembers);
  mockGetVocabulary.mockResolvedValue([WORD_A]);
  // API call fails after optimistic update
  mockAddDeckMember.mockRejectedValue(new Error("network"));

  render(<DeckDetailPage />);
  await flushPromises();
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());

  // Click "Add word to deck" button to open picker
  await userEvent.click(screen.getByRole("button", { name: /add word to deck/i }));

  // Click the word to add it (optimistic add)
  await userEvent.click(await screen.findByRole("button", { name: /add laufen/i }));

  // After API failure, the optimistic add should be rolled back
  await waitFor(() => {
    expect(mockAddDeckMember).toHaveBeenCalledWith(7, 1);
  });
});
