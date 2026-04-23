/**
 * Regression test for #598: SegmentedControl buttons in TypographyPanel
 * must meet the 44px minimum touch target requirement.
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

describe("TypographyPanel — touch targets (#598)", () => {
  it("SegmentedControl buttons have min-h-[44px] class for touch target compliance", () => {
    const { container } = render(<TypographyPanel {...DEFAULT_PROPS} />);

    // Find all segmented control buttons (S, M, L, XL, Serif, Sans, Tight, etc.)
    const segmentBtns = Array.from(container.querySelectorAll("button")).filter(
      (btn) =>
        btn.classList.contains("flex-1") &&
        !btn.hasAttribute("role") // exclude the toggle switch
    );

    expect(segmentBtns.length).toBeGreaterThan(0);
    segmentBtns.forEach((btn) => {
      expect(btn.className).toContain("min-h-[44px]");
    });
  });

  it("all four control groups have accessible touch targets", () => {
    render(<TypographyPanel {...DEFAULT_PROPS} />);

    // All segmented buttons should be accessible
    ["S", "M", "L", "XL", "Serif", "Sans", "Tight", "Relaxed", "Narrow", "Wide"].forEach(
      (label) => {
        const btn = screen.getByText(label);
        expect(btn.className).toContain("min-h-[44px]");
      }
    );
  });
});
