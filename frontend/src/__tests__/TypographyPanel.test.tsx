import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import TypographyPanel from "@/components/TypographyPanel";
import * as settings from "@/lib/settings";

jest.mock("@/lib/settings", () => ({
  saveSettings: jest.fn(),
}));

const DEFAULT_PROPS = {
  fontSize: "base" as settings.FontSize,
  lineHeight: "normal" as settings.LineHeight,
  contentWidth: "normal" as settings.ContentWidth,
  fontFamily: "serif" as settings.FontFamily,
  paragraphFocus: false,
  onFontSize: jest.fn(),
  onLineHeight: jest.fn(),
  onContentWidth: jest.fn(),
  onFontFamily: jest.fn(),
  onParagraphFocus: jest.fn(),
  onClose: jest.fn(),
};

afterEach(() => jest.clearAllMocks());

describe("TypographyPanel", () => {
  it("renders the panel with all controls", () => {
    render(<TypographyPanel {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("typography-panel")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("XL")).toBeInTheDocument();
    expect(screen.getByText("Serif")).toBeInTheDocument();
    expect(screen.getByText("Sans")).toBeInTheDocument();
    expect(screen.getByText("Tight")).toBeInTheDocument();
    expect(screen.getAllByText("Normal")).toHaveLength(2); // line height + content width
    expect(screen.getByText("Relaxed")).toBeInTheDocument();
    expect(screen.getByText("Narrow")).toBeInTheDocument();
    expect(screen.getByText("Wide")).toBeInTheDocument();
    expect(screen.getByText("Paragraph focus")).toBeInTheDocument();
  });

  it("calls onFontSize and saveSettings when a size is clicked", () => {
    render(<TypographyPanel {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText("L"));
    expect(DEFAULT_PROPS.onFontSize).toHaveBeenCalledWith("lg");
    expect(settings.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ fontSize: "lg" }));
  });

  it("calls onLineHeight when spacing option is clicked", () => {
    render(<TypographyPanel {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText("Relaxed"));
    expect(DEFAULT_PROPS.onLineHeight).toHaveBeenCalledWith("relaxed");
    expect(settings.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ lineHeight: "relaxed" }));
  });

  it("calls onContentWidth when width option is clicked", () => {
    render(<TypographyPanel {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText("Wide"));
    expect(DEFAULT_PROPS.onContentWidth).toHaveBeenCalledWith("wide");
    expect(settings.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ contentWidth: "wide" }));
  });

  it("calls onFontFamily when font is clicked", () => {
    render(<TypographyPanel {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText("Sans"));
    expect(DEFAULT_PROPS.onFontFamily).toHaveBeenCalledWith("sans");
    expect(settings.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ fontFamily: "sans" }));
  });

  it("toggles paragraph focus and calls saveSettings", () => {
    render(<TypographyPanel {...DEFAULT_PROPS} />);
    const toggle = screen.getByRole("switch", { name: /paragraph focus/i });
    fireEvent.click(toggle);
    expect(DEFAULT_PROPS.onParagraphFocus).toHaveBeenCalledWith(true);
    expect(settings.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ paragraphFocus: true }));
  });

  it("shows paragraph focus as active when paragraphFocus=true", () => {
    render(<TypographyPanel {...DEFAULT_PROPS} paragraphFocus={true} />);
    const toggle = screen.getByRole("switch", { name: /paragraph focus/i });
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("calls onClose when clicking outside", () => {
    render(
      <div>
        <TypographyPanel {...DEFAULT_PROPS} />
        <div data-testid="outside">outside</div>
      </div>
    );
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside panel", () => {
    render(<TypographyPanel {...DEFAULT_PROPS} />);
    fireEvent.mouseDown(screen.getByTestId("typography-panel"));
    expect(DEFAULT_PROPS.onClose).not.toHaveBeenCalled();
  });
});
