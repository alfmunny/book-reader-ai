/**
 * Regression tests for issue #613 — AnnotationToolbar action buttons below 44px touch target.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

import AnnotationToolbar from "@/components/AnnotationToolbar";

const baseProps = {
  sentenceText: "Call me Ishmael.",
  chapterIndex: 0,
  bookId: 10,
  position: { x: 100, y: 100 },
  onClose: jest.fn(),
  onSaved: jest.fn(),
  onDeleted: jest.fn(),
};

afterEach(() => jest.clearAllMocks());

test("Save button has min-h-[44px] touch target", () => {
  render(<AnnotationToolbar {...baseProps} />);
  const saveBtn = screen.getByRole("button", { name: /save/i });
  expect(saveBtn.className).toContain("min-h-[44px]");
});

test("Close button has min-h-[44px] touch target", () => {
  render(<AnnotationToolbar {...baseProps} />);
  const closeBtn = screen.getByRole("button", { name: /close/i });
  expect(closeBtn.className).toContain("min-h-[44px]");
});

test("Delete button has min-h-[44px] touch target when annotation exists", () => {
  render(
    <AnnotationToolbar
      {...baseProps}
      existingAnnotation={{ id: 1, note_text: "note", color: "yellow" }}
    />
  );
  const deleteBtn = screen.getByRole("button", { name: /delete/i });
  expect(deleteBtn.className).toContain("min-h-[44px]");
});
