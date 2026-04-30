/**
 * Regression test for #2473: QuickHighlightPanel and SentenceActionPopup must
 * restore focus to the previously-focused element when they unmount, so
 * keyboard users do not lose their position in the document (WCAG 2.4.3).
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/lib/api", () => ({
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

import { createAnnotation, updateAnnotation, deleteAnnotation } from "@/lib/api";
import QuickHighlightPanel from "@/components/QuickHighlightPanel";
import SentenceActionPopup from "@/components/SentenceActionPopup";

const mockCreate = createAnnotation as jest.MockedFunction<typeof createAnnotation>;
const mockUpdate = updateAnnotation as jest.MockedFunction<typeof updateAnnotation>;
const mockDelete = deleteAnnotation as jest.MockedFunction<typeof deleteAnnotation>;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({ id: 1, sentence_text: "Hello.", color: "yellow", book_id: 1, chapter_index: 0 } as never);
  mockUpdate.mockResolvedValue({ id: 1, sentence_text: "Hello.", color: "blue", book_id: 1, chapter_index: 0 } as never);
  mockDelete.mockResolvedValue(undefined as never);
});

describe("QuickHighlightPanel focus restoration (closes #2473)", () => {
  it("restores focus to the previously-focused element when the panel unmounts", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open panel";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const onClose = jest.fn();
    const { unmount } = render(
      <QuickHighlightPanel
        sentenceText="Hello."
        chapterIndex={0}
        bookId={1}
        position={{ x: 200, y: 200 }}
        onClose={onClose}
        onSaved={jest.fn()}
        onDeleted={jest.fn()}
      />
    );

    // Panel should have moved focus into itself
    expect(document.activeElement).not.toBe(trigger);

    // When panel unmounts, focus should return to trigger
    unmount();
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });
});

describe("SentenceActionPopup focus restoration (closes #2473)", () => {
  it("restores focus to the previously-focused element when the popup unmounts", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open popup";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <SentenceActionPopup
        sentenceText="Call me Ishmael."
        position={{ x: 200, y: 200 }}
        onRead={jest.fn()}
        onClose={jest.fn()}
      />
    );

    // Popup should have moved focus into itself
    expect(document.activeElement).not.toBe(trigger);

    // When popup unmounts, focus should return to trigger
    unmount();
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });
});
