/**
 * Regression test for #1947: deck-detail error state must show AlertCircleIcon
 * and a Retry button — not just "Back to decks".
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "tok" } }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useParams: () => ({ deckId: "7" }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/api", () => ({
  getDeck: jest.fn(),
  getVocabulary: jest.fn(),
  addDeckMember: jest.fn(),
  removeDeckMember: jest.fn(),
}));

jest.mock("@/components/UndoToast", () => {
  const UndoToast = () => null;
  UndoToast.displayName = "UndoToast";
  return UndoToast;
});

import * as api from "@/lib/api";
import DeckDetailPage from "@/app/decks/[deckId]/page";

const mockGetDeck = api.getDeck as jest.MockedFunction<typeof api.getDeck>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;

const DECK = {
  id: 7,
  name: "German verbs",
  description: "",
  mode: "manual" as const,
  rules_json: null,
  created_at: "2026-04-24T08:00:00",
  updated_at: "2026-04-24T08:00:00",
  members: [],
};

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.resetAllMocks();
});

test("error state shows alert with Retry and Back-to-decks buttons", async () => {
  mockGetDeck.mockRejectedValue(new Error("network error"));
  mockGetVocabulary.mockResolvedValue([]);
  render(<DeckDetailPage />);
  await flushPromises();

  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /back to decks/i })).toBeInTheDocument();
});

test("Retry button re-fetches and shows deck on success", async () => {
  mockGetDeck
    .mockRejectedValueOnce(new Error("network error"))
    .mockResolvedValueOnce(DECK);
  mockGetVocabulary.mockResolvedValue([]);

  render(<DeckDetailPage />);
  await flushPromises();

  const retryBtn = await screen.findByRole("button", { name: /retry/i });
  const user = userEvent.setup();
  await user.click(retryBtn);

  await waitFor(() => {
    expect(screen.getByText("German verbs")).toBeInTheDocument();
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("Back-to-decks navigates away", async () => {
  mockGetDeck.mockRejectedValue(new Error("fail"));
  mockGetVocabulary.mockResolvedValue([]);
  render(<DeckDetailPage />);
  await flushPromises();

  await screen.findByRole("alert");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /back to decks/i }));

  expect(mockPush).toHaveBeenCalledWith("/decks");
});
