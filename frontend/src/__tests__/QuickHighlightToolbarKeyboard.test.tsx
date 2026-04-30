/**
 * Regression test for #2461: QuickHighlightPanel role="toolbar" must implement
 * roving tabindex and arrow-key navigation per ARIA APG toolbar pattern.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/lib/api", () => ({
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

import QuickHighlightPanel from "@/components/QuickHighlightPanel";

const BASE_PROPS = {
  sentenceText: "Call me Ishmael.",
  chapterIndex: 0,
  bookId: 10,
  position: { x: 200, y: 200 },
  onClose: jest.fn(),
  onSaved: jest.fn(),
  onDeleted: jest.fn(),
  onOpenNote: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("QuickHighlightPanel toolbar — roving tabindex (closes #2461)", () => {
  it("only the first (Yellow) color button is in the tab sequence initially", () => {
    render(<QuickHighlightPanel {...BASE_PROPS} />);
    const yellow = screen.getByRole("button", { name: "Yellow" });
    const blue   = screen.getByRole("button", { name: "Blue" });
    const green  = screen.getByRole("button", { name: "Green" });
    const pink   = screen.getByRole("button", { name: "Pink" });
    expect(yellow).toHaveAttribute("tabindex", "0");
    expect(blue).toHaveAttribute("tabindex", "-1");
    expect(green).toHaveAttribute("tabindex", "-1");
    expect(pink).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowRight moves focus from Yellow → Blue", async () => {
    const user = userEvent.setup();
    render(<QuickHighlightPanel {...BASE_PROPS} />);
    const yellow = screen.getByRole("button", { name: "Yellow" });
    yellow.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Blue" })).toHaveFocus();
  });

  it("ArrowRight wraps from last item → first item", async () => {
    const user = userEvent.setup();
    // Without existingAnnotation and with onOpenNote, last item is Note (5th)
    render(<QuickHighlightPanel {...BASE_PROPS} />);
    // Focus the Note button (last item) and press ArrowRight
    const noteBtn = screen.getByRole("button", { name: "Add note" });
    noteBtn.focus();
    await user.keyboard("{ArrowRight}");
    // Should wrap back to first (Yellow)
    expect(screen.getByRole("button", { name: "Yellow" })).toHaveFocus();
  });

  it("ArrowLeft moves focus from Blue → Yellow", async () => {
    const user = userEvent.setup();
    render(<QuickHighlightPanel {...BASE_PROPS} />);
    const blue = screen.getByRole("button", { name: "Blue" });
    blue.focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "Yellow" })).toHaveFocus();
  });

  it("ArrowLeft wraps from first item → last item", async () => {
    const user = userEvent.setup();
    render(<QuickHighlightPanel {...BASE_PROPS} />);
    const yellow = screen.getByRole("button", { name: "Yellow" });
    yellow.focus();
    await user.keyboard("{ArrowLeft}");
    // Should wrap to Note button (last item when onOpenNote is present)
    expect(screen.getByRole("button", { name: "Add note" })).toHaveFocus();
  });
});
