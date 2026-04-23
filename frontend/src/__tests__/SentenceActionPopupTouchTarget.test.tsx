/**
 * Regression test for #607: SentenceActionPopup buttons must have
 * min-h-[44px] touch targets.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import SentenceActionPopup from "@/components/SentenceActionPopup";

const BASE_PROPS = {
  sentenceText: "It is a truth universally acknowledged.",
  position: { x: 200, y: 300 },
  onRead: jest.fn(),
  onClose: jest.fn(),
  onNote: jest.fn(),
  onChat: jest.fn(),
};

describe("SentenceActionPopup — touch targets (#607)", () => {
  it("Read button meets 44px minimum touch target", () => {
    render(<SentenceActionPopup {...BASE_PROPS} />);
    const btn = screen.getByRole("button", { name: /read/i });
    expect(btn.className).toContain("min-h-[44px]");
  });

  it("Note button meets 44px minimum touch target", () => {
    render(<SentenceActionPopup {...BASE_PROPS} />);
    const btn = screen.getByRole("button", { name: /note/i });
    expect(btn.className).toContain("min-h-[44px]");
  });

  it("Chat button meets 44px minimum touch target", () => {
    render(<SentenceActionPopup {...BASE_PROPS} />);
    const btn = screen.getByRole("button", { name: /chat/i });
    expect(btn.className).toContain("min-h-[44px]");
  });
});
