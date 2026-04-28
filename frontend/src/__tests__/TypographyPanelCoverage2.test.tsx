/**
 * Coverage tests for components/TypographyPanel.tsx — functions not covered by existing tests.
 * Closes #1989 — targets: onKey function (line 105) — the Escape keydown handler that
 * the existing EscapeDismiss test only checks via static source inspection, never fires.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import TypographyPanel from "@/components/TypographyPanel";

jest.mock("@/lib/settings", () => ({
  saveSettings: jest.fn(),
}));

const DEFAULT_PROPS = {
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

afterEach(() => jest.clearAllMocks());

test("pressing Escape calls onClose via the document keydown listener", () => {
  render(<TypographyPanel {...DEFAULT_PROPS} />);

  fireEvent.keyDown(document, { key: "Escape" });

  expect(DEFAULT_PROPS.onClose).toHaveBeenCalledTimes(1);
});

test("pressing a non-Escape key does not call onClose", () => {
  render(<TypographyPanel {...DEFAULT_PROPS} />);

  fireEvent.keyDown(document, { key: "Enter" });

  expect(DEFAULT_PROPS.onClose).not.toHaveBeenCalled();
});
