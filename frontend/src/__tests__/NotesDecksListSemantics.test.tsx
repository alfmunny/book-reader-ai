/**
 * Regression test for #2043: notes and decks index pages must use list
 * semantics so screen readers can announce item counts and navigation position.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

// ─── Notes page mocks ────────────────────────────────────────────────────────

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token" }, status: "authenticated" }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

const mockGetAllAnnotations = jest.fn();
const mockGetAllInsights = jest.fn();
const mockGetVocabulary = jest.fn();
const mockListDecks = jest.fn();

jest.mock("@/lib/api", () => ({
  getAllAnnotations: (...a: unknown[]) => mockGetAllAnnotations(...a),
  getAllInsights: (...a: unknown[]) => mockGetAllInsights(...a),
  getVocabulary: (...a: unknown[]) => mockGetVocabulary(...a),
  listDecks: (...a: unknown[]) => mockListDecks(...a),
  deleteDeck: jest.fn(),
}));

jest.mock("@/components/UndoToast", () => {
  const UndoToast = () => null;
  UndoToast.displayName = "UndoToast";
  return UndoToast;
});

jest.mock("@/components/DeckCard", () => {
  const DeckCard = ({ deck }: { deck: { id: number; name: string } }) => (
    <div data-testid={`deck-${deck.id}`}>{deck.name}</div>
  );
  DeckCard.displayName = "DeckCard";
  return DeckCard;
});

import NotesPage from "@/app/notes/page";
import DecksPage from "@/app/decks/page";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

function makeAnnotation(bookId: number, bookTitle: string) {
  return {
    id: bookId,
    book_id: bookId,
    chapter_index: 0,
    sentence_text: "Some text",
    note_text: "A note",
    color: "yellow",
    created_at: "2026-01-01T00:00:00",
    book_title: bookTitle,
    chapter_title: "Chapter 1",
  };
}

function makeDeck(id: number) {
  return {
    id,
    name: `Deck ${id}`,
    description: "",
    mode: "manual" as const,
    rules_json: null,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
    member_count: 5,
    due_today: 1,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
});

test("notes page book list renders as a list element", async () => {
  mockGetAllAnnotations.mockResolvedValue([
    makeAnnotation(1, "Book One"),
    makeAnnotation(2, "Book Two"),
    makeAnnotation(3, "Book Three"),
  ]);

  render(<NotesPage />);
  await flushPromises();

  const list = await screen.findByRole("list", { name: /books with notes/i });
  expect(list).toBeInTheDocument();
  const items = screen.getAllByRole("listitem");
  expect(items.length).toBeGreaterThanOrEqual(3);
});

test("decks page deck list renders as a list element", async () => {
  mockListDecks.mockResolvedValue([makeDeck(1), makeDeck(2), makeDeck(3)]);

  render(<DecksPage />);
  await flushPromises();

  const list = await screen.findByRole("list", { name: /your decks/i });
  expect(list).toBeInTheDocument();
  const items = screen.getAllByRole("listitem");
  expect(items.length).toBeGreaterThanOrEqual(3);
});
