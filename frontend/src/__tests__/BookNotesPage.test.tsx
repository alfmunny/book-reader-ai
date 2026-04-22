/**
 * Tests for /notes/[bookId] — interactive per-book notes page.
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "tok" }, status: "authenticated" }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useParams: () => ({ bookId: "10" }),
}));

jest.mock("@/lib/api", () => ({
  getBookChapters: jest.fn(),
  getAnnotations: jest.fn(),
  getInsights: jest.fn(),
  getVocabulary: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
  deleteInsight: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
}));

import * as api from "@/lib/api";
import BookNotesPage from "@/app/notes/[bookId]/page";
import type { Annotation, BookInsight, VocabularyWord } from "@/lib/api";

const mockGetBookChapters = api.getBookChapters as jest.MockedFunction<typeof api.getBookChapters>;
const mockGetAnnotations = api.getAnnotations as jest.MockedFunction<typeof api.getAnnotations>;
const mockGetInsights = api.getInsights as jest.MockedFunction<typeof api.getInsights>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockUpdateAnnotation = api.updateAnnotation as jest.MockedFunction<typeof api.updateAnnotation>;
const mockDeleteAnnotation = api.deleteAnnotation as jest.MockedFunction<typeof api.deleteAnnotation>;
const mockDeleteInsight = api.deleteInsight as jest.MockedFunction<typeof api.deleteInsight>;
const mockExportVocabularyToObsidian = api.exportVocabularyToObsidian as jest.MockedFunction<typeof api.exportVocabularyToObsidian>;

const CHAPTERS_RESP = {
  book_id: 10,
  meta: { id: 10, title: "Moby Dick", authors: ["Herman Melville"], languages: ["en"], subjects: [], download_count: 0, cover: null },
  chapters: [{ title: "Chapter 1", text: "" }, { title: "Chapter 2", text: "" }],
};

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 1, book_id: 10, chapter_index: 0,
    sentence_text: "Call me Ishmael.", note_text: "Famous opening.", color: "yellow",
    ...overrides,
  };
}

function makeInsight(overrides: Partial<BookInsight> = {}): BookInsight {
  return {
    id: 1, book_id: 10, chapter_index: 0,
    question: "What is the white whale?", answer: "A symbol of obsession.",
    context_text: null, created_at: "2026-01-01T00:00:00",
    ...overrides,
  };
}

function makeVocabWord(overrides: Partial<VocabularyWord> = {}): VocabularyWord {
  return {
    id: 1, word: "leviathan",
    occurrences: [{ book_id: 10, book_title: "Moby Dick", chapter_index: 0, sentence_text: "The great leviathan." }],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBookChapters.mockResolvedValue(CHAPTERS_RESP as any);
  mockGetInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
  jest.spyOn(window, "confirm").mockReturnValue(true);
});

// ── Loading + empty ────────────────────────────────────────────────────────────

test("shows loading spinner initially", () => {
  mockGetAnnotations.mockResolvedValue([]);
  render(<BookNotesPage />);
  expect(document.querySelector(".animate-spin")).toBeInTheDocument();
});

test("shows empty state when no data", async () => {
  mockGetAnnotations.mockResolvedValue([]);
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText(/No notes yet/i)).toBeInTheDocument());
});

// ── Content rendering ──────────────────────────────────────────────────────────

test("renders book title and annotation quote", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText("Moby Dick")).toBeInTheDocument());
  expect(screen.getByText(/Call me Ishmael/)).toBeInTheDocument();
});

test("renders annotation note text", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation({ note_text: "My note here." })]);
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText("My note here.")).toBeInTheDocument());
});

test("renders insight Q/A", async () => {
  mockGetAnnotations.mockResolvedValue([]);
  mockGetInsights.mockResolvedValue([makeInsight()]);
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText(/What is the white whale/)).toBeInTheDocument());
  expect(screen.getByText(/A symbol of obsession/)).toBeInTheDocument();
});

test("renders insight context blockquote when present", async () => {
  mockGetAnnotations.mockResolvedValue([]);
  mockGetInsights.mockResolvedValue([makeInsight({ context_text: "The pale whale loomed." })]);
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText(/The pale whale loomed/)).toBeInTheDocument());
});

test("renders vocab word as link to /vocabulary", async () => {
  mockGetAnnotations.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([makeVocabWord()]);
  render(<BookNotesPage />);
  await waitFor(() => {
    const link = screen.getByRole("link", { name: "leviathan" });
    expect(link).toHaveAttribute("href", "/vocabulary?word=leviathan");
  });
});

test("annotation has reader link to correct chapter", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation({ chapter_index: 1 })]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));
  const readerLink = screen.getByRole("link", { name: /Chapter 2/i });
  expect(readerLink).toHaveAttribute("href", "/reader/10?chapter=1");
});

// ── Collapse ───────────────────────────────────────────────────────────────────

test("clicking section heading collapses it", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  // Click "Annotations" heading to collapse
  fireEvent.click(screen.getByRole("button", { name: /Annotations/i }));
  expect(screen.queryByText(/Call me Ishmael/)).not.toBeInTheDocument();
});

test("collapse all button hides all content", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  mockGetInsights.mockResolvedValue([makeInsight()]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByRole("button", { name: /Collapse all/i }));
  expect(screen.queryByText(/Call me Ishmael/)).not.toBeInTheDocument();
  expect(screen.queryByText(/What is the white whale/)).not.toBeInTheDocument();
});

test("expand all button restores content after collapse all", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByRole("button", { name: /Collapse all/i }));
  fireEvent.click(screen.getByRole("button", { name: /Expand all/i }));
  expect(screen.getByText(/Call me Ishmael/)).toBeInTheDocument();
});

// ── Edit annotation ────────────────────────────────────────────────────────────

test("clicking edit button shows inline textarea", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByTitle("Edit note"));
  expect(screen.getByRole("textbox")).toBeInTheDocument();
});

test("saving edit updates annotation text", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  mockUpdateAnnotation.mockResolvedValue(
    makeAnnotation({ note_text: "Updated note." })
  );
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByTitle("Edit note"));
  const textarea = screen.getByRole("textbox");
  fireEvent.change(textarea, { target: { value: "Updated note." } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(mockUpdateAnnotation).toHaveBeenCalledWith(1, { note_text: "Updated note." }));
});

test("cancelling edit hides textarea without saving", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByTitle("Edit note"));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(mockUpdateAnnotation).not.toHaveBeenCalled();
});

// ── Delete annotation ──────────────────────────────────────────────────────────

test("deleting annotation removes it from the list", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  mockDeleteAnnotation.mockResolvedValue({ ok: true });
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByTitle("Delete annotation"));
  await waitFor(() => expect(mockDeleteAnnotation).toHaveBeenCalledWith(1));
  expect(screen.queryByText(/Call me Ishmael/)).not.toBeInTheDocument();
});

// ── Delete insight ─────────────────────────────────────────────────────────────

test("deleting insight removes it from the list", async () => {
  mockGetAnnotations.mockResolvedValue([]);
  mockGetInsights.mockResolvedValue([makeInsight()]);
  mockDeleteInsight.mockResolvedValue({ ok: true });
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/What is the white whale/));

  fireEvent.click(screen.getByTitle("Delete insight"));
  await waitFor(() => expect(mockDeleteInsight).toHaveBeenCalledWith(1));
  expect(screen.queryByText(/What is the white whale/)).not.toBeInTheDocument();
});

// ── Chapter view ───────────────────────────────────────────────────────────────

test("chapter view renders content under chapter heading", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByRole("button", { name: "By chapter" }));
  expect(screen.getByText(/Call me Ishmael/)).toBeInTheDocument();
  // Chapter heading visible
  expect(screen.getByRole("button", { name: /Chapter 1/i })).toBeInTheDocument();
});

// ── Navigation ─────────────────────────────────────────────────────────────────

test("← Notes button navigates to /notes", async () => {
  mockGetAnnotations.mockResolvedValue([]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/No notes yet/i));
  fireEvent.click(screen.getByRole("button", { name: /← Notes/i }));
  expect(mockPush).toHaveBeenCalledWith("/notes");
});
