/**
 * Regression test for #2471: SentenceActionPopup must move focus to the first
 * toolbar button when it mounts, so keyboard users can reach it immediately
 * without tabbing through the entire page (WCAG 2.4.3 Focus Order).
 */
import React from "react";
import { render, screen } from "@testing-library/react";

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

describe("SentenceActionPopup focus-on-open (closes #2471)", () => {
  it("Read button receives focus immediately when panel mounts", () => {
    render(<SentenceActionPopup {...BASE_PROPS} />);
    expect(screen.getByRole("button", { name: /Read/i })).toHaveFocus();
  });

  it("focus lands on first button even when optional buttons are absent", () => {
    render(
      <SentenceActionPopup
        sentenceText="Hello."
        position={{ x: 100, y: 100 }}
        onRead={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /Read/i })).toHaveFocus();
  });
});
