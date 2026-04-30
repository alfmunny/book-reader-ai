/**
 * Regression test for #2459: AnnotationToolbar color picker (role="radiogroup")
 * must implement roving tabindex + arrow-key navigation per ARIA APG.
 *
 * Before fix: all 4 color buttons are individually tabbable (tabIndex omitted = 0),
 * no arrow-key handlers. After fix: only selected color is tabIndex=0, arrow keys
 * move focus + selection within the group.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AnnotationToolbar color picker — roving tabindex (closes #2459)", () => {
  it("only the selected (Yellow) color button is in the tab sequence initially", () => {
    render(<AnnotationToolbar {...BASE_PROPS} />);
    const yellow = screen.getByRole("radio", { name: "Yellow" });
    const blue   = screen.getByRole("radio", { name: "Blue" });
    const green  = screen.getByRole("radio", { name: "Green" });
    const pink   = screen.getByRole("radio", { name: "Pink" });
    expect(yellow).toHaveAttribute("tabindex", "0");
    expect(blue).toHaveAttribute("tabindex", "-1");
    expect(green).toHaveAttribute("tabindex", "-1");
    expect(pink).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowRight moves focus and selection from Yellow → Blue", async () => {
    const user = userEvent.setup();
    render(<AnnotationToolbar {...BASE_PROPS} />);
    const yellow = screen.getByRole("radio", { name: "Yellow" });
    yellow.focus();
    await user.keyboard("{ArrowRight}");
    const blue = screen.getByRole("radio", { name: "Blue" });
    expect(blue).toHaveFocus();
    expect(blue).toHaveAttribute("aria-checked", "true");
    expect(yellow).toHaveAttribute("aria-checked", "false");
  });

  it("ArrowRight wraps from Pink → Yellow", async () => {
    const user = userEvent.setup();
    render(<AnnotationToolbar {...BASE_PROPS} />);
    // Select Pink first by clicking it
    await user.click(screen.getByRole("radio", { name: "Pink" }));
    const pink = screen.getByRole("radio", { name: "Pink" });
    pink.focus();
    await user.keyboard("{ArrowRight}");
    const yellow = screen.getByRole("radio", { name: "Yellow" });
    expect(yellow).toHaveFocus();
    expect(yellow).toHaveAttribute("aria-checked", "true");
  });

  it("ArrowLeft moves focus and selection from Blue → Yellow", async () => {
    const user = userEvent.setup();
    render(<AnnotationToolbar {...BASE_PROPS} />);
    await user.click(screen.getByRole("radio", { name: "Blue" }));
    const blue = screen.getByRole("radio", { name: "Blue" });
    blue.focus();
    await user.keyboard("{ArrowLeft}");
    const yellow = screen.getByRole("radio", { name: "Yellow" });
    expect(yellow).toHaveFocus();
    expect(yellow).toHaveAttribute("aria-checked", "true");
  });

  it("ArrowLeft wraps from Yellow → Pink", async () => {
    const user = userEvent.setup();
    render(<AnnotationToolbar {...BASE_PROPS} />);
    const yellow = screen.getByRole("radio", { name: "Yellow" });
    yellow.focus();
    await user.keyboard("{ArrowLeft}");
    const pink = screen.getByRole("radio", { name: "Pink" });
    expect(pink).toHaveFocus();
    expect(pink).toHaveAttribute("aria-checked", "true");
  });

  it("ArrowDown moves focus like ArrowRight", async () => {
    const user = userEvent.setup();
    render(<AnnotationToolbar {...BASE_PROPS} />);
    const yellow = screen.getByRole("radio", { name: "Yellow" });
    yellow.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Blue" })).toHaveFocus();
  });

  it("ArrowUp moves focus like ArrowLeft", async () => {
    const user = userEvent.setup();
    render(<AnnotationToolbar {...BASE_PROPS} />);
    const yellow = screen.getByRole("radio", { name: "Yellow" });
    yellow.focus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("radio", { name: "Pink" })).toHaveFocus();
  });
});
