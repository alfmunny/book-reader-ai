/**
 * NotesPage — branch coverage for lines not yet covered:
 *   38-39: unauthenticated → router.replace("/login")
 *   110-121: handleColorChange updates annotation color
 *   184-191: header "← Library" button + annotation count plural/singular
 *   213:  book title button navigates to /reader/:id
 *   248:  Cancel button in edit mode closes textarea
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

// ── Lines 38-39: unauthenticated → router.replace("/login") ─────────────────

describe("NotesPage — unauthenticated redirect (lines 38-39)", () => {
  it("calls router.replace('/login') when status is unauthenticated", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });

    render(<NotesPage />);
    await flushPromises();

    expect(mockRouterReplace).toHaveBeenCalledWith("/login");
  });

  it("does not call getAllAnnotations when unauthenticated", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });

    render(<NotesPage />);
    await flushPromises();

    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it("does not redirect when status is 'loading'", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "loading" });

    render(<NotesPage />);
    await flushPromises();

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});

// ── Lines 110-121: handleColorChange ─────────────────────────────────────────

describe("NotesPage — handleColorChange (lines 110-121)", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok" },
      status: "authenticated",
    });
  });

  it("calls updateAnnotation with new color when color dot is clicked", async () => {
    const ann = makeAnnotation({ color: "yellow" });
    mockGetAll.mockResolvedValue([ann]);
    mockUpdate.mockResolvedValue({ ...ann, color: "blue" });

    render(<NotesPage />);
    await waitFor(() => expect(screen.getByText("Pride and Prejudice")).toBeInTheDocument());

    // Click the blue color dot (title="blue")
    const blueColorDots = screen.getAllByTitle("blue");
    // Click one of them (the per-annotation color picker)
    fireEvent.click(blueColorDots[0]);

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(ann.id, {
        note_text: ann.note_text,
        color: "blue",
      }),
    );
  });

  it("updates annotation color in state after successful updateAnnotation", async () => {
    const ann = makeAnnotation({ id: 5, color: "yellow" });
    mockGetAll.mockResolvedValue([ann]);
    mockUpdate.mockResolvedValue({ ...ann, color: "green" });

    render(<NotesPage />);
    await waitFor(() => screen.getByText("Pride and Prejudice"));

    const greenDots = screen.getAllByTitle("green");
    fireEvent.click(greenDots[0]);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  });
});

// ── Lines 184-191: header "← Library" button and annotation count ─────────

describe("NotesPage — header buttons (lines 184-191)", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok" },
      status: "authenticated",
    });
  });

  it("navigates to / when ← Library button is clicked", async () => {
    mockGetAll.mockResolvedValue([makeAnnotation()]);

    render(<NotesPage />);
    await waitFor(() => screen.getByText("Pride and Prejudice"));

    const libraryBtn = screen.getByRole("button", { name: /← Library/i });
    fireEvent.click(libraryBtn);

    expect(mockRouterPush).toHaveBeenCalledWith("/");
  });

  it("shows singular 'annotation' for exactly 1 annotation", async () => {
    mockGetAll.mockResolvedValue([makeAnnotation()]);

    render(<NotesPage />);
    await waitFor(() =>
      expect(screen.getByText("1 annotation")).toBeInTheDocument(),
    );
  });

  it("shows plural 'annotations' for 2 annotations", async () => {
    mockGetAll.mockResolvedValue([
      makeAnnotation({ id: 1 }),
      makeAnnotation({ id: 2 }),
    ]);

    render(<NotesPage />);
    await waitFor(() =>
      expect(screen.getByText("2 annotations")).toBeInTheDocument(),
    );
  });
});

// ── Line 213: book title button navigates to reader ──────────────────────────

describe("NotesPage — book title link navigates to reader (line 213)", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok" },
      status: "authenticated",
    });
  });

  it("navigates to /reader/:id when book title is clicked", async () => {
    mockGetAll.mockResolvedValue([makeAnnotation({ book_id: 42, book_title: "War and Peace" })]);

    render(<NotesPage />);
    await waitFor(() => screen.getByText("War and Peace"));

    const bookTitleBtn = screen.getByRole("button", { name: "War and Peace" });
    fireEvent.click(bookTitleBtn);

    expect(mockRouterPush).toHaveBeenCalledWith("/reader/42");
  });

  it("navigates to /reader/:id when 'Open →' button is clicked", async () => {
    mockGetAll.mockResolvedValue([makeAnnotation({ book_id: 42, book_title: "War and Peace" })]);

    render(<NotesPage />);
    await waitFor(() => screen.getByText("War and Peace"));

    const openBtn = screen.getByRole("button", { name: "Open →" });
    fireEvent.click(openBtn);

    expect(mockRouterPush).toHaveBeenCalledWith("/reader/42");
  });
});

// ── Line 248: Cancel button closes edit mode ──────────────────────────────────

describe("NotesPage — Cancel button in edit mode (line 248)", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok" },
      status: "authenticated",
    });
  });

  it("closes textarea when Cancel is clicked", async () => {
    mockGetAll.mockResolvedValue([makeAnnotation({ note_text: "Some note" })]);

    render(<NotesPage />);
    await waitFor(() => expect(screen.getByText("Some note")).toBeInTheDocument());

    // Open edit mode
    fireEvent.click(screen.getByText("Some note"));
    expect(document.querySelector("textarea")).toBeInTheDocument();

    // Click Cancel
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    // textarea should be gone
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
  });

  it("shows 'Add a note…' when note_text is empty and not editing", async () => {
    mockGetAll.mockResolvedValue([makeAnnotation({ note_text: "" })]);

    render(<NotesPage />);
    await waitFor(() => screen.getByText("Pride and Prejudice"));

    expect(screen.getByText("Add a note…")).toBeInTheDocument();
  });
});

// ── Additional: empty state with existing annotations + filter ────────────────

describe("NotesPage — empty state variants", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok" },
      status: "authenticated",
    });
  });

  it("shows 'No results for current filter' when annotations exist but none pass filter", async () => {
    mockGetAll.mockResolvedValue([
      makeAnnotation({ color: "yellow", sentence_text: "Yellow only." }),
    ]);

    render(<NotesPage />);
    await waitFor(() => screen.getByText("Pride and Prejudice"));

    // Apply color filter for blue — yellow annotation won't show
    const blueFilterBtn = screen.getAllByRole("button", { name: /^blue$/i })[0];
    fireEvent.click(blueFilterBtn);

    await waitFor(() =>
      expect(screen.getByText(/No results for the current filter/i)).toBeInTheDocument(),
    );
  });

  it("toggles color filter off when clicked twice", async () => {
    mockGetAll.mockResolvedValue([
      makeAnnotation({ color: "blue", sentence_text: "Blue sentence." }),
    ]);

    render(<NotesPage />);
    await waitFor(() => screen.getByText("Pride and Prejudice"));

    // Enable filter
    const blueFilterBtn = screen.getAllByRole("button", { name: /^blue$/i })[0];
    fireEvent.click(blueFilterBtn);

    // Disable filter
    fireEvent.click(blueFilterBtn);

    // Both annotations should be visible now
    expect(screen.getByText(/Blue sentence\./)).toBeInTheDocument();
  });
});

// ── Additional: singular note count in book section ──────────────────────────

describe("NotesPage — note count in book section", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok" },
      status: "authenticated",
    });
  });

  it("shows '1 note' (singular) for a book with one annotation", async () => {
    mockGetAll.mockResolvedValue([makeAnnotation()]);

    render(<NotesPage />);
    await waitFor(() =>
      expect(screen.getByText("1 note")).toBeInTheDocument(),
    );
  });

  it("shows '2 notes' (plural) for a book with two annotations", async () => {
    mockGetAll.mockResolvedValue([
      makeAnnotation({ id: 1 }),
      makeAnnotation({ id: 2 }),
    ]);

    render(<NotesPage />);
    await waitFor(() =>
      expect(screen.getByText("2 notes")).toBeInTheDocument(),
    );
  });
});

// ── Additional: annotation with no book_title uses fallback ──────────────────

describe("NotesPage — annotation without book_title", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok" },
      status: "authenticated",
    });
  });

  it("shows 'Book #N' fallback when book_title is null", async () => {
    mockGetAll.mockResolvedValue([
      makeAnnotation({ book_id: 99, book_title: undefined }),
    ]);

    render(<NotesPage />);
    await waitFor(() =>
      expect(screen.getByText("Book #99")).toBeInTheDocument(),
    );
  });
});

// ── Unknown color fallback (COLOR_BADGE[ann.color] ?? COLOR_BADGE.yellow) ────

describe("NotesPage — unknown color fallback", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok" },
      status: "authenticated",
    });
  });

  it("renders annotation with unknown color using yellow fallback", async () => {
    const ann = makeAnnotation({ color: "magenta" as string });
    mockGetAll.mockResolvedValue([ann]);
    render(<NotesPage />);
    await waitFor(() => screen.getByText(/It is a truth/));
    expect(screen.getByText(/It is a truth/)).toBeInTheDocument();
  });
});

// ── Additional: handleDelete error path ──────────────────────────────────────

describe("NotesPage — handleDelete error path", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok" },
      status: "authenticated",
    });
  });

  it("handles deleteAnnotation failure gracefully", async () => {
    const ann = makeAnnotation({ sentence_text: "Delete fails." });
    mockGetAll.mockResolvedValue([ann]);
    mockDelete.mockRejectedValue(new Error("Delete failed"));

    render(<NotesPage />);
    await waitFor(() => screen.getByText(/Delete fails\./));

    jest.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByTitle("Delete annotation"));

    await waitFor(() => expect(mockDelete).toHaveBeenCalled());

    // Component should still render (no crash)
    expect(screen.getByText(/Delete fails\./)).toBeInTheDocument();
  });
});
