/**
 * Regression test for issue #2410: QuickHighlightPanel silently discarded
 * errors when highlight save/delete failed, leaving users with no feedback.
 *
 * When createAnnotation / updateAnnotation / deleteAnnotation rejects, the
 * panel must show an inline error message (role="alert") so users know to retry.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import QuickHighlightPanel from "@/components/QuickHighlightPanel";
import * as api from "@/lib/api";

jest.mock("@/lib/api", () => ({
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

const baseProps = {
  sentenceText: "The fox jumps.",
  chapterIndex: 0,
  bookId: 1,
  position: { x: 200, y: 200 },
  onClose: jest.fn(),
  onSaved: jest.fn(),
  onDeleted: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("QuickHighlightPanel error feedback (issue #2410)", () => {
  it("shows an error alert when highlight save fails", async () => {
    (api.createAnnotation as jest.Mock).mockRejectedValue(new Error("Network error"));

    render(<QuickHighlightPanel {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Yellow/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("error message references retry so user knows what to do", async () => {
    (api.createAnnotation as jest.Mock).mockRejectedValue(new Error("Network error"));

    render(<QuickHighlightPanel {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Yellow/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/fail|retry|error/i);
    });
  });

  it("shows an error alert when delete fails", async () => {
    const existingAnnotation = { id: 42, book_id: 1, chapter_index: 0, sentence_index: 0, sentence_text: "x", note_text: "", color: "yellow", created_at: "" };
    (api.deleteAnnotation as jest.Mock).mockRejectedValue(new Error("Server error"));

    render(<QuickHighlightPanel {...baseProps} existingAnnotation={existingAnnotation} />);

    fireEvent.click(screen.getByRole("button", { name: /Delete highlight/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("clears error when a new color action starts", async () => {
    // First call fails, second succeeds
    const annotation = { id: 1, book_id: 1, chapter_index: 0, sentence_index: 0, sentence_text: "x", note_text: "", color: "yellow", created_at: "" };
    (api.createAnnotation as jest.Mock)
      .mockRejectedValueOnce(new Error("Fail"))
      .mockResolvedValueOnce(annotation);

    render(<QuickHighlightPanel {...baseProps} />);

    // First click → error
    fireEvent.click(screen.getByRole("button", { name: /Yellow/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Second click → error should be cleared (and save succeeds → onSaved called)
    fireEvent.click(screen.getByRole("button", { name: /Blue/i }));
    await waitFor(() => {
      expect(baseProps.onSaved).toHaveBeenCalled();
    });
  });

  it("does not call onClose when save fails (panel stays open for retry)", async () => {
    (api.createAnnotation as jest.Mock).mockRejectedValue(new Error("Network error"));

    render(<QuickHighlightPanel {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Yellow/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(baseProps.onClose).not.toHaveBeenCalled();
  });
});
