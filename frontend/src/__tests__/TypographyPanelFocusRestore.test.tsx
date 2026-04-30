/**
 * Regression test for #2475: TypographyPanel must restore focus to the
 * previously-focused element when it unmounts (WCAG 2.4.3 Focus Order).
 *
 * Scenario: user tabs into the panel, then presses Escape. Focus should
 * return to the element that was focused before the panel opened.
 */
import React from "react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TypographyPanel from "@/components/TypographyPanel";

const BASE_PROPS = {
  fontSize: "base" as const,
  lineHeight: "normal" as const,
  contentWidth: "normal" as const,
  fontFamily: "serif" as const,
  paragraphFocus: false,
  onFontSize: jest.fn(),
  onLineHeight: jest.fn(),
  onContentWidth: jest.fn(),
  onFontFamily: jest.fn(),
  onParagraphFocus: jest.fn(),
  onClose: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe("TypographyPanel focus restoration (closes #2475)", () => {
  it("restores focus to the previously-focused element when the panel unmounts after user tabs in", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Typography settings";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount, container } = render(<TypographyPanel {...BASE_PROPS} />);

    // Simulate user tabbing into the panel (focus moves to a button inside it)
    const firstPanelBtn = container.querySelector<HTMLButtonElement>("button");
    firstPanelBtn?.focus();
    expect(document.activeElement).toBe(firstPanelBtn);
    expect(document.activeElement).not.toBe(trigger);

    // Panel unmounts (e.g., user pressed Escape which called onClose → parent removes panel)
    unmount();

    // Focus MUST return to the trigger
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });
});
