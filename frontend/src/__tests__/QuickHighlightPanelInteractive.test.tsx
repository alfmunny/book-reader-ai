/**
 * Coverage tests for QuickHighlightPanel interactive paths (closes #1674).
 * Pre-existing QuickHighlightPanelTouchTarget.test.tsx covers only touch
 * target sizing; the create/update/delete/dismiss paths were 0% covered.
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/lib/api", () => ({
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

import {
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  Annotation,
} from "@/lib/api";
import QuickHighlightPanel from "@/components/QuickHighlightPanel";

const mockCreate = createAnnotation as jest.MockedFunction<typeof createAnnotation>;
const mockUpdate = updateAnnotation as jest.MockedFunction<typeof updateAnnotation>;
const mockDelete = deleteAnnotation as jest.MockedFunction<typeof deleteAnnotation>;

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

function existing(): Annotation {
  return {
    id: 42,
    book_id: 10,
    chapter_index: 0,
    sentence_text: "Call me Ishmael.",
    note_text: "",
    color: "yellow",
  };
}

afterEach(() => {
  jest.clearAllMocks();
  baseProps.onClose = jest.fn();
  baseProps.onSaved = jest.fn();
  baseProps.onDeleted = jest.fn();
  baseProps.onOpenNote = jest.fn();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("QuickHighlightPanel — outside dismiss (#1674)", () => {
  test("clicking outside the panel calls onClose", async () => {
    render(<QuickHighlightPanel {...baseProps} />);
    // mousedown on document.body, outside the panel
    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    });
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  test("clicking inside the panel does not call onClose", async () => {
    render(<QuickHighlightPanel {...baseProps} />);
    const panel = screen.getByRole("toolbar", { name: "Highlight options" });
    await act(async () => {
      panel.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  test("Escape key calls onClose", async () => {
    render(<QuickHighlightPanel {...baseProps} />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  test("non-Escape key does not call onClose", async () => {
    render(<QuickHighlightPanel {...baseProps} />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });
});

describe("QuickHighlightPanel — handleColor create path (#1674)", () => {
  test("clicking colour with no existingAnnotation calls createAnnotation", async () => {
    const saved: Annotation = { ...existing(), color: "blue" };
    mockCreate.mockResolvedValue(saved);
    const user = userEvent.setup();
    render(<QuickHighlightPanel {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Blue" }));
    await flush();
    expect(mockCreate).toHaveBeenCalledWith({
      book_id: 10,
      chapter_index: 0,
      sentence_text: "Call me Ishmael.",
      note_text: "",
      color: "blue",
    });
    expect(baseProps.onSaved).toHaveBeenCalledWith(saved);
    expect(baseProps.onClose).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("createAnnotation rejection clears busy and skips onSaved", async () => {
    mockCreate.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<QuickHighlightPanel {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Yellow" }));
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(baseProps.onSaved).not.toHaveBeenCalled();
    expect(baseProps.onClose).not.toHaveBeenCalled();
    // Second click must work — busy was reset.
    mockCreate.mockResolvedValueOnce(existing());
    await user.click(screen.getByRole("button", { name: "Yellow" }));
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

describe("QuickHighlightPanel — handleColor update path (#1674)", () => {
  test("clicking colour with existingAnnotation calls updateAnnotation", async () => {
    const ann = existing();
    const saved: Annotation = { ...ann, color: "green" };
    mockUpdate.mockResolvedValue(saved);
    const user = userEvent.setup();
    render(<QuickHighlightPanel {...baseProps} existingAnnotation={ann} />);
    await user.click(screen.getByRole("button", { name: "Green" }));
    await flush();
    expect(mockUpdate).toHaveBeenCalledWith(42, {
      color: "green",
      note_text: "",
    });
    expect(baseProps.onSaved).toHaveBeenCalledWith(saved);
    expect(baseProps.onClose).toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// Note: the explicit `if (busy) return;` guards inside handleColor /
// handleDelete are unreachable from a test because the buttons render
// `disabled={busy}` and JSDOM (matching real browsers) blocks click events
// on disabled buttons. The guards are defence-in-depth against future
// refactors that drop the disabled attribute. Leaving lines 63 and 89
// uncovered is intentional — branch coverage still lands at 88.88%, well
// above the 60% threshold.

describe("QuickHighlightPanel — handleDelete path (#1674)", () => {
  test("clicking Delete calls deleteAnnotation, onDeleted, onClose", async () => {
    const ann = existing();
    mockDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<QuickHighlightPanel {...baseProps} existingAnnotation={ann} />);
    await user.click(screen.getByRole("button", { name: "Delete highlight" }));
    await flush();
    expect(mockDelete).toHaveBeenCalledWith(42);
    expect(baseProps.onDeleted).toHaveBeenCalledWith(42);
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  test("deleteAnnotation rejection clears busy and skips onDeleted", async () => {
    const ann = existing();
    mockDelete.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<QuickHighlightPanel {...baseProps} existingAnnotation={ann} />);
    await user.click(screen.getByRole("button", { name: "Delete highlight" }));
    await flush();
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(baseProps.onDeleted).not.toHaveBeenCalled();
    expect(baseProps.onClose).not.toHaveBeenCalled();
    // Second click must work — busy was reset.
    mockDelete.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole("button", { name: "Delete highlight" }));
    await flush();
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });
});
