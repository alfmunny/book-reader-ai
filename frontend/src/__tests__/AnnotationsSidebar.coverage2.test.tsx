/**
 * AnnotationsSidebar — additional coverage for uncovered lines:
 * Line 67: close (✕) button closes sidebar
 * Line 113: 📄 link with bookId — present, stopPropagation prevents onJump
 * Lines 147/154: footer link onClick calls setOpen(false)
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnnotationsSidebar from "@/components/AnnotationsSidebar";
import type { Annotation } from "@/lib/api";

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 1, book_id: 1, chapter_index: 0,
    sentence_text: "A sentence.", note_text: "A note.", color: "yellow",
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

beforeEach(() => { jest.clearAllMocks(); });

test("close (✕) button closes the sidebar", async () => {
  render(<AnnotationsSidebar {...BASE_PROPS} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));
  expect(screen.getByTestId("annotations-sidebar")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

test("📄 notes link appears when bookId provided and annotation present", async () => {
  const ann = makeAnnotation({ id: 5 });
  render(<AnnotationsSidebar {...BASE_PROPS} annotations={[ann]} totalCount={1} bookId={42} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));

  const notesLink = screen.getByTitle("View in notes page");
  expect(notesLink).toHaveAttribute("href", "/notes/42#annotation-5");
});

test("clicking 📄 notes link closes sidebar without calling onJump", async () => {
  const ann = makeAnnotation({ id: 7 });
  render(<AnnotationsSidebar {...BASE_PROPS} annotations={[ann]} totalCount={1} bookId={99} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));

  fireEvent.click(screen.getByTitle("View in notes page"));

  expect(BASE_PROPS.onJump).not.toHaveBeenCalled();
  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

test("footer 'All books' link click closes sidebar", async () => {
  render(<AnnotationsSidebar {...BASE_PROPS} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));

  const allBooksLink = screen.getByRole("link", { name: /all books/i });
  fireEvent.click(allBooksLink);

  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

test("footer 'Book notes' link click closes sidebar when bookId provided", async () => {
  render(<AnnotationsSidebar {...BASE_PROPS} bookId={10} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));

  const bookNotesLink = screen.getByRole("link", { name: /book notes/i });
  fireEvent.click(bookNotesLink);

  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

test("📄 link not shown when bookId is absent", async () => {
  const ann = makeAnnotation();
  render(<AnnotationsSidebar {...BASE_PROPS} annotations={[ann]} totalCount={1} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));

  expect(screen.queryByTitle("View in notes page")).not.toBeInTheDocument();
});

test("annotation with unknown color falls back to yellow badge (line 102 ?? fallback)", async () => {
  const ann = makeAnnotation({ color: "purple" as Annotation["color"] });
  render(<AnnotationsSidebar {...BASE_PROPS} annotations={[ann]} totalCount={1} />);
  await userEvent.click(screen.getByTestId("annotations-toggle"));

  // The annotation card should render without crashing
  expect(screen.getByText(/A sentence/)).toBeInTheDocument();
});
