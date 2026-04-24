/**
 * Tests for AnnotationToolbar component.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/lib/api", () => ({
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

import * as api from "@/lib/api";
import AnnotationToolbar from "@/components/AnnotationToolbar";

const mockCreateAnnotation = api.createAnnotation as jest.MockedFunction<typeof api.createAnnotation>;
const mockUpdateAnnotation = api.updateAnnotation as jest.MockedFunction<typeof api.updateAnnotation>;
const mockDeleteAnnotation = api.deleteAnnotation as jest.MockedFunction<typeof api.deleteAnnotation>;

const BASE_PROPS = {
  sentenceText: "It is a truth universally acknowledged.",
  chapterIndex: 0,
  bookId: 1,
  onClose: jest.fn(),
  onSaved: jest.fn(),
  onDeleted: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("renders color picker and save button", () => {
  render(<AnnotationToolbar {...BASE_PROPS} />);
  expect(screen.getByTestId("annotation-toolbar")).toBeInTheDocument();
  expect(screen.getByLabelText("Yellow")).toBeInTheDocument();
  expect(screen.getByLabelText("Blue")).toBeInTheDocument();
  expect(screen.getByLabelText("Green")).toBeInTheDocument();
  expect(screen.getByLabelText("Pink")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
});

test("does not show Delete button when no existing annotation", () => {
  render(<AnnotationToolbar {...BASE_PROPS} />);
  expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
});

test("shows Delete button when existingAnnotation is provided", () => {
  render(
    <AnnotationToolbar
      {...BASE_PROPS}
      existingAnnotation={{ id: 42, note_text: "My note", color: "blue" }}
    />,
  );
  expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
});

test("pre-fills color and note from existingAnnotation", () => {
  render(
    <AnnotationToolbar
      {...BASE_PROPS}
      existingAnnotation={{ id: 42, note_text: "Interesting passage", color: "green" }}
    />,
  );
  const textarea = screen.getByPlaceholderText(/Your thoughts/i) as HTMLTextAreaElement;
  expect(textarea.value).toBe("Interesting passage");
  // Green button should appear selected (scale-110 class on inner swatch span)
  const greenBtn = screen.getByLabelText("Green");
  const swatch = greenBtn.querySelector("span");
  expect(swatch?.className).toMatch(/scale-110/);
});

test("calls createAnnotation and onSaved when saving new annotation", async () => {
  const annotation = {
    id: 1,
    chapter_index: 0,
    sentence_text: BASE_PROPS.sentenceText,
    note_text: "My note",
    color: "yellow",
  };
  mockCreateAnnotation.mockResolvedValue(annotation);

  render(<AnnotationToolbar {...BASE_PROPS} />);

  const textarea = screen.getByPlaceholderText(/Your thoughts/i);
  await userEvent.type(textarea, "My note");

  await userEvent.click(screen.getByRole("button", { name: /save note/i }));

  await waitFor(() => {
    expect(mockCreateAnnotation).toHaveBeenCalledWith({
      book_id: 1,
      chapter_index: 0,
      sentence_text: BASE_PROPS.sentenceText,
      note_text: "My note",
      color: "yellow",
    });
    expect(BASE_PROPS.onSaved).toHaveBeenCalledWith(annotation);
    expect(BASE_PROPS.onClose).toHaveBeenCalled();
  });
});

test("calls updateAnnotation when saving existing annotation", async () => {
  const updated = {
    id: 42,
    chapter_index: 0,
    sentence_text: BASE_PROPS.sentenceText,
    note_text: "Updated",
    color: "blue",
  };
  mockUpdateAnnotation.mockResolvedValue(updated);

  render(
    <AnnotationToolbar
      {...BASE_PROPS}
      existingAnnotation={{ id: 42, note_text: "Old note", color: "yellow" }}
    />,
  );

  // Change color to blue
  await userEvent.click(screen.getByLabelText("Blue"));

  await userEvent.click(screen.getByRole("button", { name: /update/i }));

  await waitFor(() => {
    expect(mockUpdateAnnotation).toHaveBeenCalledWith(42, expect.objectContaining({ color: "blue" }));
    expect(BASE_PROPS.onSaved).toHaveBeenCalledWith(updated);
  });
});

test("calls deleteAnnotation and onDeleted when deleting", async () => {
  mockDeleteAnnotation.mockResolvedValue({ ok: true });

  render(
    <AnnotationToolbar
      {...BASE_PROPS}
      existingAnnotation={{ id: 42, note_text: "", color: "pink" }}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: /delete/i }));

  await waitFor(() => {
    expect(mockDeleteAnnotation).toHaveBeenCalledWith(42);
    expect(BASE_PROPS.onDeleted).toHaveBeenCalledWith(42);
    expect(BASE_PROPS.onClose).toHaveBeenCalled();
  });
});

test("calls onClose when close button is clicked", async () => {
  render(<AnnotationToolbar {...BASE_PROPS} />);
  await userEvent.click(screen.getByRole("button", { name: /close/i }));
  expect(BASE_PROPS.onClose).toHaveBeenCalled();
});
