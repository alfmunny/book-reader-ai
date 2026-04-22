/**
 * NotesPage overview — coverage2: uncovered branches
 *   Line 57: title ?? `Book #${bookId}` fallback when title is null
 *   Line 75: i.created_at falsy branch
 *   Line 167: insCount === 1 → "insight" (singular)
 *   Line 173: vocCount === 1 → "word" (singular)
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: jest.fn().mockReturnValue({ data: { backendToken: "tok" }, status: "authenticated" }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getAllAnnotations: jest.fn(),
  getAllInsights: jest.fn(),
  getVocabulary: jest.fn(),
}));

import * as api from "@/lib/api";
import NotesPage from "@/app/notes/page";

const mockGetAllAnnotations = api.getAllAnnotations as jest.MockedFunction<typeof api.getAllAnnotations>;
const mockGetAllInsights = api.getAllInsights as jest.MockedFunction<typeof api.getAllInsights>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllAnnotations.mockResolvedValue([]);
  mockGetAllInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
});

// ── Line 57: book_title null → "Book #N" fallback ─────────────────────────────

test("shows 'Book #N' when book_title is null (line 57)", async () => {
  mockGetAllAnnotations.mockResolvedValue([
    { id: 1, book_id: 42, chapter_index: 0, sentence_text: "Hi", note_text: "",
      color: "yellow", book_title: null as unknown as string, created_at: "2026-01-01T00:00:00" },
  ]);

  render(<NotesPage />);
  await act(async () => await flushPromises());

  expect(screen.getByText("Book #42")).toBeInTheDocument();
});

// ── Line 75: i.created_at falsy branch ────────────────────────────────────────

test("handles insight with null created_at without updating lastActivity (line 75)", async () => {
  mockGetAllInsights.mockResolvedValue([
    { id: 1, book_id: 7, chapter_index: 0, question: "Q?", answer: "A.",
      created_at: null as unknown as string, book_title: "Some Book" },
  ]);

  render(<NotesPage />);
  await act(async () => await flushPromises());

  // Component renders without crashing
  expect(screen.getByText("Some Book")).toBeInTheDocument();
});

// ── Line 167: insCount > 1 → plural "insights" (the "s" branch) ──────────────

test("shows insight count pill when insCount is 2", async () => {
  mockGetAllInsights.mockResolvedValue([
    { id: 1, book_id: 5, chapter_index: 0, question: "Q1?", answer: "A1.",
      created_at: "2026-01-01T00:00:00", book_title: "Multi-Insight Book" },
    { id: 2, book_id: 5, chapter_index: 1, question: "Q2?", answer: "A2.",
      created_at: "2026-01-02T00:00:00", book_title: "Multi-Insight Book" },
  ]);

  const { container } = render(<NotesPage />);
  await act(async () => await flushPromises());

  // Header sky pill shows "2" for insights
  const header = container.querySelector("header");
  const skyPills = header?.querySelectorAll(".bg-sky-50");
  const pill = Array.from(skyPills || []).find((el) => el.textContent?.trim() === "2");
  expect(pill).toBeTruthy();
});

// ── Line 173: vocCount > 1 → plural "words" (the "s" branch) ─────────────────

test("shows vocab count pill when vocCount is 2", async () => {
  mockGetVocabulary.mockResolvedValue([
    { id: 1, word: "run", lemma: "run", language: "en",
      occurrences: [{ book_id: 3, book_title: "Vocab Book", chapter_index: 0, sentence_text: "He can run." }] },
    { id: 2, word: "walk", lemma: "walk", language: "en",
      occurrences: [{ book_id: 3, book_title: "Vocab Book", chapter_index: 1, sentence_text: "She can walk." }] },
  ]);

  const { container } = render(<NotesPage />);
  await act(async () => await flushPromises());

  // Header emerald pill shows "2" for vocab words
  const header = container.querySelector("header");
  const emeraldPills = header?.querySelectorAll(".bg-emerald-50");
  const pill = Array.from(emeraldPills || []).find((el) => el.textContent?.trim() === "2");
  expect(pill).toBeTruthy();
});

// ── Line 70: annotation created_at null ───────────────────────────────────────

test("handles annotation with null created_at gracefully (line 70)", async () => {
  mockGetAllAnnotations.mockResolvedValue([
    { id: 1, book_id: 8, chapter_index: 0, sentence_text: "Hello.", note_text: "",
      color: "yellow", book_title: "Book A", created_at: null as unknown as string },
  ]);

  render(<NotesPage />);
  await act(async () => await flushPromises());

  expect(screen.getByText("Book A")).toBeInTheDocument();
});
