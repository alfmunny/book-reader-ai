/**
 * Tests for the /notes overview page (book cards).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token" }, status: "authenticated" }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
});

function makeAnnotation(overrides: Partial<AnnotationWithBook> = {}): AnnotationWithBook {
  return {
    id: 1, book_id: 10, chapter_index: 0,
    sentence_text: "A sentence.", note_text: "", color: "yellow",
    book_title: "Pride and Prejudice", created_at: "2026-01-01T00:00:00",
    ...overrides,
  };
}

test("shows loading spinner initially", () => {
  mockGetAllAnnotations.mockResolvedValue([]);
  render(<NotesPage />);
  expect(document.querySelector(".animate-spin")).toBeInTheDocument();
});

test("shows empty state when no data", async () => {
  mockGetAllAnnotations.mockResolvedValue([]);
  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText(/No notes yet/i)).toBeInTheDocument());
});

test("shows a book card for each book with annotations", async () => {
  mockGetAllAnnotations.mockResolvedValue([
    makeAnnotation({ book_id: 10, book_title: "Pride and Prejudice" }),
    makeAnnotation({ id: 2, book_id: 20, book_title: "Moby Dick" }),
  ]);
  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("Pride and Prejudice")).toBeInTheDocument());
  expect(screen.getByText("Moby Dick")).toBeInTheDocument();
});

test("shows annotation count on book card", async () => {
  mockGetAllAnnotations.mockResolvedValue([
    makeAnnotation({ id: 1, book_id: 10, book_title: "Pride and Prejudice" }),
    makeAnnotation({ id: 2, book_id: 10, book_title: "Pride and Prejudice" }),
  ]);
  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText(/2 annotations/i)).toBeInTheDocument());
});

test("shows insight count on book card when insights exist", async () => {
  mockGetAllAnnotations.mockResolvedValue([]);
  mockGetAllInsights.mockResolvedValue([
    {
      id: 1, book_id: 10, chapter_index: 0,
      question: "Q?", answer: "A.", created_at: "2026-01-01T00:00:00",
      book_title: "Pride and Prejudice",
    } as BookInsightWithBook,
  ]);
  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("Pride and Prejudice")).toBeInTheDocument());
  // "1 insight" in the book card (singular); header says "1 insights"
  expect(screen.getAllByText(/1 insight/i).length).toBeGreaterThan(0);
});

test("clicking a book card navigates to /notes/[bookId]", async () => {
  mockGetAllAnnotations.mockResolvedValue([makeAnnotation({ book_id: 42, book_title: "Test Book" })]);
  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("Test Book")).toBeInTheDocument());
  await userEvent.click(screen.getByText("Test Book"));
  expect(mockPush).toHaveBeenCalledWith("/notes/42");
});

test("search filters book cards by title", async () => {
  mockGetAllAnnotations.mockResolvedValue([
    makeAnnotation({ book_id: 10, book_title: "Pride and Prejudice" }),
    makeAnnotation({ id: 2, book_id: 20, book_title: "Moby Dick" }),
  ]);
  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("Pride and Prejudice")).toBeInTheDocument());

  await userEvent.type(screen.getByPlaceholderText(/search books/i), "moby");
  expect(screen.queryByText("Pride and Prejudice")).not.toBeInTheDocument();
  expect(screen.getByText("Moby Dick")).toBeInTheDocument();
});

test("header shows summary counts", async () => {
  mockGetAllAnnotations.mockResolvedValue([
    makeAnnotation({ id: 1 }), makeAnnotation({ id: 2 }),
  ]);
  render(<NotesPage />);
  // The header stat shows e.g. "2 ann · 0 insights · 0 words"
  await waitFor(() => expect(screen.getAllByText(/2 ann/).length).toBeGreaterThan(0));
});
