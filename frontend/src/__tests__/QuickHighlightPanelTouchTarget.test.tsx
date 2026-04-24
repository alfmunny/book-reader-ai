/**
 * Regression tests for issue #785 — QuickHighlightPanel buttons below 44px touch target.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

import QuickHighlightPanel from "@/components/QuickHighlightPanel";

const baseProps = {
  sentenceText: "Call me Ishmael.",
  chapterIndex: 0,
  bookId: 10,
  position: { x: 200, y: 200 },
  onClose: jest.fn(),
  onSaved: jest.fn(),
  onDeleted: jest.fn(),
  onOpenNote: jest.fn(),
};

afterEach(() => jest.clearAllMocks());

test("colour picker buttons have min-h-[44px] min-w-[44px] touch target", () => {
  render(<QuickHighlightPanel {...baseProps} />);
  const yellowBtn = screen.getByRole("button", { name: "Yellow" });
  expect(yellowBtn.className).toContain("min-h-[44px]");
  expect(yellowBtn.className).toContain("min-w-[44px]");
});

test("Note button has min-h-[44px] min-w-[44px] touch target", () => {
  render(<QuickHighlightPanel {...baseProps} />);
  const noteBtn = screen.getByRole("button", { name: "Add note" });
  expect(noteBtn.className).toContain("min-h-[44px]");
  expect(noteBtn.className).toContain("min-w-[44px]");
});

test("Delete button has min-h-[44px] min-w-[44px] touch target when annotation exists", () => {
  render(
    <QuickHighlightPanel
      {...baseProps}
      existingAnnotation={{
        id: 1,
        book_id: 10,
        chapter_index: 0,
        sentence_text: "Call me Ishmael.",
        note_text: "",
        color: "yellow",
      }}
    />,
  );
  const deleteBtn = screen.getByRole("button", { name: "Delete highlight" });
  expect(deleteBtn.className).toContain("min-h-[44px]");
  expect(deleteBtn.className).toContain("min-w-[44px]");
});
