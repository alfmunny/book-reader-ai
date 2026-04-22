/**
 * NotesPage overview — branch coverage
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseSession = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

jest.mock("@/lib/api", () => ({
  getAllAnnotations: jest.fn(),
  getAllInsights: jest.fn(),
  getVocabulary: jest.fn(),
}));

import * as api from "@/lib/api";
import NotesPage from "@/app/notes/page";
import type { AnnotationWithBook, BookInsightWithBook, VocabularyWord } from "@/lib/api";

const mockGetAllAnnotations = api.getAllAnnotations as jest.MockedFunction<typeof api.getAllAnnotations>;
const mockGetAllInsights = api.getAllInsights as jest.MockedFunction<typeof api.getAllInsights>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllAnnotations.mockResolvedValue([]);
  mockGetAllInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
});

// ── Unauthenticated redirect ──────────────────────────────────────────────────

describe("NotesPage overview — unauthenticated redirect", () => {
  it("redirects to /login when unauthenticated", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    render(<NotesPage />);
    await flushPromises();
    expect(mockRouterReplace).toHaveBeenCalledWith("/login");
  });

  it("does not fetch data when unauthenticated", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    render(<NotesPage />);
    await flushPromises();
    expect(mockGetAllAnnotations).not.toHaveBeenCalled();
  });

  it("does not redirect when status is loading", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "loading" });
    render(<NotesPage />);
    await flushPromises();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});

// ── Book cards from different data sources ───────────────────────────────────

describe("NotesPage overview — book card sources", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: { backendToken: "tok" }, status: "authenticated" });
  });

  it("shows book from insights even when no annotations for that book", async () => {
    mockGetAllInsights.mockResolvedValue([
      {
        id: 1, book_id: 99, chapter_index: 0,
        question: "Q?", answer: "A.",
        created_at: "2026-01-01T00:00:00", book_title: "Insight Only Book",
      } as BookInsightWithBook,
    ]);
    render(<NotesPage />);
    await waitFor(() => expect(screen.getByText("Insight Only Book")).toBeInTheDocument());
  });

  it("shows book from vocabulary even when no annotations", async () => {
    mockGetVocabulary.mockResolvedValue([
      {
        id: 1, word: "ephemeral",
        occurrences: [{ book_id: 77, book_title: "Vocab Only Book", chapter_index: 0, sentence_text: "sentence" }],
      } as VocabularyWord,
    ]);
    render(<NotesPage />);
    await waitFor(() => expect(screen.getByText("Vocab Only Book")).toBeInTheDocument());
  });

  it("navigates to /notes/[bookId] when book card is clicked", async () => {
    mockGetAllAnnotations.mockResolvedValue([
      { id: 1, book_id: 55, chapter_index: 0, sentence_text: "s", note_text: "", color: "yellow",
        book_title: "Click Me", created_at: "2026-01-01T00:00:00" } as AnnotationWithBook,
    ]);
    render(<NotesPage />);
    await waitFor(() => screen.getByText("Click Me"));
    await userEvent.click(screen.getByText("Click Me"));
    expect(mockRouterPush).toHaveBeenCalledWith("/notes/55");
  });

  it("navigates to / when ← Library button is clicked", async () => {
    mockUseSession.mockReturnValue({ data: { backendToken: "tok" }, status: "authenticated" });
    render(<NotesPage />);
    await flushPromises();
    fireEvent.click(screen.getByRole("button", { name: /Library/i }));
    expect(mockRouterPush).toHaveBeenCalledWith("/");
  });
});

// ── Search and filter states ──────────────────────────────────────────────────

describe("NotesPage overview — search states", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: { backendToken: "tok" }, status: "authenticated" });
    mockGetAllAnnotations.mockResolvedValue([
      { id: 1, book_id: 10, chapter_index: 0, sentence_text: "s", note_text: "", color: "yellow",
        book_title: "Pride and Prejudice", created_at: "2026-01-01T00:00:00" } as AnnotationWithBook,
    ]);
  });

  it("shows 'No books match' when search has no results", async () => {
    render(<NotesPage />);
    await waitFor(() => screen.getByText("Pride and Prejudice"));
    await userEvent.type(screen.getByPlaceholderText(/search books/i), "zzz");
    expect(screen.queryByText("Pride and Prejudice")).not.toBeInTheDocument();
    expect(screen.getByText(/No books match/i)).toBeInTheDocument();
  });
});
