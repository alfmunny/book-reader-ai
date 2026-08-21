/**
 * WeChat-style notes (owner request 2026-08-21): the per-line note dot is
 * gone — tapping marked text opens QuickHighlightPanel, which displays the
 * annotation's note above the color/action toolbar.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import QuickHighlightPanel from "@/components/QuickHighlightPanel";
import type { Annotation } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

const noop = () => {};

const baseProps = {
  sentenceText: "die unbegreiflich hohen Werke",
  chapterIndex: 2,
  bookId: 2229,
  position: { x: 300, y: 200 },
  onClose: noop,
  onSaved: noop,
  onDeleted: noop,
  onOpenNote: noop,
};

const noted: Annotation = {
  id: 7,
  book_id: 2229,
  chapter_index: 2,
  sentence_text: "unbegreiflich",
  note_text: "A lot of note taking is happening.",
  color: "yellow",
};

test("shows the annotation's note above the toolbar", () => {
  render(<QuickHighlightPanel {...baseProps} existingAnnotation={noted} />);
  const note = screen.getByTestId("quick-highlight-note");
  expect(note).toHaveTextContent("A lot of note taking is happening.");
});

test("shows no note block when the annotation has no note", () => {
  render(
    <QuickHighlightPanel
      {...baseProps}
      existingAnnotation={{ ...noted, note_text: null }}
    />,
  );
  expect(screen.queryByTestId("quick-highlight-note")).toBeNull();
});

test("note button reads 'Edit note' when a note exists, 'Add note' otherwise", () => {
  const { unmount } = render(<QuickHighlightPanel {...baseProps} existingAnnotation={noted} />);
  expect(screen.getByRole("button", { name: "Edit note" })).toBeInTheDocument();
  unmount();

  render(<QuickHighlightPanel {...baseProps} />);
  expect(screen.getByRole("button", { name: "Add note" })).toBeInTheDocument();
});
