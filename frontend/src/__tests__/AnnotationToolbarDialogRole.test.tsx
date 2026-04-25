/**
 * Regression test for #1222: AnnotationToolbar panel must have role="dialog",
 * aria-modal="true", and aria-labelledby so screen readers announce it correctly.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

import AnnotationToolbar from "@/components/AnnotationToolbar";

const BASE_PROPS = {
  sentenceText: "It is a truth universally acknowledged.",
  chapterIndex: 0,
  bookId: 1,
  onClose: jest.fn(),
  onSaved: jest.fn(),
  onDeleted: jest.fn(),
};

test("panel has role=dialog and aria-modal=true", () => {
  render(<AnnotationToolbar {...BASE_PROPS} />);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeInTheDocument();
  expect(dialog).toHaveAttribute("aria-modal", "true");
});

test("dialog is labelled by the visible title", () => {
  render(<AnnotationToolbar {...BASE_PROPS} />);
  const dialog = screen.getByRole("dialog");
  const labelId = dialog.getAttribute("aria-labelledby");
  expect(labelId).toBeTruthy();
  const titleEl = document.getElementById(labelId!);
  expect(titleEl).toBeInTheDocument();
  expect(titleEl!.textContent).toMatch(/add note/i);
});

test("dialog title says 'Edit note' when editing an existing annotation", () => {
  render(
    <AnnotationToolbar
      {...BASE_PROPS}
      existingAnnotation={{ id: 1, note_text: "old", color: "yellow" }}
    />,
  );
  const dialog = screen.getByRole("dialog");
  const labelId = dialog.getAttribute("aria-labelledby");
  const titleEl = document.getElementById(labelId!);
  expect(titleEl!.textContent).toMatch(/edit note/i);
});
