/**
 * Tests for components/AnnotationsSidebar.tsx
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnnotationsSidebar from "@/components/AnnotationsSidebar";
import type { Annotation } from "@/lib/api";

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 1,
    book_id: 1,
    chapter_index: 0,
    sentence_text: "A sentence.",
    note_text: "A note.",
    color: "yellow",
    ...overrides,
  };
}

const BASE_PROPS = {
  annotations: [] as Annotation[],
  totalCount: 0,
  onJump: jest.fn(),
  onEdit: jest.fn(),
  loading: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("toggle button is visible; sidebar hidden by default", () => {
  render(<AnnotationsSidebar {...BASE_PROPS} />);
  expect(screen.getByTestId("annotations-toggle")).toBeInTheDocument();
  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

test("sidebar shows after clicking the toggle button", async () => {
  render(<AnnotationsSidebar {...BASE_PROPS} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));
  expect(screen.getByTestId("annotations-sidebar")).toBeInTheDocument();
});

test("badge shows totalCount when > 0", () => {
  render(<AnnotationsSidebar {...BASE_PROPS} totalCount={5} />);
  expect(screen.getByText("5")).toBeInTheDocument();
});

test("badge is absent when totalCount is 0", () => {
  render(<AnnotationsSidebar {...BASE_PROPS} totalCount={0} />);
  // The only visible number should not be the count badge
  expect(screen.queryByText("0")).not.toBeInTheDocument();
});

test("shows loading spinner (centered) when loading=true and annotations empty", async () => {
  render(<AnnotationsSidebar {...BASE_PROPS} loading={true} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));
  // Spinner is an <span> with animate-spin; verify it exists
  const sidebar = screen.getByTestId("annotations-sidebar");
  expect(sidebar.querySelector(".animate-spin")).toBeInTheDocument();
  // Should NOT show the empty state text
  expect(screen.queryByText(/No annotations yet/i)).not.toBeInTheDocument();
});

test("shows loading spinner above the list when loading=true with annotations", async () => {
  const annotations = [makeAnnotation()];
  render(<AnnotationsSidebar {...BASE_PROPS} annotations={annotations} loading={true} totalCount={1} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));
  const sidebar = screen.getByTestId("annotations-sidebar");
  // Should show the small spinner (w-4 h-4) above the list
  expect(sidebar.querySelector(".animate-spin")).toBeInTheDocument();
  // And still render the annotation
  expect(screen.getByText(/A sentence\./)).toBeInTheDocument();
});

test("shows empty state when annotations=[]", async () => {
  render(<AnnotationsSidebar {...BASE_PROPS} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));
  expect(screen.getByText(/No annotations yet/i)).toBeInTheDocument();
});

test("groups annotations by chapter_index sorted ascending", async () => {
  const annotations = [
    makeAnnotation({ id: 3, chapter_index: 2, sentence_text: "Chapter 3 sentence." }),
    makeAnnotation({ id: 1, chapter_index: 0, sentence_text: "Chapter 1 sentence." }),
    makeAnnotation({ id: 2, chapter_index: 1, sentence_text: "Chapter 2 sentence." }),
  ];
  render(<AnnotationsSidebar {...BASE_PROPS} annotations={annotations} totalCount={3} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));

  const headings = screen.getAllByRole("heading", { level: 3 });
  expect(headings[0]).toHaveTextContent("Chapter 1");
  expect(headings[1]).toHaveTextContent("Chapter 2");
  expect(headings[2]).toHaveTextContent("Chapter 3");
});

test("clicking an annotation calls onJump and closes sidebar", async () => {
  const ann = makeAnnotation({ sentence_text: "Click me sentence." });
  render(<AnnotationsSidebar {...BASE_PROPS} annotations={[ann]} totalCount={1} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));

  fireEvent.click(screen.getByText(/Click me sentence\./));

  expect(BASE_PROPS.onJump).toHaveBeenCalledWith(ann);
  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

test("edit button calls onEdit and closes sidebar (stopPropagation prevents onJump)", async () => {
  const ann = makeAnnotation({ sentence_text: "Editable sentence." });
  render(<AnnotationsSidebar {...BASE_PROPS} annotations={[ann]} totalCount={1} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));

  fireEvent.click(screen.getByTitle("Edit annotation"));

  expect(BASE_PROPS.onEdit).toHaveBeenCalledWith(ann);
  expect(BASE_PROPS.onJump).not.toHaveBeenCalled();
  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

test("backdrop click closes sidebar", async () => {
  render(<AnnotationsSidebar {...BASE_PROPS} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));
  expect(screen.getByTestId("annotations-sidebar")).toBeInTheDocument();

  // The backdrop has fixed inset-0 bg-black/10
  const backdrop = document.querySelector(".bg-black\\/10");
  expect(backdrop).toBeInTheDocument();
  fireEvent.click(backdrop!);

  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

test("sidebar footer shows 'All books' link to /notes", async () => {
  render(<AnnotationsSidebar {...BASE_PROPS} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));
  const allBooksLink = screen.getByRole("link", { name: /all books/i });
  expect(allBooksLink).toBeInTheDocument();
  expect(allBooksLink).toHaveAttribute("href", "/notes");
});

test("sidebar footer shows 'Book notes' link when bookId provided", async () => {
  render(<AnnotationsSidebar {...BASE_PROPS} bookId={42} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));
  const bookLink = screen.getByRole("link", { name: /book notes/i });
  expect(bookLink).toHaveAttribute("href", "/notes/42");
});
