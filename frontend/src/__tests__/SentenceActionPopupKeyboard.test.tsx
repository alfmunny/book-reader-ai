/**
 * Regression test for #2468: SentenceActionPopup role="toolbar" must implement
 * roving tabindex and arrow-key navigation per ARIA APG toolbar pattern.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SentenceActionPopup from "@/components/SentenceActionPopup";

const BASE_PROPS = {
  sentenceText: "Call me Ishmael.",
  position: { x: 200, y: 200 },
  onRead: jest.fn(),
  onNote: jest.fn(),
  onChat: jest.fn(),
  onClose: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("SentenceActionPopup toolbar — roving tabindex (closes #2468)", () => {
  it("only the first (Read) button is in the tab sequence initially", () => {
    render(<SentenceActionPopup {...BASE_PROPS} />);
    const read = screen.getByRole("button", { name: /Read/i });
    const note = screen.getByRole("button", { name: /Note/i });
    const chat = screen.getByRole("button", { name: /Chat/i });
    expect(read).toHaveAttribute("tabindex", "0");
    expect(note).toHaveAttribute("tabindex", "-1");
    expect(chat).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowRight moves focus from Read → Note", async () => {
    const user = userEvent.setup();
    render(<SentenceActionPopup {...BASE_PROPS} />);
    const read = screen.getByRole("button", { name: /Read/i });
    read.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /Note/i })).toHaveFocus();
  });

  it("ArrowRight wraps from last item → first item", async () => {
    const user = userEvent.setup();
    render(<SentenceActionPopup {...BASE_PROPS} />);
    const chat = screen.getByRole("button", { name: /Chat/i });
    chat.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /Read/i })).toHaveFocus();
  });

  it("ArrowLeft moves focus from Note → Read", async () => {
    const user = userEvent.setup();
    render(<SentenceActionPopup {...BASE_PROPS} />);
    const note = screen.getByRole("button", { name: /Note/i });
    note.focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /Read/i })).toHaveFocus();
  });

  it("ArrowLeft wraps from first item → last item", async () => {
    const user = userEvent.setup();
    render(<SentenceActionPopup {...BASE_PROPS} />);
    const read = screen.getByRole("button", { name: /Read/i });
    read.focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /Chat/i })).toHaveFocus();
  });
});
