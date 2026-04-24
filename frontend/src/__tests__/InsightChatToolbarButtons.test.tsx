/**
 * Regression tests for issue #573 — InsightChat toolbar buttons missing
 * aria-label, below 44px touch target, and using inline SVG.
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "test insight" }),
  askQuestion: jest.fn(),
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

describe("InsightChat toolbar — font size button (#573)", () => {
  it("has aria-label", async () => {
    render(<InsightChat {...BASE_PROPS} />);
    await act(async () => await flushPromises());

    const btn = screen.getByRole("button", { name: /font size/i });
    expect(btn).toBeInTheDocument();
  });

  it("has min-h-[44px] min-w-[44px] touch target", async () => {
    render(<InsightChat {...BASE_PROPS} />);
    await act(async () => await flushPromises());

    const btn = screen.getByRole("button", { name: /font size/i });
    expect(btn.className).toContain("min-h-[44px]");
    expect(btn.className).toContain("min-w-[44px]");
  });
});

describe("InsightChat toolbar — refresh button (#573)", () => {
  it("has aria-label", async () => {
    render(<InsightChat {...BASE_PROPS} />);
    await act(async () => await flushPromises());

    const btn = screen.getByRole("button", { name: /insight/i });
    expect(btn).toBeInTheDocument();
  });

  it("has min-h-[44px] min-w-[44px] touch target", async () => {
    render(<InsightChat {...BASE_PROPS} />);
    await act(async () => await flushPromises());

    const btn = screen.getByRole("button", { name: /insight/i });
    expect(btn.className).toContain("min-h-[44px]");
    expect(btn.className).toContain("min-w-[44px]");
  });

  it("does not use inline SVG — icon comes from Icons.tsx (has aria-hidden svg)", async () => {
    const { container } = render(<InsightChat {...BASE_PROPS} />);
    await act(async () => await flushPromises());

    const refreshBtn = screen.getByRole("button", { name: /insight/i });
    const svg = refreshBtn.querySelector("svg");
    // SVG from Icons.tsx always has aria-hidden="true"
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });
});
