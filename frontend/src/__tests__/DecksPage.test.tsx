/**
 * Tests for /decks index page (slice 3a of #741).
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
const mockDeleteDeck = api.deleteDeck as jest.MockedFunction<typeof api.deleteDeck>;

const SAMPLE_DECKS = [
  {
    id: 1,
    name: "German verbs",
    description: "Regular + irregular verbs",
    mode: "manual" as const,
    rules_json: null,
    created_at: "2026-04-24T08:00:00",
    updated_at: "2026-04-24T08:00:00",
    member_count: 12,
    due_today: 3,
  },
  {
    id: 2,
    name: "A1 Spanish",
    description: "",
    mode: "smart" as const,
    rules_json: '{"language":"es"}',
    created_at: "2026-04-24T08:00:00",
    updated_at: "2026-04-24T08:00:00",
    member_count: 40,
    due_today: 0,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
});

test("renders an empty state with a New-deck CTA when the user has no decks", async () => {
  mockListDecks.mockResolvedValue([]);
  render(<DecksPage />);
  expect(await screen.findByTestId("decks-empty-state")).toBeInTheDocument();
  const cta = screen.getByTestId("decks-empty-new-btn");
  expect(cta).toBeInTheDocument();

  const user = userEvent.setup();
  await user.click(cta);
  expect(mockPush).toHaveBeenCalledWith("/decks/new");
});

test("renders one DeckCard per deck returned from the API", async () => {
  mockListDecks.mockResolvedValue(SAMPLE_DECKS);
  render(<DecksPage />);
  expect(await screen.findByText("German verbs")).toBeInTheDocument();
  expect(screen.getByText("A1 Spanish")).toBeInTheDocument();
  expect(screen.getByTestId("deck-member-count-1")).toHaveTextContent("12");
  expect(screen.getByTestId("deck-member-count-2")).toHaveTextContent("40");
});

test("'New deck' header button navigates to /decks/new", async () => {
  mockListDecks.mockResolvedValue(SAMPLE_DECKS);
  render(<DecksPage />);
  await screen.findByText("German verbs");
  const user = userEvent.setup();
  await user.click(screen.getByTestId("decks-new-btn"));
  expect(mockPush).toHaveBeenCalledWith("/decks/new");
});

test("deleting a deck removes it from the list optimistically and shows UndoToast", async () => {
  mockListDecks.mockResolvedValue(SAMPLE_DECKS);
  mockDeleteDeck.mockResolvedValue(undefined);
  render(<DecksPage />);
  await screen.findByText("German verbs");

  const user = userEvent.setup();
  await user.click(screen.getByTestId("deck-delete-1"));

  // Optimistic: removed from list immediately
  await waitFor(() => {
    expect(screen.queryByText("German verbs")).not.toBeInTheDocument();
  });
  expect(screen.getByText("A1 Spanish")).toBeInTheDocument();

  // UndoToast is shown
  expect(screen.getByText(/"German verbs" deleted/)).toBeInTheDocument();
});

test("falls back to the empty state when the API errors", async () => {
  mockListDecks.mockRejectedValue(new Error("boom"));
  render(<DecksPage />);
  expect(await screen.findByTestId("decks-empty-state")).toBeInTheDocument();
});
