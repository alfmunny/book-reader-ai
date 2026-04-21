/**
 * Tests for the /notes cross-book annotation review page.
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token" }, status: "authenticated" }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getAllAnnotations: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

import * as api from "@/lib/api";
import NotesPage from "@/app/notes/page";
import type { AnnotationWithBook } from "@/lib/api";

const mockGetAll = api.getAllAnnotations as jest.MockedFunction<typeof api.getAllAnnotations>;
const mockUpdate = api.updateAnnotation as jest.MockedFunction<typeof api.updateAnnotation>;
const mockDelete = api.deleteAnnotation as jest.MockedFunction<typeof api.deleteAnnotation>;

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

function makeAnnotation(overrides: Partial<AnnotationWithBook> = {}): AnnotationWithBook {
  return {
    id: 1,
    book_id: 10,
    chapter_index: 0,
    sentence_text: "It is a truth universally acknowledged.",
    note_text: "Famous opening",
    color: "yellow",
    book_title: "Pride and Prejudice",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("shows loading spinner initially then renders annotations", async () => {
  mockGetAll.mockResolvedValue([makeAnnotation()]);

  render(<NotesPage />);
  // Spinner visible while loading
  expect(document.querySelector(".animate-spin")).toBeInTheDocument();

  await waitFor(() => expect(screen.getByText("Pride and Prejudice")).toBeInTheDocument());
  expect(screen.getByText(/truth universally acknowledged/)).toBeInTheDocument();
  expect(screen.getByText("Famous opening")).toBeInTheDocument();
});

test("shows empty state when no annotations", async () => {
  mockGetAll.mockResolvedValue([]);
  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText(/No notes yet/i)).toBeInTheDocument());
});

test("groups annotations by book", async () => {
  mockGetAll.mockResolvedValue([
    makeAnnotation({ id: 1, book_id: 10, book_title: "Pride and Prejudice", sentence_text: "Truth." }),
    makeAnnotation({ id: 2, book_id: 20, book_title: "Moby Dick", sentence_text: "Whale." }),
  ]);

  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("Pride and Prejudice")).toBeInTheDocument());
  expect(screen.getByText("Moby Dick")).toBeInTheDocument();
  expect(screen.getByText(/Truth\./)).toBeInTheDocument();
  expect(screen.getByText(/Whale\./)).toBeInTheDocument();
});

test("search filter hides non-matching annotations", async () => {
  mockGetAll.mockResolvedValue([
    makeAnnotation({ id: 1, book_title: "Pride and Prejudice", sentence_text: "Truth universally." }),
    makeAnnotation({ id: 2, book_title: "Moby Dick", sentence_text: "White whale." }),
  ]);

  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText(/Truth universally\./)).toBeInTheDocument());

  await userEvent.type(screen.getByPlaceholderText(/search notes/i), "whale");
  expect(screen.queryByText(/Truth universally\./)).not.toBeInTheDocument();
  expect(screen.getByText(/White whale\./)).toBeInTheDocument();
});

test("color filter shows only matching annotations", async () => {
  mockGetAll.mockResolvedValue([
    makeAnnotation({ id: 1, color: "yellow", sentence_text: "Yellow sentence." }),
    makeAnnotation({ id: 2, color: "blue", sentence_text: "Blue sentence." }),
  ]);

  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText(/Yellow sentence\./)).toBeInTheDocument());

  // The filter pills are the first occurrence of each color button (the color dot buttons also have title=color)
  const blueFilterPill = screen.getAllByRole("button", { name: /^blue$/i })[0];
  fireEvent.click(blueFilterPill);
  expect(screen.queryByText(/Yellow sentence\./)).not.toBeInTheDocument();
  expect(screen.getByText(/Blue sentence\./)).toBeInTheDocument();
});

test("clicking note text opens edit textarea with existing note", async () => {
  mockGetAll.mockResolvedValue([makeAnnotation({ note_text: "My note here" })]);
  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("My note here")).toBeInTheDocument());

  fireEvent.click(screen.getByText("My note here"));
  const textarea = document.querySelector("textarea");
  expect(textarea).toBeInTheDocument();
  expect(textarea!.value).toBe("My note here");
});

test("saving edited note calls updateAnnotation and closes edit mode", async () => {
  const ann = makeAnnotation({ note_text: "Old note" });
  mockGetAll.mockResolvedValue([ann]);
  mockUpdate.mockResolvedValue({ ...ann, note_text: "New note" });

  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("Old note")).toBeInTheDocument());

  fireEvent.click(screen.getByText("Old note"));
  const textarea = document.querySelector("textarea")!;
  fireEvent.change(textarea, { target: { value: "New note" } });
  fireEvent.click(screen.getByRole("button", { name: /save/i }));

  // updateAnnotation must be called regardless of state flush timing
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  expect(mockUpdate).toHaveBeenCalledWith(ann.id, { note_text: "New note", color: ann.color });
  // Edit mode closes after save
  await waitFor(() => expect(document.querySelector("textarea")).not.toBeInTheDocument());
});

test("deleting an annotation removes it from the list", async () => {
  const ann = makeAnnotation({ sentence_text: "To be deleted." });
  mockGetAll.mockResolvedValue([ann]);
  mockDelete.mockResolvedValue({ ok: true });

  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText(/To be deleted\./)).toBeInTheDocument());

  jest.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(screen.getByTitle("Delete annotation"));

  // Wait for delete call, then flush the promise chain so setAnnotations runs
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(ann.id));
  await flushPromises();

  await waitFor(() => expect(screen.queryByText(/To be deleted\./)).not.toBeInTheDocument());
});

test("header shows total annotation count", async () => {
  mockGetAll.mockResolvedValue([
    makeAnnotation({ id: 1 }),
    makeAnnotation({ id: 2 }),
  ]);
  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText(/2 annotations/i)).toBeInTheDocument());
});
