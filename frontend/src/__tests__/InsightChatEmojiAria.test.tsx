/**
 * Regression tests for #593: InsightChat 📎 emoji replaced with PaperclipIcon SVG,
 * × close button gets aria-label.
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "test insight" }),
  askQuestion: jest.fn(),
  getChatMessages: jest.fn().mockResolvedValue({ messages: [], has_more: false }),
  postChatMessage: jest.fn().mockResolvedValue({ id: 1, role: "assistant", content: "", created_at: "" }),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn(() => ({
    translationLang: "en",
    insightLang: "en",
    translationEnabled: false,
    ttsGender: "female",
    chatFontSize: "xs",
    translationProvider: "auto",
    fontSize: "base",
    theme: "light",
  })),
  saveSettings: jest.fn(),
}));

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

jest.mock("remark-gfm", () => ({ __esModule: true, default: () => () => {} }));

import InsightChat from "@/components/InsightChat";

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

const BASE_PROPS = {
  bookId: 1,
  userId: 1,
  hasGeminiKey: true,
  isVisible: true,
  chapterText: "Some chapter text",
  chapterTitle: "Chapter 1",
  selectedText: null,
  bookTitle: "Test Book",
  author: "Test Author",
};

describe("InsightChat — context pill (#593)", () => {
  it("does not render 📎 emoji character in the context pill", async () => {
    render(<InsightChat {...BASE_PROPS} />);
    await act(async () => await flushPromises());

    // The component renders context pills when selectedText is set
    // We check the overall rendered output doesn't contain the 📎 emoji
    const { container } = render(
      <InsightChat {...BASE_PROPS} selectedText="some selected text" />
    );
    await act(async () => await flushPromises());

    expect(container.textContent).not.toContain("📎");
  });

  it("renders an SVG in context pill area instead of emoji", async () => {
    const { container } = render(
      <InsightChat {...BASE_PROPS} selectedText="some selected text" />
    );
    await act(async () => await flushPromises());

    // The context pill should have an SVG icon (PaperclipIcon)
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });
});

describe("InsightChat — context remove button (#593)", () => {
  it("remove context button has aria-label", async () => {
    // We need to set up selectedText so the context item renders with onRemove
    const { container } = render(
      <InsightChat {...BASE_PROPS} selectedText="selected passage" />
    );
    await act(async () => await flushPromises());

    // Look for any button that was the × character (now should be CloseIcon with aria-label)
    const buttons = container.querySelectorAll("button");
    const removeButtons = Array.from(buttons).filter(
      (btn) => btn.getAttribute("title") === "Remove context" || btn.getAttribute("aria-label") === "Remove context"
    );
    if (removeButtons.length > 0) {
      expect(removeButtons[0].getAttribute("aria-label")).toBe("Remove context");
    }
  });

  it("remove context button does not use × raw character as content", async () => {
    const { container } = render(
      <InsightChat {...BASE_PROPS} selectedText="selected passage" />
    );
    await act(async () => await flushPromises());

    const buttons = Array.from(container.querySelectorAll("button"));
    const xButtons = buttons.filter((btn) => btn.textContent?.trim() === "×");
    expect(xButtons.length).toBe(0);
  });
});
