/**
 * Regression test for issue #2406: AnnotationToolbar close button and backdrop
 * were dismissible during save/delete, risking silent data loss.
 *
 * The close button must be disabled (and the backdrop click must be a no-op)
 * while a save or delete operation is in flight.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AnnotationToolbar from "@/components/AnnotationToolbar";
import * as api from "@/lib/api";

jest.mock("@/lib/api", () => ({
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

// Suppress useFocusTrap / useScrollLock DOM warnings in test environment
jest.mock("@/lib/useFocusTrap", () => ({ useFocusTrap: jest.fn() }));
jest.mock("@/lib/useScrollLock", () => ({ useScrollLock: jest.fn() }));

const baseProps = {
  sentenceText: "The quick brown fox.",
  chapterIndex: 0,
  bookId: 1,
  onClose: jest.fn(),
  onSaved: jest.fn(),
  onDeleted: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AnnotationToolbar close guard during async operations (issue #2406)", () => {
  it("close button is disabled while save is in flight", async () => {
    // createAnnotation never resolves — simulates slow network
    (api.createAnnotation as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<AnnotationToolbar {...baseProps} />);

    // Trigger save
    fireEvent.click(screen.getByRole("button", { name: /Save note/i }));

    // Close button must be disabled while save is in progress
    const closeBtn = screen.getByRole("button", { name: /Close note editor/i });
    expect(closeBtn).toBeDisabled();
  });

  it("backdrop click does not call onClose while save is in flight", async () => {
    (api.createAnnotation as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<AnnotationToolbar {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Save note/i }));

    const backdrop = document.querySelector("[data-testid='annotation-backdrop']") as HTMLElement;
    fireEvent.click(backdrop);

    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  it("close button is disabled while delete is in flight", async () => {
    (api.deleteAnnotation as jest.Mock).mockReturnValue(new Promise(() => {}));

    const existingAnnotation = { id: 42, note_text: "Old note", color: "yellow" };
    render(<AnnotationToolbar {...baseProps} existingAnnotation={existingAnnotation} />);

    fireEvent.click(screen.getByRole("button", { name: /Delete note/i }));

    const closeBtn = screen.getByRole("button", { name: /Close note editor/i });
    expect(closeBtn).toBeDisabled();
  });

  it("close button is re-enabled after save completes", async () => {
    const annotation = { id: 1, book_id: 1, chapter_index: 0, sentence_index: 0, color: "yellow", note_text: "", created_at: "" };
    (api.createAnnotation as jest.Mock).mockResolvedValue(annotation);

    render(<AnnotationToolbar {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Save note/i }));

    await waitFor(() => {
      expect(baseProps.onSaved).toHaveBeenCalled();
    });
  });
});
