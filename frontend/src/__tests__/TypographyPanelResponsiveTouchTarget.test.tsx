/**
 * Regression test for #2130 — TypographyPanel segmented controls must use
 * min-h-[44px] md:min-h-0 so desktop chrome stays compact.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import TypographyPanel from "@/components/TypographyPanel";
import type { FontSize, LineHeight, ContentWidth, FontFamily } from "@/lib/settings";

jest.mock("@/lib/settings", () => ({
  saveSettings: jest.fn(),
}));

const DEFAULT_PROPS = {
  fontSize: "base" as FontSize,
  lineHeight: "normal" as LineHeight,
  contentWidth: "normal" as ContentWidth,
  fontFamily: "serif" as FontFamily,
  paragraphFocus: false,
  onFontSize: jest.fn(),
  onLineHeight: jest.fn(),
  onContentWidth: jest.fn(),
  onFontFamily: jest.fn(),
  onParagraphFocus: jest.fn(),
  onClose: jest.fn(),
};

test("SegmentedControl buttons include md:min-h-0 for compact desktop size", () => {
  const { container } = render(<TypographyPanel {...DEFAULT_PROPS} />);
  const segmentBtns = Array.from(container.querySelectorAll("button")).filter(
    (btn) => btn.classList.contains("flex-1") && !btn.hasAttribute("role"),
  );
  expect(segmentBtns.length).toBeGreaterThan(0);
  segmentBtns.forEach((btn) => {
    expect(btn.className).toContain("md:min-h-0");
  });
});

test("paragraph focus toggle includes md:min-h-0 and md:min-w-0", () => {
  render(<TypographyPanel {...DEFAULT_PROPS} />);
  const toggle = screen.getByRole("switch", { name: /paragraph focus/i });
  expect(toggle.className).toContain("md:min-h-0");
  expect(toggle.className).toContain("md:min-w-0");
});
