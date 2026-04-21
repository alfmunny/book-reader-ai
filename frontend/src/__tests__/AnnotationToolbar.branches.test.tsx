/**
 * AnnotationToolbar — branch coverage for lines not yet covered:
 *   48:  outside click on document calls onClose
 *   91:  handleSave error path — non-Error thrown
 *   106: handleDelete error path — non-Error thrown
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";

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
  position: { x: 100, y: 200 },
  onClose: jest.fn(),
  onSaved: jest.fn(),
  onDeleted: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Line 48: outside click calls onClose ─────────────────────────────────────

describe("AnnotationToolbar — outside click closes panel (line 48)", () => {
  it("calls onClose when clicking outside the panel", () => {
    const onClose = jest.fn();
    render(
      <div>
        <AnnotationToolbar {...BASE_PROPS} onClose={onClose} />
        <div data-testid="outside">Outside element</div>
      </div>,
    );

    // Dispatch mousedown on an element outside the panel
    const outside = screen.getByTestId("outside");
    fireEvent.mouseDown(outside);

    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT call onClose when clicking inside the panel", () => {
    const onClose = jest.fn();
    render(<AnnotationToolbar {...BASE_PROPS} onClose={onClose} />);

    // Dispatch mousedown on the panel itself
    const panel = screen.getByTestId("annotation-toolbar");
    fireEvent.mouseDown(panel);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes listener on unmount — no call after unmount", () => {
    const onClose = jest.fn();
    const { unmount } = render(
      <div>
        <AnnotationToolbar {...BASE_PROPS} onClose={onClose} />
        <div data-testid="outside2">Outside</div>
      </div>,
    );

    unmount();

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    fireEvent.mouseDown(outside);
    document.body.removeChild(outside);

    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── Escape key closes panel ───────────────────────────────────────────────────

describe("AnnotationToolbar — Escape key closes panel", () => {
  it("calls onClose when Escape key is pressed", () => {
    const onClose = jest.fn();
    render(<AnnotationToolbar {...BASE_PROPS} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose for non-Escape keys", () => {
    const onClose = jest.fn();
    render(<AnnotationToolbar {...BASE_PROPS} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── Line 91: handleSave error — non-Error thrown ─────────────────────────────

describe("AnnotationToolbar — handleSave error paths (line 91)", () => {
  it("shows 'Save failed. Please try again.' when non-Error is thrown", async () => {
    mockCreateAnnotation.mockRejectedValue("unexpected string error");

    const user = userEvent.setup();
    render(<AnnotationToolbar {...BASE_PROPS} />);

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByText("Save failed. Please try again.")).toBeInTheDocument(),
    );
  });

  it("shows error.message when Error is thrown during save", async () => {
    mockCreateAnnotation.mockRejectedValue(new Error("Network timeout"));

    const user = userEvent.setup();
    render(<AnnotationToolbar {...BASE_PROPS} />);

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByText("Network timeout")).toBeInTheDocument(),
    );
  });

  it("shows saving indicator while save is in progress", async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    mockCreateAnnotation.mockReturnValue(new Promise((res) => { resolveCreate = res; }));

    const user = userEvent.setup();
    render(<AnnotationToolbar {...BASE_PROPS} />);

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText("Saving…")).toBeInTheDocument();

    resolveCreate({
      id: 1,
      chapter_index: 0,
      sentence_text: BASE_PROPS.sentenceText,
      note_text: "",
      color: "yellow",
    });
  });
});

// ── Line 106: handleDelete error — non-Error thrown ──────────────────────────

describe("AnnotationToolbar — handleDelete error paths (line 106)", () => {
  const EXISTING = { id: 42, note_text: "My note", color: "blue" };

  it("shows 'Delete failed. Please try again.' when non-Error is thrown", async () => {
    mockDeleteAnnotation.mockRejectedValue("string error from server");

    const user = userEvent.setup();
    render(
      <AnnotationToolbar {...BASE_PROPS} existingAnnotation={EXISTING} />,
    );

    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() =>
      expect(screen.getByText("Delete failed. Please try again.")).toBeInTheDocument(),
    );
  });

  it("shows error.message when Error is thrown during delete", async () => {
    mockDeleteAnnotation.mockRejectedValue(new Error("Cannot delete — server error"));

    const user = userEvent.setup();
    render(
      <AnnotationToolbar {...BASE_PROPS} existingAnnotation={EXISTING} />,
    );

    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() =>
      expect(screen.getByText("Cannot delete — server error")).toBeInTheDocument(),
    );
  });

  it("shows deleting indicator while delete is in progress", async () => {
    let resolveDelete: (v: unknown) => void = () => {};
    mockDeleteAnnotation.mockReturnValue(new Promise((res) => { resolveDelete = res; }));

    const user = userEvent.setup();
    render(
      <AnnotationToolbar {...BASE_PROPS} existingAnnotation={EXISTING} />,
    );

    await user.click(screen.getByRole("button", { name: /delete/i }));

    // During delete "…" is shown
    expect(screen.getByText("…")).toBeInTheDocument();

    resolveDelete({ ok: true });
  });
});

// ── handleDelete early return when no existingAnnotation ─────────────────────

describe("AnnotationToolbar — handleDelete no-op without existingAnnotation", () => {
  it("does not call deleteAnnotation when existingAnnotation is not provided", async () => {
    // There's no delete button when existingAnnotation is absent — but we cover
    // the early return guard by ensuring the delete function path is never reached.
    render(<AnnotationToolbar {...BASE_PROPS} />);

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(mockDeleteAnnotation).not.toHaveBeenCalled();
  });
});

// ── Color picker selection ────────────────────────────────────────────────────

describe("AnnotationToolbar — color picker", () => {
  it("selects yellow by default", () => {
    render(<AnnotationToolbar {...BASE_PROPS} />);

    const yellowBtn = screen.getByLabelText("Yellow");
    // Default selected color = yellow → scale-110 class
    expect(yellowBtn.className).toMatch(/scale-110/);
  });

  it("switches selected color when a different color is clicked", async () => {
    const user = userEvent.setup();
    render(<AnnotationToolbar {...BASE_PROPS} />);

    await user.click(screen.getByLabelText("Pink"));

    const pinkBtn = screen.getByLabelText("Pink");
    expect(pinkBtn.className).toMatch(/scale-110/);

    const yellowBtn = screen.getByLabelText("Yellow");
    expect(yellowBtn.className).not.toMatch(/scale-110/);
  });
});
